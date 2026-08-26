import 'server-only';

import { Bot, Context, InlineKeyboard, Keyboard } from 'grammy';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from './prisma';
import { createPaymentRequest, walletTransactionHelpers } from './wallet';
import { decryptSecret } from './security';
import { money } from './money';
import { registerCommerceBotFeatures } from './bot-commerce';
import { captureNextOrderField, createPaidOrderInTransaction } from './order-fulfillment';
import { showOrdersInBot } from './bot-orders';
import { BOT_ORDER_FLOW_COPY } from './bot-copy';
import { expireDueSubscriptions } from './subscription-lifecycle';

declare global {
  var telegramBotCache: Map<string, Bot> | undefined;
}

const botCache = globalThis.telegramBotCache ??= new Map<string, Bot>();

type WarrantyDraft = { subscriptionId: string; expiresAt: number };
declare global { var telegramWarrantyDrafts: Map<string, WarrantyDraft> | undefined; }
const warrantyDrafts = globalThis.telegramWarrantyDrafts ??= new Map<string, WarrantyDraft>();

function warrantyDraftKey(tenantId: string, customerId: string) {
  return `${tenantId}:${customerId}`;
}

type CustomerView = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  walletBalance: Prisma.Decimal;
};

type PaymentMenu = {
  vodafoneNumber?: string;
  instapayAddress?: string;
  rechargeAmounts?: number[];
};

function paymentMenu(value: unknown): PaymentMenu {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const config = value as Record<string, unknown>;
  return {
    vodafoneNumber: typeof config.vodafoneNumber === 'string' ? config.vodafoneNumber : undefined,
    instapayAddress: typeof config.instapayAddress === 'string' ? config.instapayAddress : undefined,
    rechargeAmounts: Array.isArray(config.rechargeAmounts)
      ? config.rechargeAmounts.map(Number).filter((amount) => amount > 0).slice(0, 8)
      : undefined,
  };
}

function customerName(ctx: Context) {
  const first = ctx.from?.first_name?.trim() || 'عميلنا';
  const last = ctx.from?.last_name?.trim();
  return last ? `${first} ${last}` : first;
}

function normalizeTelegramPhone(input: string) {
  let phone = input.replace(/[^0-9+]/g, '');
  if (phone.startsWith('+20')) phone = '0' + phone.slice(3);
  else if (phone.startsWith('20') && phone.length === 12) phone = '0' + phone.slice(2);
  if (!phone.startsWith('0') && /^1[0125]/.test(phone)) phone = '0' + phone;
  return phone;
}

async function capturePaymentProof(
  ctx: Context,
  tenantId: string,
  proof: { transactionId?: string; telegramFileId?: string },
) {
  const tgId = ctx.from ? String(ctx.from.id) : null;
  if (!tgId || (!proof.transactionId && !proof.telegramFileId)) return false;

  const customer = await prisma.customer.findFirst({
    where: { tenantId, tgId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) return false;

  const request = await prisma.paymentRequest.findFirst({
    where: {
      tenantId,
      customerId: customer.id,
      status: 'pending',
      expiresAt: { gt: new Date() },
      notes: { in: ['customer_confirmed_transfer', 'payment_proof_received'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!request) return false;

  await prisma.paymentRequest.update({
    where: { id: request.id },
    data: {
      ...(proof.transactionId ? { transactionId: proof.transactionId.slice(0, 100) } : {}),
      ...(proof.telegramFileId ? { screenshotUrl: `telegram-file:${proof.telegramFileId}` } : {}),
      notes: 'payment_proof_received',
    },
  });
  await ctx.reply('تم استلام بيانات التحويل وإرسالها للتاجر للمراجعة. سنبلغك فور اعتماد الشحن.');
  return true;
}
async function editOrReply(ctx: Context, text: string, keyboard?: InlineKeyboard) {
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, keyboard ? { reply_markup: keyboard } : undefined);
    await ctx.answerCallbackQuery().catch(() => undefined);
  } else {
    await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
  }
}

async function showIssueSubscriptions(ctx: Context, customer: CustomerView, tenantId: string) {
  await expireDueSubscriptions(tenantId);
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId, customerId: customer.id, status: { in: ['active', 'expiring_soon'] }, endDate: { gt: new Date() } },
    select: { id: true, endDate: true, service: { select: { name: true } }, servicePlan: { select: { name: true } } },
    orderBy: { endDate: 'asc' }, take: 50,
  });
  const keyboard = new InlineKeyboard();
  subscriptions.forEach((item) => keyboard.text(`${item.service.name}${item.servicePlan?.name ? ` | ${item.servicePlan.name}` : ''}`, `issue_sub_${item.id}`).row());
  keyboard.text('العودة للقائمة', 'menu');
  await editOrReply(ctx, subscriptions.length ? 'اختر الاشتراك الذي تواجه فيه مشكلة، ثم اكتب وصفاً مختصراً للمشكلة.' : 'لا توجد اشتراكات نشطة يمكن فتح بلاغ لها حالياً.', keyboard);
}

async function beginWarrantyReport(ctx: Context, customer: CustomerView, tenantId: string, subscriptionId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, tenantId, customerId: customer.id, status: { in: ['active', 'expiring_soon'] }, endDate: { gt: new Date() } },
    select: { id: true, service: { select: { name: true } } },
  });
  if (!subscription) throw new Error('هذا الاشتراك غير متاح لفتح بلاغ.');
  warrantyDrafts.set(warrantyDraftKey(tenantId, customer.id), { subscriptionId: subscription.id, expiresAt: Date.now() + 30 * 60 * 1000 });
  await editOrReply(ctx, `اكتب الآن وصف المشكلة في اشتراك ${subscription.service.name}. اذكر ما الذي حدث أو رسالة الخطأ إن وجدت.`);
}

