'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { money, requirePositiveMoney } from '@/lib/money';
import { requirePermission, requireSuperAdmin } from '@/lib/session';
import { cleanText, oneOf, optionalText } from '@/lib/validation';
import { ensureReferralProgram } from '@/lib/referrals';
import { writeAuditLog } from '@/lib/audit';

const PAYOUT_METHODS = ['vodafone_cash', 'instapay', 'bank_transfer'] as const;
const PAYOUT_STATUSES = ['pending', 'paid', 'rejected'] as const;

function safeError(error: unknown, fallback: string) {
  console.error(fallback, error);
  return error instanceof Error ? error.message : fallback;
}

function serializeEntry<T extends { amount: Prisma.Decimal; balanceAfter: Prisma.Decimal }>(entry: T) {
  return { ...entry, amount: money(entry.amount), balanceAfter: money(entry.balanceAfter) };
}

export async function getMyReferralCenter() {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const [program, settings] = await Promise.all([
      prisma.$transaction((tx) => ensureReferralProgram(tx, session.tenantId)),
      prisma.referralSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }),
    ]);
    const [referrals, entries, payoutRequests] = await Promise.all([
      prisma.referralAttribution.findMany({
        where: { referrerProgramId: program.id },
        select: {
          id: true,
          status: true,
          commissionRate: true,
          activatedAt: true,
          createdAt: true,
          referredTenant: { select: { storeName: true, slug: true, saasStatus: true, saasPlan: true, saasExpiry: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.referralWalletTransaction.findMany({
        where: { programId: program.id },
        select: { id: true, type: true, amount: true, balanceAfter: true, description: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.referralPayoutRequest.findMany({
        where: { programId: program.id },
        select: { id: true, amount: true, method: true, accountIdentifier: true, status: true, merchantNote: true, ownerNote: true, requestedAt: true, processedAt: true },
        orderBy: { requestedAt: 'desc' },
        take: 100,
      }),
    ]);
    const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') || '';
    return {
      success: true,
      settings: { enabled: settings.isEnabled, minimumPayout: money(settings.minimumPayout) },
      program: {
        code: program.code,
        link: `${baseUrl}/register?ref=${encodeURIComponent(program.code)}`,
        isActive: program.isActive,
        commissionRate: money(program.commissionRate),
        availableBalance: money(program.availableBalance),
        pendingBalance: money(program.pendingBalance),
        totalEarned: money(program.totalEarned),
        totalRedeemed: money(program.totalRedeemed),
        totalPaidOut: money(program.totalPaidOut),
      },
      referrals: referrals.map((item) => ({ ...item, commissionRate: money(item.commissionRate) })),
      entries: entries.map(serializeEntry),
      payoutRequests: payoutRequests.map((item) => ({ ...item, amount: money(item.amount) })),
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل مركز الإحالة'), referrals: [], entries: [], payoutRequests: [] };
  }
}

export async function redeemReferralBalanceForSaas(amountInput: number) {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const amount = new Prisma.Decimal(requirePositiveMoney(amountInput, 'قيمة الاستخدام'));
    const result = await prisma.$transaction(async (tx) => {
      const program = await ensureReferralProgram(tx, session.tenantId);
      const debited = await tx.referralProgram.updateMany({
        where: { id: program.id, availableBalance: { gte: amount } },
        data: { availableBalance: { decrement: amount }, totalRedeemed: { increment: amount } },
      });
      if (debited.count !== 1) throw new Error('رصيد الإحالة غير كافٍ لهذه العملية');
      const updated = await tx.referralProgram.findUniqueOrThrow({ where: { id: program.id }, select: { availableBalance: true } });
      await tx.tenant.update({ where: { id: session.tenantId }, data: { saasBalance: { increment: amount } } });
      await tx.referralWalletTransaction.create({
        data: {
          tenantId: session.tenantId,
          programId: program.id,
          type: 'redeem_for_saas',
          amount: amount.neg(),
          balanceAfter: updated.availableBalance,
          description: 'استخدام رصيد الإحالة في رصيد اشتراك المنصة',
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({ tenantId: session.tenantId, userId: session.userId, action: 'referral.balance_redeemed', entityType: 'ReferralProgram', metadata: { amount: money(amount) } });
    revalidatePath('/dashboard/billing');
    return { success: true, availableBalance: money(result.availableBalance) };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر استخدام رصيد الإحالة') };
  }
}

export async function requestReferralPayout(input: { amount: number; method: string; accountIdentifier: string; note?: string }) {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const amount = new Prisma.Decimal(requirePositiveMoney(input.amount, 'قيمة السحب'));
    const method = oneOf(input.method, PAYOUT_METHODS, 'طريقة السحب');
    const accountIdentifier = cleanText(input.accountIdentifier, 'بيانات الاستلام', 3, 150);
    const merchantNote = optionalText(input.note, 800);
    const result = await prisma.$transaction(async (tx) => {
      const [program, settings] = await Promise.all([
        ensureReferralProgram(tx, session.tenantId),
        tx.referralSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }),
      ]);
      if (!settings.isEnabled) throw new Error('نظام الإحالة متوقف مؤقتاً من إدارة المنصة');
      if (amount.lt(settings.minimumPayout)) throw new Error(`الحد الأدنى لطلب السحب هو ${money(settings.minimumPayout).toFixed(2)} جنيه`);
      const moved = await tx.referralProgram.updateMany({
        where: { id: program.id, availableBalance: { gte: amount } },
        data: { availableBalance: { decrement: amount }, pendingBalance: { increment: amount } },
      });
      if (moved.count !== 1) throw new Error('رصيد الإحالة المتاح لا يكفي لطلب السحب');
      const updated = await tx.referralProgram.findUniqueOrThrow({ where: { id: program.id }, select: { availableBalance: true } });
      const request = await tx.referralPayoutRequest.create({
        data: { tenantId: session.tenantId, programId: program.id, amount, method, accountIdentifier, merchantNote },
      });
      await tx.referralWalletTransaction.create({
        data: {
          tenantId: session.tenantId,
          programId: program.id,
          payoutRequestId: request.id,
          type: 'payout_requested',
          amount: amount.neg(),
          balanceAfter: updated.availableBalance,
          description: 'طلب سحب رصيد الإحالة — بانتظار اعتماد إدارة المنصة',
        },
      });
      return { request, availableBalance: updated.availableBalance };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({ tenantId: session.tenantId, userId: session.userId, action: 'referral.payout_requested', entityType: 'ReferralPayoutRequest', entityId: result.request.id, metadata: { amount: money(amount), method } });
    revalidatePath('/dashboard/billing');
    return { success: true, request: { ...result.request, amount: money(result.request.amount) }, availableBalance: money(result.availableBalance) };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر إرسال طلب السحب') };
  }
}

export async function getReferralAdminOverview() {
  try {
    await requireSuperAdmin();
    const [settings, programs, payoutRequests, totals] = await Promise.all([
      prisma.referralSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } }),
      prisma.referralProgram.findMany({
        where: { tenantId: { not: 'system_tenant' } },
        select: {
          id: true, code: true, isActive: true, commissionRate: true, availableBalance: true, pendingBalance: true, totalEarned: true, totalRedeemed: true, totalPaidOut: true,
          tenant: { select: { id: true, storeName: true, saasStatus: true, saasPlan: true } },
          _count: { select: { attributions: true } },
        },
        orderBy: { totalEarned: 'desc' },
        take: 500,
      }),
      prisma.referralPayoutRequest.findMany({
        where: { status: 'pending' },
        select: { id: true, amount: true, method: true, accountIdentifier: true, merchantNote: true, requestedAt: true, tenant: { select: { storeName: true } } },
        orderBy: { requestedAt: 'asc' },
        take: 500,
      }),
      prisma.referralWalletTransaction.aggregate({ where: { type: 'commission' }, _sum: { amount: true } }),
    ]);
    return {
      success: true,
      settings: { enabled: settings.isEnabled, rate: money(settings.defaultCommissionRate), minimumPayout: money(settings.minimumPayout) },
      totals: { commissions: money(totals._sum.amount), referrals: programs.reduce((total, item) => total + item._count.attributions, 0), pendingPayouts: payoutRequests.reduce((total, item) => total + money(item.amount), 0) },
      programs: programs.map((item) => ({ ...item, commissionRate: money(item.commissionRate), availableBalance: money(item.availableBalance), pendingBalance: money(item.pendingBalance), totalEarned: money(item.totalEarned), totalRedeemed: money(item.totalRedeemed), totalPaidOut: money(item.totalPaidOut) })),
      payoutRequests: payoutRequests.map((item) => ({ ...item, amount: money(item.amount) })),
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل إدارة الإحالات'), programs: [], payoutRequests: [] };
  }
}

export async function updateReferralSettings(input: { enabled: boolean; rate: number; minimumPayout: number }) {
  try {
    const owner = await requireSuperAdmin();
    const rate = new Prisma.Decimal(Math.min(100, Math.max(0, Number(input.rate) || 0)).toFixed(2));
    const minimumPayout = new Prisma.Decimal(requirePositiveMoney(input.minimumPayout, 'الحد الأدنى للسحب'));
    const settings = await prisma.referralSettings.upsert({
      where: { id: 'default' },
      update: { isEnabled: input.enabled === true, defaultCommissionRate: rate, minimumPayout },
      create: { id: 'default', isEnabled: input.enabled === true, defaultCommissionRate: rate, minimumPayout },
    });
    await writeAuditLog({ userId: owner.userId, action: 'referral.settings_updated', entityType: 'ReferralSettings', entityId: settings.id, metadata: { enabled: settings.isEnabled, rate: money(rate), minimumPayout: money(minimumPayout) } });
    revalidatePath('/admin');
    return { success: true, settings: { enabled: settings.isEnabled, rate: money(settings.defaultCommissionRate), minimumPayout: money(settings.minimumPayout) } };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحديث إعدادات الإحالة') };
  }
}

export async function updateMerchantReferralProgram(tenantIdInput: string, input: { isActive: boolean; rate: number }) {
  try {
    const owner = await requireSuperAdmin();
    const tenantId = cleanText(tenantIdInput, 'التاجر', 5, 100);
    const rate = new Prisma.Decimal(Math.min(100, Math.max(0, Number(input.rate) || 0)).toFixed(2));
    const program = await prisma.$transaction(async (tx) => {
      await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true } });
      const current = await ensureReferralProgram(tx, tenantId);
      return tx.referralProgram.update({ where: { id: current.id }, data: { isActive: input.isActive === true, commissionRate: rate } });
    });
    await writeAuditLog({ tenantId, userId: owner.userId, action: 'referral.program_updated', entityType: 'ReferralProgram', entityId: program.id, metadata: { isActive: program.isActive, rate: money(program.commissionRate) } });
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحديث برنامج إحالة التاجر') };
  }
}

export async function reviewReferralPayout(requestIdInput: string, input: { status: string; ownerNote?: string }) {
  try {
    const owner = await requireSuperAdmin();
    const requestId = cleanText(requestIdInput, 'طلب السحب', 5, 100);
    const status = oneOf(input.status, ['paid', 'rejected'] as const, 'قرار الطلب');
    const ownerNote = optionalText(input.ownerNote, 800);
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.referralPayoutRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new Error('طلب السحب غير موجود');
      if (request.status !== 'pending') throw new Error('تمت معالجة طلب السحب مسبقاً');
      const claimed = await tx.referralPayoutRequest.updateMany({ where: { id: requestId, status: 'pending' }, data: { status, ownerNote, processedById: owner.userId, processedAt: new Date() } });
      if (claimed.count !== 1) throw new Error('تمت معالجة طلب السحب مسبقاً');
      if (status === 'paid') {
        await tx.referralProgram.update({ where: { id: request.programId }, data: { pendingBalance: { decrement: request.amount }, totalPaidOut: { increment: request.amount } } });
      } else {
        const program = await tx.referralProgram.update({ where: { id: request.programId }, data: { pendingBalance: { decrement: request.amount }, availableBalance: { increment: request.amount } }, select: { availableBalance: true } });
        await tx.referralWalletTransaction.create({ data: { tenantId: request.tenantId, programId: request.programId, payoutRequestId: request.id, type: 'payout_reversed', amount: request.amount, balanceAfter: program.availableBalance, description: 'تم رفض طلب السحب وإعادة الرصيد للمحفظة' } });
      }
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await writeAuditLog({ tenantId: result.tenantId, userId: owner.userId, action: `referral.payout_${status}`, entityType: 'ReferralPayoutRequest', entityId: result.id, metadata: { amount: money(result.amount), ownerNote } });
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر معالجة طلب السحب') };
  }
}
