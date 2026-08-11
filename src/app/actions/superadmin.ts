'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/session';
import { hashPassword } from '@/lib/security';
import { money, requirePositiveMoney } from '@/lib/money';
import { cleanText, dateValue, normalizeUsername, oneOf, optionalText } from '@/lib/validation';
import { writeAuditLog } from '@/lib/audit';

const TENANT_STATUSES = ['active', 'suspended', 'expired', 'cancelled'] as const;
const DEFAULT_PERMISSIONS = [
  'dashboard',
  'customers',
  'customers.write',
  'customers.delete',
  'deals',
  'tasks',
  'team',
  'services',
  'subscriptions',
  'payments',
  'expenses',
  'advertising',
  'bot',
  'billing',
  'settings',
  'audit',
];

function safeError(error: unknown, fallback: string) {
  console.error(fallback, error);
  return error instanceof Error ? error.message : fallback;
}

function slugify(value: string) {
  const base = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'store';
}

async function uniqueSlug(storeName: string) {
  const base = slugify(storeName);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const exists = await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function getSystemStats() {
  try {
    await requireSuperAdmin();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      totalMerchants,
      activeMerchants,
      suspendedMerchants,
      trialing,
      pendingRequests,
      activeUsers,
      activeBots,
      unhealthyBots,
      paidRevenue,
      activeSubscriptions,
      churnedThisMonth,
    ] = await Promise.all([
      prisma.tenant.count({ where: { id: { not: 'system_tenant' } } }),
      prisma.tenant.count({ where: { id: { not: 'system_tenant' }, saasStatus: 'active' } }),
      prisma.tenant.count({ where: { id: { not: 'system_tenant' }, saasStatus: 'suspended' } }),
      prisma.platformSubscription.count({ where: { status: 'trialing', currentPeriodEnd: { gt: now } } }),
      prisma.saaSPaymentRequest.count({ where: { status: 'pending' } }),
      prisma.user.count({ where: { isActive: true, tenantId: { not: 'system_tenant' } } }),
      prisma.botSettings.count({ where: { isActive: true, connectionStatus: 'connected' } }),
      prisma.botSettings.count({
        where: {
          isActive: true,
          OR: [{ connectionStatus: { not: 'connected' } }, { lastError: { not: null } }],
        },
      }),
      prisma.platformInvoice.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.platformSubscription.findMany({
        where: { status: 'active', currentPeriodEnd: { gt: now } },
        select: { plan: { select: { priceMonthly: true } } },
      }),
      prisma.platformSubscription.count({
        where: { status: 'cancelled', canceledAt: { gte: monthStart } },
      }),
    ]);

    const mrr = activeSubscriptions.reduce((sum, item) => sum + money(item.plan.priceMonthly), 0);
    const totalPlatformRevenue = money(paidRevenue._sum.amount);
    return {
      success: true,
      stats: {
        totalMerchants,
        activeMerchants,
        suspendedMerchants,
        expiredMerchants: Math.max(totalMerchants - activeMerchants - suspendedMerchants, 0),
        trialing,
        pendingRequests,
        activeUsers,
        activeBots,
        unhealthyBots,
        totalPlatformRevenue,
        mrr,
        arr: mrr * 12,
        churnedThisMonth,
      },
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل مؤشرات المنصة') };
  }
}

export async function getMerchants(searchInput = '') {
  try {
    await requireSuperAdmin();
    const search = searchInput.trim().slice(0, 100);
    const merchants = await prisma.tenant.findMany({
      where: {
        id: { not: 'system_tenant' },
        ...(search
          ? {
              OR: [
                { storeName: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                { users: { some: { username: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        storeName: true,
        currency: true,
        timezone: true,
        locale: true,
        saasBalance: true,
        saasPlan: true,
        saasStatus: true,
        saasExpiry: true,
        maxUsers: true,
        maxCustomers: true,
        createdAt: true,
        users: {
          where: { role: 'admin' },
          select: { id: true, username: true, email: true, fullName: true, isActive: true },
          take: 3,
        },
        botSettings: {
          select: {
            botUsername: true,
            tokenLast4: true,
            isActive: true,
            connectionStatus: true,
            lastHealthCheckAt: true,
            lastError: true,
          },
        },
        _count: { select: { customers: true, subscriptions: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      success: true,
      merchants: merchants.map((tenant) => ({
        ...tenant,
        saasBalance: money(tenant.saasBalance),
      })),
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل المتاجر'), merchants: [] };
  }
}

export async function createMerchant(data: {
  storeName: string;
  usernameInput: string;
  passwordInput: string;
  email?: string;
  planCode?: string;
  trialDays?: number;
}) {
  try {
    const owner = await requireSuperAdmin();
    const storeName = cleanText(data.storeName, 'اسم النشاط', 2, 100);
    const username = normalizeUsername(data.usernameInput);
    const password = cleanText(data.passwordInput, 'كلمة المرور', 10, 200);
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error('كلمة المرور يجب أن تحتوي على حروف وأرقام');
    }
    const planCode = optionalText(data.planCode, 50) ?? 'basic';
    const trialDays = Math.min(Math.max(Math.trunc(Number(data.trialDays ?? 14)), 1), 90);
    const slug = await uniqueSlug(storeName);

    const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (existing) throw new Error('اسم المستخدم مستخدم بالفعل');

    const plan = await prisma.plan.findFirst({ where: { code: planCode, isActive: true } });
    if (!plan) throw new Error('الباقة المختارة غير متاحة');

    const now = new Date();
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + trialDays);
    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          storeName,
          currency: 'EGP',
          timezone: 'Africa/Cairo',
          locale: 'ar',
          saasPlan: plan.code,
          saasStatus: 'active',
          saasExpiry: expiry,
          maxUsers: plan.maxUsers,
          maxCustomers: plan.maxCustomers,
          botSettings: {
            create: {
              botName: storeName,
              connectionStatus: 'disconnected',
              welcomeMsg: `مرحباً بك في ${storeName}`,
            },
          },
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username,
          email: optionalText(data.email, 254),
          password: passwordHash,
          role: 'admin',
          permissions: DEFAULT_PERMISSIONS,
          isActive: true,
        },
        select: { id: true, username: true },
      });
      await tx.platformSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'trialing',
          startsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: expiry,
        },
      });
      return { tenant, user };
    });

    await writeAuditLog({
      tenantId: result.tenant.id,
      userId: owner.userId,
      action: 'tenant.created',
      entityType: 'Tenant',
      entityId: result.tenant.id,
      metadata: { plan: plan.code, trialDays, adminUsername: result.user.username },
    });
    revalidatePath('/admin');
    return {
      success: true,
      tenant: {
        id: result.tenant.id,
        slug: result.tenant.slug,
        storeName: result.tenant.storeName,
        saasPlan: result.tenant.saasPlan,
        saasStatus: result.tenant.saasStatus,
        saasExpiry: result.tenant.saasExpiry,
      },
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر إنشاء المتجر') };
  }
}

export async function updateMerchantSaaS(
  tenantIdInput: string,
  data: { plan: string; status: string; expiry: string; balance: number },
) {
  try {
    const owner = await requireSuperAdmin();
    const tenantId = cleanText(tenantIdInput, 'المتجر', 5, 100);
    const status = oneOf(data.status, TENANT_STATUSES, 'الحالة');
    const planCode = cleanText(data.plan, 'الباقة', 2, 50);
    const expiry = data.expiry ? dateValue(data.expiry, 'تاريخ الانتهاء') : null;
    const balance = new Prisma.Decimal(Math.max(0, Number(data.balance) || 0).toFixed(2));
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new Error('الباقة غير موجودة');

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        saasPlan: plan.code,
        saasStatus: status,
        saasExpiry: expiry,
        saasBalance: balance,
        maxUsers: plan.maxUsers,
        maxCustomers: plan.maxCustomers,
      },
      select: {
        id: true,
        storeName: true,
        saasPlan: true,
        saasStatus: true,
        saasExpiry: true,
        saasBalance: true,
      },
    });
    await writeAuditLog({
      tenantId,
      userId: owner.userId,
      action: 'tenant.subscription_updated',
      entityType: 'Tenant',
      entityId: tenantId,
      metadata: { plan: plan.code, status, expiry, balance: money(balance) },
    });
    revalidatePath('/admin');
    return { success: true, tenant: { ...updated, saasBalance: money(updated.saasBalance) } };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحديث اشتراك المتجر') };
  }
}

export async function getSaaSPayments() {
  try {
    await requireSuperAdmin();
    const requests = await prisma.saaSPaymentRequest.findMany({
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
        tenant: { select: { id: true, storeName: true, slug: true, saasBalance: true } },
        approvedBy: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      success: true,
      requests: requests.map((item) => ({
        ...item,
        amount: money(item.amount),
        tenant: { ...item.tenant, saasBalance: money(item.tenant.saasBalance) },
      })),
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل مدفوعات المنصة'), requests: [] };
  }
}

export async function approveSaaSPayment(requestIdInput: string, notesInput?: string) {
  try {
    const owner = await requireSuperAdmin();
    const requestId = cleanText(requestIdInput, 'طلب الدفع', 5, 100);
    const notes = optionalText(notesInput, 1000) ?? 'تم التحقق من التحويل وشحن رصيد المتجر';

    const result = await prisma.$transaction(
      async (tx) => {
        const request = await tx.saaSPaymentRequest.findUnique({
          where: { id: requestId },
          select: { id: true, tenantId: true, amount: true, status: true },
        });
        if (!request) throw new Error('طلب الدفع غير موجود');
        if (request.status !== 'pending') throw new Error('تمت معالجة الطلب مسبقاً');

        const claimed = await tx.saaSPaymentRequest.updateMany({
          where: { id: request.id, status: 'pending' },
          data: {
            status: 'approved',
            notes,
            approvedById: owner.userId,
            processedAt: new Date(),
          },
        });
        if (claimed.count !== 1) throw new Error('تمت معالجة الطلب مسبقاً');
        const tenant = await tx.tenant.update({
          where: { id: request.tenantId },
          data: {
            saasBalance: { increment: request.amount },
            saasStatus: 'active',
          },
          select: { id: true, storeName: true, saasBalance: true },
        });
        return { request, tenant };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await writeAuditLog({
      tenantId: result.tenant.id,
      userId: owner.userId,
      action: 'billing.recharge_approved',
      entityType: 'SaaSPaymentRequest',
      entityId: result.request.id,
      metadata: { amount: money(result.request.amount) },
    });
    revalidatePath('/admin');
    return {
      success: true,
      request: { id: result.request.id, status: 'approved' },
      balance: money(result.tenant.saasBalance),
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر اعتماد طلب الشحن') };
  }
}

export async function rejectSaaSPayment(requestIdInput: string, notesInput: string) {
  try {
    const owner = await requireSuperAdmin();
    const requestId = cleanText(requestIdInput, 'طلب الدفع', 5, 100);
    const notes = cleanText(notesInput, 'سبب الرفض', 3, 1000);
    const current = await prisma.saaSPaymentRequest.findUnique({
      where: { id: requestId },
      select: { tenantId: true },
    });
    if (!current) throw new Error('طلب الدفع غير موجود');

    const changed = await prisma.saaSPaymentRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'rejected',
        notes,
        approvedById: owner.userId,
        processedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new Error('تمت معالجة الطلب مسبقاً');
    await writeAuditLog({
      tenantId: current.tenantId,
      userId: owner.userId,
      action: 'billing.recharge_rejected',
      entityType: 'SaaSPaymentRequest',
      entityId: requestId,
      metadata: { notes },
    });
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر رفض طلب الشحن') };
  }
}

export async function getPlans() {
  try {
    await requireSuperAdmin();
    const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } });
    return {
      success: true,
      plans: plans.map((plan) => ({
        ...plan,
        priceMonthly: money(plan.priceMonthly),
        priceYearly: plan.priceYearly ? money(plan.priceYearly) : null,
      })),
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل الباقات'), plans: [] };
  }
}

export async function savePlan(input: {
  id?: string;
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly?: number | null;
  maxUsers: number;
  maxCustomers: number;
  maxMessages: number;
  features: string[];
  isActive?: boolean;
}) {
  try {
    const owner = await requireSuperAdmin();
    const code = cleanText(input.code, 'رمز الباقة', 2, 30).toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(code)) throw new Error('رمز الباقة غير صالح');
    const name = cleanText(input.name, 'اسم الباقة', 2, 80);
    const priceMonthly = new Prisma.Decimal(requirePositiveMoney(input.priceMonthly, 'السعر الشهري'));
    const priceYearly =
      input.priceYearly == null || Number(input.priceYearly) <= 0
        ? null
        : new Prisma.Decimal(requirePositiveMoney(input.priceYearly, 'السعر السنوي'));
    const limits = {
      maxUsers: Math.min(Math.max(Math.trunc(Number(input.maxUsers)), 1), 10_000),
      maxCustomers: Math.min(Math.max(Math.trunc(Number(input.maxCustomers)), 1), 10_000_000),
      maxMessages: Math.min(Math.max(Math.trunc(Number(input.maxMessages)), 0), 100_000_000),
    };
    const features = Array.from(
      new Set(input.features.map((item) => item.trim()).filter(Boolean).slice(0, 100)),
    );

    const plan = input.id
      ? await prisma.plan.update({
          where: { id: input.id },
          data: {
            code,
            name,
            priceMonthly,
            priceYearly,
            ...limits,
            features,
            isActive: input.isActive ?? true,
          },
        })
      : await prisma.plan.create({
          data: {
            code,
            name,
            priceMonthly,
            priceYearly,
            ...limits,
            features,
            isActive: input.isActive ?? true,
          },
        });

    await writeAuditLog({
      userId: owner.userId,
      action: input.id ? 'plan.updated' : 'plan.created',
      entityType: 'Plan',
      entityId: plan.id,
      metadata: { code, priceMonthly: money(priceMonthly), ...limits },
    });
    revalidatePath('/admin');
    return {
      success: true,
      plan: {
        ...plan,
        priceMonthly: money(plan.priceMonthly),
        priceYearly: plan.priceYearly ? money(plan.priceYearly) : null,
      },
    };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر حفظ الباقة') };
  }
}

export async function getPlatformAuditLogs() {
  try {
    await requireSuperAdmin();
    const logs = await prisma.auditLog.findMany({
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        tenant: { select: { storeName: true } },
        user: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return { success: true, logs };
  } catch (error) {
    return { success: false, error: safeError(error, 'تعذر تحميل سجل التدقيق'), logs: [] };
  }
}
