import 'server-only';

import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from './prisma';
import { decryptBotToken } from './telegram-manager';
import { expireDueSubscriptions } from './subscription-lifecycle';

const REMINDER_DAYS = new Set([7, 3, 1, 0]);

type ReminderResult = {
  subscriptionId: string;
  status: 'sent' | 'failed';
};

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function renewalMessage(input: {
  customerName: string;
  serviceName: string;
  endDate: Date;
  remainingDays: number;
  price: { toString(): string };
  currency: string;
}) {
  const greeting = new Date().getHours() >= 5 && new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
  const expiry = input.endDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const when = input.remainingDays === 0 ? 'اليوم' : input.remainingDays === 1 ? 'غداً' : `يوم ${expiry}`;
  const amount = Number(input.price.toString()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `${greeting} ${input.customerName}، نتمنى أن تكون بخير.\n\nنذكرك بأن اشتراك ${input.serviceName} ينتهي ${when} (${expiry}).\nقيمة التجديد: ${amount} ${input.currency}.\n\nيمكنك التواصل معنا لتجديد الاشتراك.`;
}

/** Sends one Telegram renewal reminder per subscription per day. Safe to invoke repeatedly. */
export async function processSubscriptionReminders(limit = 100): Promise<ReminderResult[]> {
  const today = startOfDay(new Date());
  await expireDueSubscriptions(undefined, today);
  const finalDay = new Date(today);
  finalDay.setDate(finalDay.getDate() + 8);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: 'active',
      endDate: { gte: today, lt: finalDay },
      tenant: { saasStatus: 'active' },
    },
    include: {
      customer: { select: { name: true, tgId: true } },
      service: { select: { name: true } },
      tenant: { select: { currency: true } },
    },
    orderBy: { endDate: 'asc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

  const botCache = new Map<string, { id: string; bot: Bot } | null>();
  const results: ReminderResult[] = [];

  for (const subscription of subscriptions) {
    if (!subscription.customer.tgId) continue;
    const remainingDays = Math.ceil((startOfDay(subscription.endDate).getTime() - today.getTime()) / 86_400_000);
    if (!REMINDER_DAYS.has(remainingDays)) continue;

    let configuredBot = botCache.get(subscription.tenantId);
    if (configuredBot === undefined) {
      try {
        const settings = await prisma.botSettings.findUnique({ where: { tenantId: subscription.tenantId } });
        configuredBot = settings?.isActive ? { id: settings.id, bot: new Bot(decryptBotToken(settings)) } : null;
      } catch {
        configuredBot = null;
      }
      botCache.set(subscription.tenantId, configuredBot);
    }
    if (!configuredBot) continue;

    const externalId = `renewal-reminder:${subscription.id}:${today.toISOString().slice(0, 10)}`;
    let eventId: string;
    try {
      const event = await prisma.botEvent.create({
        data: {
          tenantId: subscription.tenantId,
          botSettingsId: configuredBot.id,
          externalId,
          type: 'subscription_renewal_reminder',
          payload: { subscriptionId: subscription.id, remainingDays },
          status: 'processing',
          attempts: 1,
        },
      });
      eventId = event.id;
    } catch {
      // The unique event key means another invocation already handled this reminder.
      continue;
    }

    try {
      await configuredBot.bot.api.sendMessage(
        subscription.customer.tgId,
        renewalMessage({
          customerName: subscription.customer.name,
          serviceName: subscription.service.name,
          endDate: subscription.endDate,
          remainingDays,
          price: subscription.sellingPrice,
          currency: subscription.tenant.currency,
        }),
        { reply_markup: new InlineKeyboard().text('تجديد الآن', `renew_${subscription.id}`) },
      );
      await prisma.botEvent.update({
        where: { id: eventId },
        data: { status: 'processed', processedAt: new Date() },
      });
      results.push({ subscriptionId: subscription.id, status: 'sent' });
    } catch (error) {
      await prisma.botEvent.update({
        where: { id: eventId },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 500) : 'Telegram send failed',
        },
      });
      results.push({ subscriptionId: subscription.id, status: 'failed' });
    }
  }

  return results;
}