async function captureWarrantyReport(ctx: Context, customer: CustomerView, tenantId: string, message: string) {
  const key = warrantyDraftKey(tenantId, customer.id);
  const draft = warrantyDrafts.get(key);
  if (!draft) return false;
  if (draft.expiresAt <= Date.now()) {
    warrantyDrafts.delete(key);
    await ctx.reply('انتهت مهلة البلاغ. اختر الاشتراك من جديد من قائمة الإبلاغ عن مشكلة.');
    return true;
  }
  const problem = message.trim().slice(0, 2000);
  if (problem.length < 3) {
    await ctx.reply('اكتب وصفاً أوضح للمشكلة، ثلاثة أحرف على الأقل.');
    return true;
  }
  const subscription = await prisma.subscription.findFirst({
    where: { id: draft.subscriptionId, tenantId, customerId: customer.id, status: { in: ['active', 'expiring_soon'] }, endDate: { gt: new Date() } },
    select: { id: true, order: { select: { id: true } }, accountDelivered: { select: { id: true } }, service: { select: { name: true } } },
  });
  if (!subscription) {
    warrantyDrafts.delete(key);
    await ctx.reply('لم يعد هذا الاشتراك متاحاً. اختر اشتراكاً آخر من القائمة.');
    return true;
  }
  const number = `WAR-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
  const record = await prisma.warrantyCase.create({
    data: {
      tenantId, customerId: customer.id, subscriptionId: subscription.id, orderId: subscription.order?.id, accountPoolId: subscription.accountDelivered?.id,
      number, status: 'new', priority: 'normal', problem,
      events: { create: { tenantId, type: 'opened_by_customer', message: 'تم فتح البلاغ من بوت تيليجرام بواسطة العميل.' } },
    },
    select: { number: true },
  });
  await prisma.customerActivity.create({ data: { tenantId, customerId: customer.id, type: 'warranty_report', title: 'بلاغ مشكلة عبر البوت', details: `${subscription.service.name}: ${problem}`, metadata: { warrantyNumber: record.number, subscriptionId: subscription.id } } });
  warrantyDrafts.delete(key);
  await ctx.reply(`تم استلام بلاغك رقم ${record.number} بخصوص ${subscription.service.name}. سيتابعه فريق الدعم ويصلك تحديث هنا.`, { reply_markup: new InlineKeyboard().text('العودة للقائمة', 'menu') });
  return true;
}
export function getBotInstance(botToken: string, tenantId: string): Bot {
  const cacheKey = `${tenantId}:${botToken}`;
  const cached = botCache.get(cacheKey);
  if (cached) return cached;

  const bot = new Bot(botToken);
  registerCommerceBotFeatures(bot, tenantId);

  bot.command('start', async (ctx) => {
    try {
      const tgId = String(ctx.from!.id);
      const customer = await prisma.customer.findFirst({
        where: { tenantId, tgId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          name: true,
          phone: true,
          walletBalance: true,
          tgUsername: true,
        },
      });

      if (!customer) {
        const keyboard = new Keyboard()
          .requestContact('مشاركة رقم هاتفي لتفعيل الحساب')
          .oneTime()
          .resized();
        const settings = await prisma.botSettings.findUnique({
          where: { tenantId },
          select: { welcomeMsg: true },
        });
        await ctx.reply(
          `${settings?.welcomeMsg || 'مرحباً بك في متجرنا.'}\n\nشارك رقم هاتفك من الزر التالي لربط حسابك بأمان.`,
          { reply_markup: keyboard },
        );
        return;
      }

      const username = ctx.from!.username || null;
      if (customer.tgUsername !== username) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { tgUsername: username },
        });
      }
      await showMainMenu(ctx, customer, tenantId);
    } catch (error) {
      console.error('telegram start failed', error);
      await ctx.reply('تعذر تشغيل البوت الآن. حاول مرة أخرى بعد قليل.');
    }
  });

  bot.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from!.id) {
      await ctx.reply('لأمان حسابك، استخدم زر مشاركة رقم هاتفي ولا ترسل جهة اتصال أخرى.');
      return;
    }

    try {
      const tgId = String(ctx.from!.id);
      const phone = normalizeTelegramPhone(contact.phone_number);
      const existingTelegram = await prisma.customer.findFirst({
        where: { tenantId, tgId, deletedAt: null },
        select: { id: true },
      });
      const phoneCustomer = await prisma.customer.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ phone }, { phone: { endsWith: phone.slice(-10) } }],
        },
      });

      if (existingTelegram && phoneCustomer && existingTelegram.id !== phoneCustomer.id) {
        throw new Error('حساب تيليجرام هذا مرتبط بعميل آخر');
      }
      if (phoneCustomer?.tgId && phoneCustomer.tgId !== tgId) {
        throw new Error('رقم الهاتف مرتبط بحساب تيليجرام آخر، تواصل مع الدعم');
      }

      const name = customerName(ctx);
      const customer = phoneCustomer
        ? await prisma.customer.update({
            where: { id: phoneCustomer.id },
            data: {
              phone,
              tgId,
              tgUsername: ctx.from!.username || null,
              consentAt: phoneCustomer.consentAt || new Date(),
              lastContactAt: new Date(),
            },
          })
        : await prisma.customer.create({
            data: {
              tenantId,
              name,
              phone,
              tgId,
              tgUsername: ctx.from!.username || null,
              source: 'telegram',
              stage: 'customer',
              consentAt: new Date(),
              lastContactAt: new Date(),
              createdBy: 'telegram_bot',
              activities: {
                create: {
                  tenantId,
                  type: 'telegram_link',
                  title: 'ربط العميل ببوت تيليجرام',
                },
              },
            },
          });

      await ctx.reply(`تم تفعيل حسابك بنجاح يا ${customer.name}.`, {
        reply_markup: { remove_keyboard: true },
      });
      await showMainMenu(ctx, customer, tenantId);
    } catch (error) {
      console.error('telegram contact link failed', error);
      await ctx.reply(error instanceof Error ? error.message : 'تعذر ربط الحساب، تواصل مع الدعم.');
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    try {
      const customer = await prisma.customer.findFirst({
        where: { tenantId, tgId: String(ctx.from!.id), deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          name: true,
          phone: true,
          walletBalance: true,
        },
      });
      if (!customer) {
        await ctx.answerCallbackQuery({
          text: 'اكتب /start أولاً لتفعيل حسابك.',
          show_alert: true,
        });
        return;
      }

      if (data === 'menu') await showMainMenu(ctx, customer, tenantId, true);
      else if (data === 'browse_services') await showServices(ctx, tenantId);
      else if (data === 'my_wallet') await showWallet(ctx, customer, tenantId);
      else if (data === 'my_subs') await showSubscriptions(ctx, customer, tenantId);
      else if (data === 'report_issue') await showIssueSubscriptions(ctx, customer, tenantId);
      else if (data.startsWith('issue_sub_')) await beginWarrantyReport(ctx, customer, tenantId, data.slice('issue_sub_'.length));
      else if (data === 'my_orders') await showOrdersInBot(ctx, customer, tenantId);
      else if (data.startsWith('cat_')) await showCategoryServices(ctx, tenantId, data.slice(4));
      else if (data.startsWith('srv_')) await showServiceDetails(ctx, tenantId, data.slice(4));
      else if (data.startsWith('plan_')) await showPlanDetails(ctx, tenantId, data.slice(5));
      else if (data.startsWith('buyplan_')) await processPlanPurchase(ctx, customer, tenantId, data.slice(8));
      else if (data.startsWith('renewplan_')) {
        const [subscriptionId, planId] = data.slice('renewplan_'.length).split('_');
        if (!subscriptionId || !planId) throw new Error('بيانات التجديد غير صالحة.');
        await processPlanPurchase(ctx, customer, tenantId, planId, subscriptionId);
      }
      else if (data.startsWith('renew_')) await showRenewalPlans(ctx, customer, tenantId, data.slice('renew_'.length));
      else if (data.startsWith('interest_')) await registerInterest(ctx, customer, tenantId, data.slice(9));
      else if (data.startsWith('buy_')) await processPurchase(ctx, customer, tenantId, data.slice(4));
      else if (data.startsWith('recharge_')) {
        await generateRechargeInstructions(ctx, customer, tenantId, Number(data.slice(9)));
      } else if (data.startsWith('transferred_')) {
        await handleTransferNotification(ctx, customer, tenantId, data.slice(12));
      } else if (data.startsWith('cancel_request_')) {
        await handleCancelRequest(ctx, customer, tenantId, data.slice(15));
      } else {
        await ctx.answerCallbackQuery({ text: 'الخيار غير معروف' });
      }
    } catch (error) {
      console.error('telegram callback failed', error);
      await ctx.answerCallbackQuery({
        text: error instanceof Error ? error.message.slice(0, 180) : 'حدث خطأ',
        show_alert: true,
      }).catch(() => undefined);
    }
  });

  bot.on('message:photo', async (ctx) => {
    const fileId = ctx.message.photo.at(-1)?.file_id;
    try {
      await capturePaymentProof(ctx, tenantId, { telegramFileId: fileId });
    } catch (error) {
      console.error('telegram receipt upload failed', error);
      await ctx.reply('تعذر حفظ الإيصال الآن. حاول مرة أخرى أو أرسل رقم العملية.');
    }
  });

  bot.on('message:document', async (ctx) => {
    try {
      await capturePaymentProof(ctx, tenantId, { telegramFileId: ctx.message.document.file_id });
    } catch (error) {
      console.error('telegram receipt document failed', error);
      await ctx.reply('تعذر حفظ الملف الآن. حاول مرة أخرى أو أرسل رقم العملية.');
    }
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text === '/start') return;
    try {
      const linkedCustomer = await prisma.customer.findFirst({
        where: { tenantId, tgId: String(ctx.from?.id || ''), deletedAt: null },
        select: { id: true },
      });
      const linkedCustomerDetails = linkedCustomer
        ? await prisma.customer.findFirst({ where: { id: linkedCustomer.id, tenantId, deletedAt: null }, select: { id: true, tenantId: true, name: true, phone: true, walletBalance: true } })
        : null;
      if (linkedCustomerDetails && await captureWarrantyReport(ctx, linkedCustomerDetails, tenantId, text)) return;
      const orderFlow = linkedCustomer
        ? await prisma.$transaction((tx) => captureNextOrderField(tx, { tenantId, customerId: linkedCustomer.id, value: text }))
        : null;
      if (orderFlow) {
        if (orderFlow.completed) {
          await ctx.reply(BOT_ORDER_FLOW_COPY.completed);
        } else if (orderFlow.field) {
          const privacyNote = orderFlow.field.type === 'password' ? BOT_ORDER_FLOW_COPY.privacy : '';
          await ctx.reply(`${BOT_ORDER_FLOW_COPY.savedPrefix}${orderFlow.field.label}${privacyNote}`);
        }
        return;
      }
      if (await capturePaymentProof(ctx, tenantId, { transactionId: text })) return;
      const automations = await prisma.botAutomation.findMany({
        where: {
          tenantId,
          isActive: true,
          trigger: { in: ['command', 'keyword'] },
        },
        select: { trigger: true, triggerConfig: true, message: true },
        orderBy: { sortOrder: 'asc' },
      });
      const lower = text.toLowerCase();
      const match = automations.find((automation) => {
        const config =
          automation.triggerConfig && typeof automation.triggerConfig === 'object'
            ? (automation.triggerConfig as Record<string, unknown>)
            : {};
        const value = typeof config.value === 'string' ? config.value.trim().toLowerCase() : '';
        if (!value) return false;
        return automation.trigger === 'command'
          ? lower === (value.startsWith('/') ? value : '/' + value)
          : lower.includes(value);
      });
      if (match?.message) await ctx.reply(match.message);
    } catch (error) {
      console.error('telegram automation failed', error);
    }
  });

  bot.catch((error) => console.error('Telegram bot update error', error.error));
  botCache.set(cacheKey, bot);
  return bot;
}

export async function startLocalBotPolling(botToken: string, tenantId: string) {
  const bot = getBotInstance(botToken, tenantId);
  if (bot.isRunning()) return bot;

  await bot.api.deleteWebhook({ drop_pending_updates: false });
  let ready = false;
  let resolveReady: () => void = () => undefined;
  let rejectReady: (error: unknown) => void = () => undefined;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  void bot.start({
    drop_pending_updates: false,
    onStart: () => {
      ready = true;
      resolveReady();
    },
  }).catch((error) => {
    if (!ready) rejectReady(error);
    else console.error('Local Telegram polling stopped unexpectedly', error);
  });
  await readyPromise;
  return bot;
}

export async function stopLocalBotPolling(botToken: string, tenantId: string) {
  const bot = getBotInstance(botToken, tenantId);
  if (bot.isRunning()) await bot.stop();
}

async function showMainMenu(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  isEdit = false,
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { storeName: true, currency: true },
  });
  const keyboard = new InlineKeyboard()
    .text('الخدمات والاشتراكات', 'browse_services')
    .row()
    .text('محفظتي', 'my_wallet')
    .text('اشتراكاتي', 'my_subs')
    .text('\u0637\u0644\u0628\u0627\u062a\u064a', 'my_orders')
    .row()
    .text('التواصل مع الدعم', 'merchant_support')
    .row()
    .text('الإبلاغ عن مشكلة في اشتراك', 'report_issue')
    .row()
    .text('تحديث القائمة', 'menu');
  const text =
    `${tenant?.storeName || 'المتجر'}\n\n` +
    `الاسم: ${customer.name}\n` +
    `الهاتف: ${customer.phone}\n` +
    `الرصيد: ${money(customer.walletBalance).toFixed(2)} ${tenant?.currency || 'EGP'}\n\n` +
    'اختر ما تريد من القائمة:';

  if (isEdit) await editOrReply(ctx, text, keyboard);
  else await ctx.reply(text, { reply_markup: keyboard });
}

async function showServices(ctx: Context, tenantId: string) {
  const [categories, uncategorized] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: {
        tenantId,
        isActive: true,
        showInBot: true,
        services: { some: { isActive: true, showInBot: true } },
      },
      select: { id: true, name: true, icon: true, _count: { select: { services: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 80,
    }),
    prisma.service.findMany({
      where: { tenantId, categoryId: null, isActive: true, showInBot: true },
      select: { id: true, name: true, icon: true, defaultSellingPrice: true },
      orderBy: { name: 'asc' },
      take: 80,
    }),
  ]);
  const keyboard = new InlineKeyboard();
  for (const category of categories) {
    keyboard.text(`${category.icon || ``} ${category.name}`.trim(), `cat_${category.id}`).row();
  }
  for (const service of uncategorized) {
    keyboard.text(`${service.icon || ``} ${service.name} | يبدأ من ${money(service.defaultSellingPrice).toFixed(2)}`.trim(), `srv_${service.id}`).row();
  }
  keyboard.text('العودة للقائمة', 'menu');
  await editOrReply(
    ctx,
    categories.length || uncategorized.length
      ? 'اختر القسم أو الخدمة التي تريدها:'
      : 'لا توجد خدمات متاحة حالياً.',
    keyboard,
  );
}

async function showCategoryServices(ctx: Context, tenantId: string, categoryId: string) {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: categoryId, tenantId, isActive: true, showInBot: true },
    include: {
      services: {
        where: { isActive: true, showInBot: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, icon: true, defaultSellingPrice: true },
      },
    },
  });
  if (!category) throw new Error('القسم غير متاح');
  const keyboard = new InlineKeyboard();
  for (const service of category.services) {
    keyboard.text(`${service.icon || ``} ${service.name} | يبدأ من ${money(service.defaultSellingPrice).toFixed(2)}`.trim(), `srv_${service.id}`).row();
  }
  keyboard.text('العودة للأقسام', 'browse_services');
  await editOrReply(
    ctx,
    category.services.length
      ? `${category.name}\n\nاختر الاشتراك المناسب:`
      : `${category.name}\n\nلا توجد خدمات متاحة في هذا القسم حالياً.`,
    keyboard,
  );
}

async function showServiceDetails(ctx: Context, tenantId: string, serviceId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId, isActive: true, showInBot: true },
    include: {
      category: { select: { id: true, name: true } },
      plans: {
        where: { isActive: true, showInBot: true },
        orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
      },
    },
  });
  if (!service) throw new Error('الخدمة غير متاحة');

  const keyboard = new InlineKeyboard();
  for (const plan of service.plans) {
    const available = !plan.trackInventory || plan.stockQuantity > 0;
    keyboard
      .text(
        `${available ? '✅' : '⏳'} ${plan.name} — ${money(plan.price).toFixed(2)}`,
        `plan_${plan.id}`,
      )
      .row();
  }
  keyboard.text(
    service.category ? `العودة إلى ${service.category.name}` : 'العودة للخدمات',
    service.category ? `cat_${service.category.id}` : 'browse_services',
  );
  const featureLines = service.features.length
    ? `\n\nالمميزات:\n${service.features.map((feature) => `• ${feature}`).join('\n')}`
    : '';
  await editOrReply(
    ctx,
    `${service.name}\n\n${service.description || 'اختر المدة المناسبة لك.'}${featureLines}\n\nاختر مدة الاشتراك:`,
    keyboard,
  );
}

async function showPlanDetails(ctx: Context, tenantId: string, planId: string) {
  const plan = await prisma.servicePlan.findFirst({
    where: {
      id: planId,
      tenantId,
      isActive: true,
      showInBot: true,
      service: { isActive: true, showInBot: true },
    },
    include: { service: true },
  });
  if (!plan) throw new Error('مدة الاشتراك غير متاحة');

  const referencePrice = Math.round(
    (money(plan.service.defaultSellingPrice) * plan.durationDays * 100) /
      Math.max(plan.service.defaultDuration, 1),
  ) / 100;
  const savings = Math.max(0, Math.round((referencePrice - money(plan.price)) * 100) / 100);
  const available = !plan.trackInventory || plan.stockQuantity > 0;
  const keyboard = new InlineKeyboard();
  if (available) {
    keyboard.text(`شراء الآن — ${money(plan.price).toFixed(2)}`, `buyplan_${plan.id}`).row();
  } else {
    keyboard.text('سجّل اهتمامي وأبلغني عند التوفر', `interest_${plan.id}`).row();
  }
  keyboard.text('العودة للمدد', `srv_${plan.serviceId}`);
  const savingsLine = savings > 0
    ? `\nالتوفير: ${savings.toFixed(2)} بدلاً من ${referencePrice.toFixed(2)}`
    : '';
  const stockLine = plan.trackInventory
    ? plan.stockQuantity > 0
      ? `\nالمتاح الآن: ${plan.stockQuantity}`
      : '\nالحالة: غير متوفر حالياً'
    : '\nالحالة: متاح';
  await editOrReply(
    ctx,
    `${plan.service.name} — ${plan.name}\n\nالمدة: ${plan.durationDays} يوم\nالسعر: ${money(plan.price).toFixed(2)}${savingsLine}${stockLine}`,
    keyboard,
  );
}

async function registerInterest(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  planId: string,
) {
  const plan = await prisma.servicePlan.findFirst({
    where: { id: planId, tenantId, isActive: true },
    include: { service: { select: { id: true, name: true } } },
  });
  if (!plan) throw new Error('مدة الاشتراك غير متاحة');
  if (!plan.trackInventory || plan.stockQuantity > 0) {
    return showPlanDetails(ctx, tenantId, planId);
  }
  const existing = await prisma.serviceInterest.findFirst({
    where: {
      tenantId,
      customerId: customer.id,
      servicePlanId: plan.id,
      status: { in: ['waiting', 'notified', 'contacted'] },
    },
  });
  if (existing) {
    await prisma.serviceInterest.update({
      where: { id: existing.id },
      data: { status: 'waiting', preferredChannel: 'telegram', notifiedAt: null },
    });
  } else {
    await prisma.serviceInterest.create({
      data: {
        tenantId,
        customerId: customer.id,
        serviceId: plan.service.id,
        servicePlanId: plan.id,
        preferredChannel: 'telegram',
        status: 'waiting',
      },
    });
  }
  await editOrReply(
    ctx,
    `تم تسجيل اهتمامك بخدمة ${plan.service.name} — ${plan.name}.\nسنرسل لك إشعاراً هنا فور إضافة مخزون جديد، ويمكن للتاجر التواصل معك أيضاً.`,
    new InlineKeyboard().text('العودة للخدمة', `srv_${plan.service.id}`).row().text('القائمة الرئيسية', 'menu'),
  );
}

async function processPlanPurchase(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  planId: string,
  renewedFromId?: string,
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const plan = await tx.servicePlan.findFirst({
        where: {
          id: planId,
          tenantId,
          isActive: true,
          showInBot: true,
          service: { isActive: true, showInBot: true },
        },
        include: { service: { select: { name: true } } },
      });
      if (!plan) throw new Error('مدة الاشتراك غير متاحة');

      const debited = await walletTransactionHelpers.debitInTransaction(tx, {
        tenantId,
        customerId: customer.id,
        amount: plan.price,
        description: `${renewedFromId ? 'تجديد' : 'شراء'}: ${plan.service.name} - ${plan.name}`,
        type: 'purchase',
        idempotencyKey: `${renewedFromId ? 'telegram-renewal' : 'telegram-plan'}:${ctx.callbackQuery?.id || Date.now()}`,
        metadata: { serviceId: plan.serviceId, planId: plan.id, renewedFromId: renewedFromId || null },
      });
      const fulfillment = await createPaidOrderInTransaction(tx, {
        tenantId,
        customerId: customer.id,
        plan,
        source: 'telegram_bot',
        renewedFromId,
      });
      await tx.serviceInterest.updateMany({
        where: { tenantId, customerId: customer.id, servicePlanId: plan.id, status: { not: 'closed' } },
        data: { status: 'converted' },
      });
      await tx.customerActivity.create({
        data: {
          tenantId,
          customerId: customer.id,
          type: renewedFromId ? 'renewal' : 'purchase',
          title: renewedFromId ? 'تجديد عبر بوت تيليجرام' : 'شراء عبر بوت تيليجرام',
          details: `${plan.service.name} - ${plan.name}`,
          metadata: { orderId: fulfillment.order.id, serviceId: plan.serviceId, planId: plan.id, renewedFromId: renewedFromId || null },
        },
      });
      return { plan, fulfillment, walletBalance: debited.walletBalance, renewed: Boolean(renewedFromId) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const { fulfillment, plan } = result;
  let message =
    `${result.renewed ? 'تم تسجيل تجديد اشتراكك بنجاح.' : 'تم إنشاء طلبك بنجاح.'}\nرقم الطلب: ${fulfillment.order.orderNo}\nالخدمة: ${plan.service.name}\nالخطة: ${plan.name}\n` +
    `الرصيد المتبقي: ${money(result.walletBalance).toFixed(2)}\n`;

  if (fulfillment.mode === 'auto_delivery' && fulfillment.delivery) {
    message +=
      `\nتم التفعيل والتسليم فورًا.\nالصلاحية حتى: ${fulfillment.subscription?.endDate.toLocaleDateString('ar-EG')}\n` +
      `\nبيانات التسليم:\n${fulfillment.delivery.credentials || 'تواصل مع الدعم لاستلام البيانات.'}\n\nاحتفظ بهذه البيانات في مكان آمن.`;
  } else if (fulfillment.mode === 'customer_data' && fulfillment.requiredFields.length) {
    const firstField = fulfillment.requiredFields[0];
    const privacyNote = firstField.type === 'password' ? '\nسيتم حفظ الإجابة بصورة مشفرة.' : '';
    message += `\nلتجهيز الاشتراك نحتاج بعض البيانات منك خطوة بخطوة.\nأرسل الآن: ${firstField.label}${privacyNote}`;
  } else {
    message += result.renewed
      ? '\nطلب التجديد قيد التفعيل لدى فريق الدعم. سيتغير تاريخ نهاية الاشتراك فور إتمام التفعيل، وسيرسل لك إشعار هنا.'
      : `\n${plan.purchaseMessage || 'طلبك قيد التجهيز، وسيتواصل معك فريق الدعم لإتمام التفعيل.'}`;
  }

  await editOrReply(ctx, message, new InlineKeyboard().text('العودة للقائمة', 'menu'));
}
async function processPurchase(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  serviceId: string,
) {
  const result = await prisma.$transaction(
    async (tx) => {
      const service = await tx.service.findFirst({
        where: { id: serviceId, tenantId, isActive: true },
      });
      if (!service) throw new Error('الخدمة غير متاحة');

      const debited = await walletTransactionHelpers.debitInTransaction(tx, {
        tenantId,
        customerId: customer.id,
        amount: service.defaultSellingPrice,
        description: `شراء خدمة: ${service.name}`,
        type: 'purchase',
        idempotencyKey: `telegram:${ctx.callbackQuery?.id || Date.now()}`,
        metadata: { serviceId },
      });

      const account = await tx.accountPool.findFirst({
        where: { tenantId, serviceId, isUsed: false },
        orderBy: { createdAt: 'asc' },
      });
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + service.defaultDuration);

      const subscription = await tx.subscription.create({
        data: {
          tenantId,
          customerId: customer.id,
          serviceId,
          startDate,
          endDate,
          sellingPrice: service.defaultSellingPrice,
          costPrice: service.defaultCostPrice,
          status: 'active',
          notes: account ? 'تسليم تلقائي عبر البوت' : 'بانتظار التسليم من المتجر',
          createdBy: 'telegram_bot',
        },
      });

      let deliveredAccount: typeof account = null;
      if (account) {
        const claimed = await tx.accountPool.updateMany({
          where: { id: account.id, tenantId, isUsed: false },
          data: { isUsed: true, usedAt: new Date(), subscriptionId: subscription.id },
        });
        if (claimed.count === 1) deliveredAccount = account;
      }

      await tx.customerActivity.create({
        data: {
          tenantId,
          customerId: customer.id,
          type: 'purchase',
          title: 'شراء عبر بوت تيليجرام',
          details: service.name,
          metadata: { subscriptionId: subscription.id, serviceId },
        },
      });
      return { service, subscription, deliveredAccount, walletBalance: debited.walletBalance };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  let message =
    `تم الشراء بنجاح.\nالخدمة: ${result.service.name}\n` +
    `الصلاحية حتى: ${result.subscription.endDate.toLocaleDateString('ar-EG')}\n` +
    `الرصيد المتبقي: ${money(result.walletBalance).toFixed(2)}\n`;

  if (result.deliveredAccount) {
    const credentials = result.deliveredAccount.credentialsEncrypted
      ? decryptSecret(result.deliveredAccount.credentialsEncrypted)
      : result.deliveredAccount.credentials;
    message += credentials
      ? `\nبيانات التفعيل:\n${credentials}\n\nاحتفظ بهذه البيانات في مكان آمن.`
      : '\nسيتم إرسال بيانات التفعيل من فريق المتجر.';
  } else {
    message += '\nطلبك قيد التجهيز وسيتم التواصل معك عند جاهزية بيانات التفعيل.';
  }
  await editOrReply(ctx, message, new InlineKeyboard().text('العودة للقائمة', 'menu'));
}

async function showWallet(ctx: Context, customer: CustomerView, tenantId: string) {
  const settings = await prisma.botSettings.findUnique({
    where: { tenantId },
    select: { menuConfig: true },
  });
  const amounts = paymentMenu(settings?.menuConfig).rechargeAmounts || [50, 100, 200, 500];
  const keyboard = new InlineKeyboard();
  amounts.forEach((amount, index) => {
    keyboard.text(`شحن ${amount}`, `recharge_${amount}`);
    if (index % 2 === 1) keyboard.row();
  });
  keyboard.row().text('العودة للقائمة', 'menu');
  await editOrReply(
    ctx,
    `رصيد محفظتك الحالي: ${money(customer.walletBalance).toFixed(2)}\nاختر قيمة الشحن:`,
    keyboard,
  );
}

async function generateRechargeInstructions(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  amount: number,
) {
  const settings = await prisma.botSettings.findUnique({
    where: { tenantId },
    select: { menuConfig: true, supportMessage: true },
  });
  const payment = paymentMenu(settings?.menuConfig);
  if (!payment.vodafoneNumber && !payment.instapayAddress) {
    throw new Error(settings?.supportMessage || 'لم يضبط المتجر بيانات الدفع بعد');
  }

  const method = payment.vodafoneNumber ? 'vodafone_cash' : 'instapay';
  const request = await createPaymentRequest({
    tenantId,
    customerId: customer.id,
    amount,
    method,
  });
  const exactAmount = request.amount.plus(request.fraction);
  const lines = [
    'تعليمات شحن المحفظة',
    `حوّل المبلغ الدقيق: ${exactAmount.toFixed(2)} EGP`,
    payment.vodafoneNumber ? `فودافون كاش: ${payment.vodafoneNumber}` : '',
    payment.instapayAddress ? `InstaPay: ${payment.instapayAddress}` : '',
    'صلاحية الطلب 15 دقيقة. بعد التحويل اضغط تم التحويل.',
  ].filter(Boolean);
  const keyboard = new InlineKeyboard()
    .text('تم التحويل', `transferred_${request.id}`)
    .row()
    .text('إلغاء الطلب', `cancel_request_${request.id}`);
  await editOrReply(ctx, lines.join('\n'), keyboard);
}

async function handleTransferNotification(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  requestId: string,
) {
  const changed = await prisma.paymentRequest.updateMany({
    where: { id: requestId, tenantId, customerId: customer.id, status: 'pending' },
    data: { notes: 'customer_confirmed_transfer' },
  });
  if (changed.count !== 1) throw new Error('طلب الدفع غير موجود أو منتهي');
  await editOrReply(
    ctx,
    'تم تسجيل التحويل. أرسل الآن رقم العملية أو صورة الإيصال، ثم سيظهر الطلب للتاجر لاعتماده.',
    new InlineKeyboard().text('العودة للقائمة', 'menu'),
  );
}

async function handleCancelRequest(
  ctx: Context,
  customer: CustomerView,
  tenantId: string,
  requestId: string,
) {
  const changed = await prisma.paymentRequest.updateMany({
    where: { id: requestId, tenantId, customerId: customer.id, status: 'pending' },
    data: { status: 'cancelled', notes: 'ألغاه العميل', processedAt: new Date() },
  });
  if (changed.count !== 1) throw new Error('طلب الدفع غير موجود أو تمت معالجته');
  await editOrReply(ctx, 'تم إلغاء طلب الشحن.', new InlineKeyboard().text('العودة للمحفظة', 'my_wallet'));
}

async function showRenewalPlans(ctx: Context, customer: CustomerView, tenantId: string, subscriptionId: string) {
  await expireDueSubscriptions(tenantId);
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: subscriptionId,
      tenantId,
      customerId: customer.id,
      status: { in: ['active', 'expiring_soon', 'expired'] },
    },
    select: {
      id: true,
      endDate: true,
      status: true,
      service: {
        select: {
          name: true,
          plans: {
            where: { isActive: true, showInBot: true },
            orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
            select: { id: true, name: true, durationDays: true, price: true, trackInventory: true, stockQuantity: true },
          },
        },
      },
    },
  });
  if (!subscription) throw new Error('الاشتراك غير متاح للتجديد.');
  const keyboard = new InlineKeyboard();
  for (const plan of subscription.service.plans) {
    const available = !plan.trackInventory || plan.stockQuantity > 0;
    keyboard.text(
      `${available ? '✅' : '⏳'} ${plan.name} — ${money(plan.price).toFixed(2)}`,
      available ? `renewplan_${subscription.id}_${plan.id}` : 'browse_services',
    ).row();
  }
  keyboard.text('العودة لاشتراكاتي', 'my_subs').row().text('القائمة الرئيسية', 'menu');
  const status = subscription.status === 'expired' ? 'منتهي ويحتاج تجديد' : 'نشط ويمكن تجديده الآن';
  await editOrReply(
    ctx,
    `${subscription.service.name}\nانتهى أو ينتهي في: ${subscription.endDate.toLocaleDateString('ar-EG')}\nالحالة: ${status}\n\nاختر مدة التجديد. بعد الدفع يتغير تاريخ الانتهاء تلقائياً حسب المدة المختارة.`,
    keyboard,
  );
}

async function showSubscriptions(ctx: Context, customer: CustomerView, tenantId: string) {
  await expireDueSubscriptions(tenantId);
  const renewalWindow = new Date();
  renewalWindow.setUTCDate(renewalWindow.getUTCDate() - 60);
  const subscriptions = await prisma.subscription.findMany({
    where: {
      tenantId,
      customerId: customer.id,
      status: { in: ['active', 'expiring_soon', 'expired'] },
      endDate: { gte: renewalWindow },
    },
    select: {
      id: true,
      endDate: true,
      status: true,
      service: { select: { name: true } },
      servicePlan: { select: { name: true } },
    },
    orderBy: { endDate: 'asc' },
    take: 100,
  });
  const text = subscriptions.length
    ? subscriptions
        .map((item) => `${item.service.name}${item.servicePlan?.name ? ` — ${item.servicePlan.name}` : ''}\nينتهي: ${item.endDate.toLocaleDateString('ar-EG')}\nالحالة: ${item.status === 'expired' ? 'منتهي ويحتاج تجديد' : 'نشط'}`)
        .join('\n\n')
    : 'ليس لديك اشتراكات نشطة حالياً.';
  const keyboard = new InlineKeyboard();
  subscriptions.forEach((item) => keyboard.text(`${item.status === 'expired' ? 'إعادة تفعيل' : 'تجديد'} ${item.service.name}`, `renew_${item.id}`).row());
  keyboard.text('العودة للقائمة', 'menu');
  await editOrReply(ctx, text, keyboard);
}
