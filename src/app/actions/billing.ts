'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission, revokeAllUserSessions } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/security';
import { money, requirePositiveMoney } from '@/lib/money';
import { cleanText, oneOf } from '@/lib/validation';
import { writeAuditLog } from '@/lib/audit';

const PAYMENT_METHODS = ['vodafone_cash', 'instapay', 'bank_transfer'] as const;

export async function changeMerchantPassword(
  currentPasswordInput: string,
  newPasswordInput: string,
) {
  try {
    const session = await requirePermission('settings', { allowInactiveTenant: true });
    const currentPassword = cleanText(currentPasswordInput, 'كلمة المرور الحالية', 1, 200);
    const newPassword = cleanText(newPasswordInput, 'كلمة المرور الجديدة', 10, 200);
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw new Error('كلمة المرور الجديدة يجب أن تحتوي على حروف وأرقام');
    }

    const user = await prisma.user.findFirst({
      where: { id: session.userId, tenantId: session.tenantId, isActive: true },
      select: { password: true },
    });
    if (!user) throw new Error('المستخدم غير موجود');

    const verified = await verifyPassword(currentPassword, user.password);
    if (!verified.valid) throw new Error('كلمة المرور الحالية غير صحيحة');

    await prisma.user.update({
      where: { id: session.userId },
      data: { password: await hashPassword(newPassword) },
    });
    await revokeAllUserSessions(session.userId, session.sessionId);
    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'user.password_changed',
      entityType: 'User',
      entityId: session.userId,
    });
    return { success: true };
  } catch (error) {
    console.error('changeMerchantPassword failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تغيير كلمة المرور' };
  }
}

export async function requestSaaSRecharge(
  amountInput: number,
  methodInput: 'vodafone_cash' | 'instapay' | 'bank_transfer',
  senderIdentifierInput: string,
) {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const amount = new Prisma.Decimal(requirePositiveMoney(amountInput, 'قيمة الشحن'));
    const method = oneOf(methodInput, PAYMENT_METHODS, 'طريقة الدفع');
    const senderIdentifier = cleanText(senderIdentifierInput, 'بيانات المرسل', 3, 100);

    const request = await prisma.saaSPaymentRequest.create({
      data: {
        tenantId: session.tenantId,
        amount,
        method,
        senderIdentifier,
        status: 'pending',
        notes: 'بانتظار مراجعة إدارة المنصة',
      },
      select: {
        id: true,
        amount: true,
        method: true,
        senderIdentifier: true,
        status: true,
        createdAt: true,
      },
    });
    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'billing.recharge_requested',
      entityType: 'SaaSPaymentRequest',
      entityId: request.id,
      metadata: { amount: money(request.amount), method },
    });
    revalidatePath('/dashboard');
    return { success: true, request: { ...request, amount: money(request.amount) } };
  } catch (error) {
    console.error('requestSaaSRecharge failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إرسال طلب الشحن' };
  }
}

