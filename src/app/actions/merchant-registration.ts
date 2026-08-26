'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/security';
import { cleanText, normalizeUsername, optionalText } from '@/lib/validation';
import { attachReferralCode, ensureReferralProgram } from '@/lib/referrals';
import { writeAuditLog } from '@/lib/audit';

const MERCHANT_PERMISSIONS = ['dashboard', 'customers', 'customers.write', 'customers.delete', 'deals', 'tasks', 'team', 'services', 'subscriptions', 'payments', 'expenses', 'advertising', 'bot', 'billing', 'settings', 'audit'];

function slugify(value: string) {
  const base = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42);
  return base || 'store';
}

async function uniqueSlug(storeName: string) {
  const base = slugify(storeName);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    if (!await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } })) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function registerMerchantFromReferral(input: { storeName: string; username: string; password: string; email?: string; referralCode?: string }) {
  try {
    const storeName = cleanText(input.storeName, 'اسم النشاط', 2, 100);
    const username = normalizeUsername(input.username);
    const password = cleanText(input.password, 'كلمة المرور', 10, 200);
    const referralCode = optionalText(input.referralCode, 32)?.toUpperCase() || null;
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) throw new Error('كلمة المرور يجب أن تحتوي على حروف وأرقام');
    if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new Error('اسم المستخدم مستخدم بالفعل');
    const plan = await prisma.plan.findFirst({ where: { code: 'basic', isActive: true } }) || await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: 'asc' } });
    if (!plan) throw new Error('لا توجد باقة متاحة لإنشاء المتجر حالياً');
    const now = new Date();
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + 14);
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: await uniqueSlug(storeName), storeName, currency: 'EGP', timezone: 'Africa/Cairo', locale: 'ar',
          saasPlan: plan.code, saasStatus: 'active', saasExpiry: expiry, maxUsers: plan.maxUsers, maxCustomers: plan.maxCustomers,
          botSettings: { create: { botName: storeName, connectionStatus: 'disconnected', welcomeMsg: `مرحباً بك في ${storeName}` } },
        },
      });
      const user = await tx.user.create({ data: { tenantId: tenant.id, username, email: optionalText(input.email, 254), password: await hashPassword(password), role: 'admin', permissions: MERCHANT_PERMISSIONS } });
      await tx.platformSubscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'trialing', startsAt: now, currentPeriodStart: now, currentPeriodEnd: expiry } });
      await ensureReferralProgram(tx, tenant.id);
      await attachReferralCode(tx, { referredTenantId: tenant.id, code: referralCode });
      return { tenant, user };
    });
    await writeAuditLog({ tenantId: result.tenant.id, userId: result.user.id, action: referralCode ? 'tenant.registered_from_referral' : 'tenant.self_registered', entityType: 'Tenant', entityId: result.tenant.id, metadata: { referralCode } });
    return { success: true };
  } catch (error) {
    console.error('merchant referral registration failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إنشاء المتجر' };
  }
}
