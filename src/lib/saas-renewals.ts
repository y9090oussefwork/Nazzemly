import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { money } from '@/lib/money';
import { awardReferralCommissionForInvoice, claimReferralFirstPaymentDiscount } from '@/lib/referrals';

const RENEWAL_WINDOW_DAYS = 2;
const BILLING_MONTHS = [1, 3, 6, 12] as const;
const AUTO_RENEW_INSUFFICIENT_BALANCE = 'AUTO_RENEW_INSUFFICIENT_BALANCE';

function monthsBetween(start: Date, end: Date): number {
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (months >= 12 && Math.abs(end.getTime() - start.getTime()) < 370 * 24 * 60 * 60 * 1000) return 12;
  return BILLING_MONTHS.includes(months as (typeof BILLING_MONTHS)[number]) ? months : 1;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export type SaaSAutoRenewResult =
  | { tenantId: string; status: 'renewed'; plan: string; months: number; amount: number; expiresAt: Date }
  | { tenantId: string; status: 'insufficient_balance'; plan: string; months: number; amount: number }
  | { tenantId: string; status: 'skipped'; reason: string };

/** Renews merchant subscriptions that are due within two days. Safe to call once per day. */
export async function processSaaSAutoRenewals(limit = 250): Promise<SaaSAutoRenewResult[]> {
  const now = new Date();
  const dueAt = new Date(now.getTime() + RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const tenants = await prisma.tenant.findMany({
    where: { autoRenew: true, saasExpiry: { lte: dueAt } },
    select: {
      id: true,
      saasBalance: true,
      saasPlan: true,
      saasExpiry: true,
      currency: true,
      platformSubscriptions: {
        where: { status: { in: ['trialing', 'active'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          plan: { select: { id: true, code: true, priceMonthly: true, priceYearly: true, maxUsers: true, maxCustomers: true } },
        },
      },
    },
    orderBy: { saasExpiry: 'asc' },
    take: limit,
  });

  const results: SaaSAutoRenewResult[] = [];
  for (const candidate of tenants) {
    const current = candidate.platformSubscriptions[0];
    const planCode = current?.plan.code || (candidate.saasPlan === 'free_trial' ? 'basic' : candidate.saasPlan);
    const months = current ? monthsBetween(current.currentPeriodStart, current.currentPeriodEnd) : 1;
    const plan = current?.plan || await prisma.plan.findFirst({
      where: { code: planCode, isActive: true },
      select: { id: true, code: true, priceMonthly: true, priceYearly: true, maxUsers: true, maxCustomers: true },
    });
    if (!plan) {
      results.push({ tenantId: candidate.id, status: 'skipped', reason: 'plan_unavailable' });
      continue;
    }

    const listAmount = months === 12 && plan.priceYearly ? plan.priceYearly : plan.priceMonthly.mul(months);
    const oldExpiry = candidate.saasExpiry;
    const periodStart = oldExpiry && oldExpiry > now ? oldExpiry : now;
    const periodEnd = addMonths(periodStart, months);

    try {
      const renewed = await prisma.$transaction(async (tx) => {
        const referralDiscount = await claimReferralFirstPaymentDiscount(tx, { tenantId: candidate.id, amount: listAmount });
        const amount = listAmount.minus(referralDiscount);
        const charged = await tx.tenant.updateMany({
          where: {
            id: candidate.id,
            autoRenew: true,
            saasBalance: { gte: amount },
            ...(oldExpiry ? { saasExpiry: oldExpiry } : { saasExpiry: null }),
          },
          data: {
            saasBalance: { decrement: amount },
            saasPlan: plan.code,
            saasStatus: 'active',
            saasExpiry: periodEnd,
            maxUsers: plan.maxUsers,
            maxCustomers: plan.maxCustomers,
          },
        });
        if (charged.count !== 1) throw new Error(AUTO_RENEW_INSUFFICIENT_BALANCE);

        if (current) {
          await tx.platformSubscription.update({
            where: { id: current.id },
            data: {
              planId: plan.id,
              status: 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
              canceledAt: null,
            },
          });
        } else {
          await tx.platformSubscription.create({
            data: {
              tenantId: candidate.id,
              planId: plan.id,
              status: 'active',
              startsAt: now,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
          });
        }
        const invoice = await tx.platformInvoice.create({
          data: {
            tenantId: candidate.id,
            number: `INV-AUTO-${Date.now()}-${candidate.id.slice(-6).toUpperCase()}`,
            amount,
            currency: candidate.currency,
            status: 'paid',
            dueAt: now,
            paidAt: now,
            metadata: {
              plan: plan.code,
              months,
              source: 'saas_auto_renewal',
              listAmount: money(listAmount),
              referralDiscount: money(referralDiscount),
            },
          },
        });
        await awardReferralCommissionForInvoice(tx, {
          invoiceId: invoice.id,
          tenantId: candidate.id,
          amount,
          currency: candidate.currency,
        });
        return { amount };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      results.push({ tenantId: candidate.id, status: 'renewed', plan: plan.code, months, amount: money(renewed.amount), expiresAt: periodEnd });
      await createDailyNotification(candidate.id, 'saas_auto_renewed', 'تم تجديد اشتراك المتجر تلقائياً', `تم خصم ${money(renewed.amount).toFixed(2)} ${candidate.currency} وتجديد الاشتراك لمدة ${months} ${months === 1 ? 'شهر' : 'شهور'}.`, '/dashboard/billing');
    } catch (error) {
      if (error instanceof Error && error.message === AUTO_RENEW_INSUFFICIENT_BALANCE) {
        results.push({ tenantId: candidate.id, status: 'insufficient_balance', plan: plan.code, months, amount: money(listAmount) });
        await createDailyNotification(candidate.id, 'saas_auto_renew_failed', 'الرصيد غير كافٍ للتجديد التلقائي', `ينتهي اشتراكك قريباً. اشحن ${money(listAmount).toFixed(2)} ${candidate.currency} على الأقل ثم جرّب التجديد من صفحة الحساب والفوترة.`, '/dashboard/billing');
        continue;
      }
      console.error('SaaS auto-renewal failed', { tenantId: candidate.id, error });
      results.push({ tenantId: candidate.id, status: 'skipped', reason: 'transaction_failed' });
    }
  }
  return results;
}

async function createDailyNotification(tenantId: string, type: string, title: string, body: string, href: string) {
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const existing = await prisma.notification.findFirst({ where: { tenantId, type, createdAt: { gte: since } }, select: { id: true } });
    if (!existing) await prisma.notification.create({ data: { tenantId, type, title, body, href } });
  } catch (error) {
    console.error('SaaS renewal notification failed', { tenantId, error });
  }
}