export async function renewSaaSPlan(input: { planCode?: string; months?: number } = {}) {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const months = Number(input.months ?? 1);
    if (![1, 3, 6, 12].includes(months)) throw new Error('مدة الاشتراك يجب أن تكون شهرًا أو 3 أو 6 أو 12 شهرًا');
    const result = await prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: session.tenantId },
          select: {
            id: true,
            storeName: true,
            currency: true,
            saasBalance: true,
            saasPlan: true,
            saasExpiry: true,
            autoRenew: true,
          },
        });
        if (!tenant) throw new Error('المتجر غير موجود');

        const planCode = input.planCode?.trim() || (tenant.saasPlan === 'free_trial' ? 'basic' : tenant.saasPlan);
        const plan = await tx.plan.findFirst({
          where: { code: planCode, isActive: true },
        });
        if (!plan) throw new Error('الباقة غير متاحة حالياً');

        const amount = months === 12 && plan.priceYearly ? plan.priceYearly : plan.priceMonthly.mul(months);

        const charged = await tx.tenant.updateMany({
          where: { id: tenant.id, saasBalance: { gte: amount } },
          data: {
            saasBalance: { decrement: amount },
            saasPlan: plan.code,
            saasStatus: 'active',
            maxUsers: plan.maxUsers,
            maxCustomers: plan.maxCustomers,
          },
        });
        if (charged.count !== 1) {
          throw new Error(
            `الرصيد غير كافٍ. سعر الاشتراك ${money(amount).toFixed(2)} ${tenant.currency}`,
          );
        }

        const now = new Date();
        const periodStart = tenant.saasExpiry && tenant.saasExpiry > now ? tenant.saasExpiry : now;
        const periodEnd = new Date(periodStart);
        const day = periodEnd.getUTCDate();
        periodEnd.setUTCDate(1);
        periodEnd.setUTCMonth(periodEnd.getUTCMonth() + months);
        const lastDay = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0)).getUTCDate();
        periodEnd.setUTCDate(Math.min(day, lastDay));

        await tx.tenant.update({
          where: { id: tenant.id },
          data: { saasExpiry: periodEnd },
        });

        const currentSubscription = await tx.platformSubscription.findFirst({
          where: { tenantId: tenant.id, status: { in: ['trialing', 'active'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (currentSubscription) {
          await tx.platformSubscription.update({
            where: { id: currentSubscription.id },
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
              tenantId: tenant.id,
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
            tenantId: tenant.id,
            number: `INV-${Date.now()}-${tenant.id.slice(-6).toUpperCase()}`,
            amount,
            currency: tenant.currency,
            status: 'paid',
            dueAt: now,
            paidAt: now,
            metadata: { plan: plan.code, months, source: 'saas_balance' },
          },
        });
        const updatedTenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          select: {
            saasBalance: true,
            saasPlan: true,
            saasStatus: true,
            saasExpiry: true,
            maxUsers: true,
            maxCustomers: true,
          },
        });
        return { tenant: updatedTenant, invoice, plan, months, amount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'billing.subscription_renewed',
      entityType: 'PlatformInvoice',
      entityId: result.invoice.id,
      metadata: {
        plan: result.plan.code,
        amount: money(result.invoice.amount),
        months: result.months,
      },
    });
    revalidatePath('/dashboard');
    return {
      success: true,
      tenant: { ...result.tenant, saasBalance: money(result.tenant.saasBalance) },
      invoice: { ...result.invoice, amount: money(result.invoice.amount) },
      months: result.months,
    };
  } catch (error) {
    console.error('renewSaaSPlan failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تجديد الباقة' };
  }
}

export async function setSaaSAutoRenew(enabled: boolean) {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const tenant = await prisma.tenant.update({
      where: { id: session.tenantId },
      data: { autoRenew: enabled === true },
      select: { autoRenew: true },
    });
    await prisma.platformSubscription.updateMany({
      where: { tenantId: session.tenantId, status: { in: ['trialing', 'active'] } },
      data: { cancelAtPeriodEnd: !tenant.autoRenew },
    });
    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: enabled ? 'billing.auto_renew_enabled' : 'billing.auto_renew_disabled',
      entityType: 'Tenant',
      entityId: session.tenantId,
    });
    revalidatePath('/dashboard/billing');
    return { success: true, autoRenew: tenant.autoRenew };
  } catch (error) {
    console.error('setSaaSAutoRenew failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث التجديد التلقائي' };
  }
}

export async function getMySaaSPayments() {
  try {
    const session = await requirePermission('billing', { allowInactiveTenant: true });
    const [requests, invoices, plans] = await Promise.all([
      prisma.saaSPaymentRequest.findMany({
        where: { tenantId: session.tenantId },
        select: {
          id: true,
          amount: true,
          method: true,
          senderIdentifier: true,
          transactionId: true,
          status: true,
          notes: true,
          processedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.platformInvoice.findMany({
        where: { tenantId: session.tenantId },
        select: {
          id: true,
          number: true,
          amount: true,
          currency: true,
          status: true,
          dueAt: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.plan.findMany({
        where: { isActive: true },
        select: {
          code: true,
          name: true,
          priceMonthly: true,
          priceYearly: true,
          maxUsers: true,
          maxCustomers: true,
          maxMessages: true,
          features: true,
        },
        orderBy: { priceMonthly: 'asc' },
      }),
    ]);
    return {
      success: true,
      requests: requests.map((item) => ({ ...item, amount: money(item.amount) })),
      invoices: invoices.map((item) => ({ ...item, amount: money(item.amount) })),
      plans: plans.map((plan) => ({
        ...plan,
        priceMonthly: money(plan.priceMonthly),
        priceYearly: plan.priceYearly ? money(plan.priceYearly) : null,
      })),
    };
  } catch (error) {
    console.error('getMySaaSPayments failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تحميل الفوترة',
      requests: [],
      invoices: [],
      plans: [],
    };
  }
}
