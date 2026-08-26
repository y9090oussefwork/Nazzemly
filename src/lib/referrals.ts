import 'server-only';

import { Prisma } from '@/generated/prisma/client';

type Database = Prisma.TransactionClient;

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function referralCode() {
  let value = 'NZ-';
  for (let index = 0; index < 8; index += 1) {
    value += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return value;
}

async function uniqueReferralCode(tx: Database) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = referralCode();
    const found = await tx.referralProgram.findUnique({ where: { code }, select: { id: true } });
    if (!found) return code;
  }
  throw new Error('تعذر إنشاء رمز إحالة فريد، حاول مرة أخرى');
}

export async function ensureReferralProgram(tx: Database, tenantId: string) {
  const current = await tx.referralProgram.findUnique({ where: { tenantId } });
  if (current) return current;

  const settings = await tx.referralSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
    select: { defaultCommissionRate: true },
  });
  return tx.referralProgram.create({
    data: {
      tenantId,
      code: await uniqueReferralCode(tx),
      commissionRate: settings.defaultCommissionRate,
    },
  });
}

export async function attachReferralCode(
  tx: Database,
  input: { referredTenantId: string; code: string | null | undefined },
) {
  const code = input.code?.trim().toUpperCase();
  if (!code) return null;

  const settings = await tx.referralSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } });
  if (!settings.isEnabled) throw new Error('نظام الإحالة متوقف مؤقتاً من إدارة المنصة');

  const program = await tx.referralProgram.findFirst({
    where: { code, isActive: true, tenantId: { not: input.referredTenantId } },
  });
  if (!program) throw new Error('رمز الإحالة غير صالح أو غير متاح حالياً');

  return tx.referralAttribution.create({
    data: {
      referrerProgramId: program.id,
      referredTenantId: input.referredTenantId,
      commissionRate: program.commissionRate,
      firstMonthDiscountAmount: settings.firstMonthDiscountAmount,
      status: 'active',
      activatedAt: new Date(),
    },
  });
}

/**
 * Claims the welcome discount reserved for a referred merchant. It runs inside
 * the renewal transaction, so a failed charge rolls the claim back as well.
 */
export async function claimReferralFirstPaymentDiscount(
  tx: Database,
  input: { tenantId: string; amount: Prisma.Decimal },
) {
  const attribution = await tx.referralAttribution.findUnique({
    where: { referredTenantId: input.tenantId },
    select: { id: true, status: true, firstMonthDiscountAmount: true, firstMonthDiscountAppliedAt: true },
  });
  if (!attribution || attribution.status !== 'active' || attribution.firstMonthDiscountAppliedAt) {
    return new Prisma.Decimal(0);
  }

  const configuredDiscount = new Prisma.Decimal(attribution.firstMonthDiscountAmount);
  if (configuredDiscount.lte(0) || input.amount.lte(0)) return new Prisma.Decimal(0);

  const discount = Prisma.Decimal.min(configuredDiscount, input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const claimed = await tx.referralAttribution.updateMany({
    where: { id: attribution.id, firstMonthDiscountAppliedAt: null },
    data: { firstMonthDiscountAppliedAt: new Date() },
  });
  return claimed.count === 1 ? discount : new Prisma.Decimal(0);
}

/**
 * Adds a single immutable commission per paid platform invoice. This function
 * must run inside the same transaction that marks the invoice as paid.
 */
export async function awardReferralCommissionForInvoice(
  tx: Database,
  input: { invoiceId: string; tenantId: string; amount: Prisma.Decimal; currency: string },
) {
  const attribution = await tx.referralAttribution.findUnique({
    where: { referredTenantId: input.tenantId },
    include: { referrerProgram: true },
  });
  if (!attribution || attribution.status !== 'active' || !attribution.referrerProgram.isActive) return null;

  const existing = await tx.referralWalletTransaction.findUnique({
    where: { sourceInvoiceId: input.invoiceId },
    select: { id: true },
  });
  if (existing) return null;

  await tx.referralAttribution.updateMany({
    where: { id: attribution.id, firstPaidAt: null },
    data: { firstPaidAt: new Date() },
  });

  const amount = new Prisma.Decimal(input.amount)
    .mul(attribution.commissionRate)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (amount.lte(0)) return null;

  const program = await tx.referralProgram.update({
    where: { id: attribution.referrerProgramId },
    data: {
      availableBalance: { increment: amount },
      totalEarned: { increment: amount },
    },
    select: { id: true, tenantId: true, availableBalance: true },
  });

  return tx.referralWalletTransaction.create({
    data: {
      tenantId: program.tenantId,
      programId: program.id,
      attributionId: attribution.id,
      sourceInvoiceId: input.invoiceId,
      type: 'commission',
      amount,
      balanceAfter: program.availableBalance,
      description: `عمولة إحالة من تجديد متجر صديق (${Number(attribution.commissionRate)}%)`,
      metadata: { referredTenantId: input.tenantId, currency: input.currency, rate: Number(attribution.commissionRate) },
    },
  });
}
