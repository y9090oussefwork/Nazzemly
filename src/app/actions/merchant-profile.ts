'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { cleanText, optionalText } from '@/lib/validation';

const CONTACT_TYPES = ['whatsapp', 'telegram', 'facebook', 'instagram', 'email', 'phone', 'website', 'other'] as const;
const PAYMENT_TYPES = ['wallet', 'instapay', 'bank_transfer', 'other'] as const;

function safeUrl(value: unknown) {
  const text = optionalText(value, 500);
  if (!text) return null;
  const normalized = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error('رابط التواصل أو الدفع غير صحيح');
  }
}

function contactUrl(type: string, value: string, customUrl?: unknown) {
  if (customUrl) return safeUrl(customUrl);
  if (type === 'whatsapp') {
    const phone = value.replace(/\D/g, '');
    if (phone.length < 8) throw new Error('رقم واتساب غير صحيح');
    return `https://wa.me/${phone}`;
  }
  if (type === 'telegram') {
    const username = value.replace(/^@/, '').trim();
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) throw new Error('اسم مستخدم تيليجرام غير صحيح');
    return `https://t.me/${username}`;
  }
  if (type === 'email') return `mailto:${value}`;
  if (type === 'phone') return `tel:${value.replace(/\s/g, '')}`;
  if (['facebook', 'instagram', 'website'].includes(type)) return safeUrl(value);
  return null;
}

function setupMissing(input: {
  businessType: string | null;
  contacts: Array<{ type: string }>;
  paymentMethods: Array<{ isActive: boolean }>;
}) {
  const missing: string[] = [];
  if (!input.businessType) missing.push('بيانات النشاط');
  if (!input.contacts.some((item) => item.type === 'whatsapp')) missing.push('واتساب');
  if (!input.contacts.some((item) => item.type === 'telegram')) missing.push('تيليجرام');
  if (!input.paymentMethods.some((item) => item.isActive)) missing.push('وسيلة دفع');
  return missing;
}

export async function getMerchantProfile() {
  const { tenantId } = await getActiveTenant('settings');
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      storeName: true,
      businessType: true,
      businessDescription: true,
      websiteUrl: true,
      currency: true,
      notifEmail: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
      contacts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      paymentMethods: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      botSettings: {
        select: {
          tokenLast4: true,
          botUsername: true,
          isActive: true,
          connectionStatus: true,
          menuConfig: true,
          channelChatId: true,
          channelUrl: true,
          requireChannelJoin: true,
          autoPostServices: true,
          autoPostRestocks: true,
        },
      },
    },
  });
  const missing = setupMissing(tenant);
  return {
    ...tenant,
    onboardingCompletedAt: tenant.onboardingCompletedAt?.toISOString() || null,
    completed: Boolean(tenant.onboardingCompletedAt),
    missing,
  };
}

export async function getMerchantOnboardingState() {
  try {
    const profile = await getMerchantProfile();
    return {
      success: true,
      completed: profile.completed,
      step: profile.onboardingStep,
      missing: profile.missing,
    };
  } catch (error) {
    return {
      success: false,
      completed: true,
      step: 0,
      missing: [],
      error: error instanceof Error ? error.message : 'تعذر فحص إعداد المتجر',
    };
  }
}

export async function saveBusinessProfile(input: {
  storeName: string;
  businessType: string;
  businessDescription?: string;
  websiteUrl?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('settings');
    const data = {
      storeName: cleanText(input.storeName, 'اسم النشاط', 2, 120),
      businessType: cleanText(input.businessType, 'نوع النشاط', 2, 100),
      businessDescription: optionalText(input.businessDescription, 1200),
      websiteUrl: input.websiteUrl ? safeUrl(input.websiteUrl) : null,
    };
    await prisma.$transaction([
      prisma.tenant.update({ where: { id: tenantId }, data }),
      prisma.tenant.updateMany({ where: { id: tenantId, onboardingStep: { lt: 1 } }, data: { onboardingStep: 1 } }),
    ]);
    await writeAuditLog({ tenantId, userId: session.userId, action: 'tenant.profile_updated', entityType: 'Tenant', entityId: tenantId });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ بيانات النشاط' };
  }
}

export async function saveContactMethods(input: {
  contacts: Array<{ type: string; label?: string; value: string; url?: string; showInBot?: boolean }>;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('settings');
    const contacts = input.contacts.slice(0, 20).map((item, index) => {
      const type = CONTACT_TYPES.includes(item.type as (typeof CONTACT_TYPES)[number]) ? item.type : 'other';
      const value = cleanText(item.value, 'بيانات التواصل', 2, 300);
      return {
        tenantId,
        type,
        label: cleanText(item.label || type, 'اسم وسيلة التواصل', 2, 80),
        value,
        url: contactUrl(type, value, item.url),
        isPrimary: index === input.contacts.findIndex((candidate) => candidate.type === item.type),
        showInBot: item.showInBot !== false,
        sortOrder: index,
      };
    });
    if (!contacts.some((item) => item.type === 'whatsapp')) throw new Error('أضف رقم واتساب واحدًا على الأقل');
    if (!contacts.some((item) => item.type === 'telegram')) throw new Error('أضف اسم مستخدم تيليجرام واحدًا على الأقل');
    await prisma.$transaction(async (tx) => {
      await tx.tenantContact.deleteMany({ where: { tenantId } });
      await tx.tenantContact.createMany({ data: contacts });
      await tx.tenant.updateMany({ where: { id: tenantId, onboardingStep: { lt: 2 } }, data: { onboardingStep: 2 } });
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'tenant.contacts_updated', entityType: 'Tenant', entityId: tenantId, metadata: { count: contacts.length } });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ وسائل التواصل' };
  }
}

export async function savePaymentMethods(input: {
  methods: Array<{
    type: string;
    label?: string;
    accountIdentifier: string;
    directPaymentUrl?: string;
    instructions?: string;
    isActive?: boolean;
    showInBot?: boolean;
  }>;
  rechargeAmounts?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('settings');
    const methods = input.methods.slice(0, 12).map((item, index) => {
      const type = PAYMENT_TYPES.includes(item.type as (typeof PAYMENT_TYPES)[number]) ? item.type : 'other';
      return {
        tenantId,
        type,
        label: cleanText(item.label || (type === 'wallet' ? 'محفظة إلكترونية' : type === 'instapay' ? 'InstaPay' : type === 'bank_transfer' ? 'تحويل بنكي' : 'وسيلة دفع'), 'اسم وسيلة الدفع', 2, 100),
        accountIdentifier: cleanText(item.accountIdentifier, 'رقم أو عنوان التحويل', 3, 200),
        directPaymentUrl: item.directPaymentUrl ? safeUrl(item.directPaymentUrl) : null,
        instructions: optionalText(item.instructions, 1000),
        isActive: item.isActive !== false,
        showInBot: item.showInBot !== false,
        sortOrder: index,
      };
    });
    if (!methods.some((item) => item.isActive)) throw new Error('أضف وسيلة دفع مفعلة واحدة على الأقل');
    const rechargeAmounts = (input.rechargeAmounts || '50,100,200,500')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0 && item <= 100000)
      .slice(0, 8);
    if (!rechargeAmounts.length) throw new Error('أدخل قيمة شحن سريعة واحدة على الأقل');
    await prisma.$transaction(async (tx) => {
      await tx.tenantPaymentMethod.deleteMany({ where: { tenantId } });
      await tx.tenantPaymentMethod.createMany({ data: methods });
      const current = await tx.botSettings.findUnique({ where: { tenantId }, select: { menuConfig: true } });
      const menuConfig = current?.menuConfig && typeof current.menuConfig === 'object' && !Array.isArray(current.menuConfig)
        ? current.menuConfig as Record<string, unknown>
        : {};
      await tx.botSettings.upsert({
        where: { tenantId },
        update: { menuConfig: { ...menuConfig, rechargeAmounts } },
        create: { tenantId, botName: 'بوت المتجر', menuConfig: { rechargeAmounts } },
      });
      await tx.tenant.updateMany({ where: { id: tenantId, onboardingStep: { lt: 3 } }, data: { onboardingStep: 3 } });
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'tenant.payment_methods_updated', entityType: 'Tenant', entityId: tenantId, metadata: { count: methods.length } });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ وسائل الدفع' };
  }
}

export async function saveMarketingChannel(input: {
  channelChatId?: string;
  channelUrl?: string;
  requireChannelJoin?: boolean;
  autoPostServices?: boolean;
  autoPostRestocks?: boolean;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('bot');
    const channelChatId = optionalText(input.channelChatId, 120);
    const channelUrl = input.channelUrl ? safeUrl(input.channelUrl) : null;
    if ((input.requireChannelJoin || input.autoPostServices || input.autoPostRestocks) && !channelChatId) {
      throw new Error('أدخل اسم القناة أو رقمها أولًا');
    }
    const settings = await prisma.botSettings.upsert({
      where: { tenantId },
      update: {
        channelChatId,
        channelUrl,
        requireChannelJoin: input.requireChannelJoin === true,
        autoPostServices: input.autoPostServices === true,
        autoPostRestocks: input.autoPostRestocks === true,
      },
      create: {
        tenantId,
        botName: 'بوت المتجر',
        channelChatId,
        channelUrl,
        requireChannelJoin: input.requireChannelJoin === true,
        autoPostServices: input.autoPostServices === true,
        autoPostRestocks: input.autoPostRestocks === true,
      },
      select: { id: true },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'bot.marketing_channel_updated', entityType: 'BotSettings', entityId: settings.id });
    revalidatePath('/dashboard/bot');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ إعدادات القناة' };
  }
}

export async function completeMerchantOnboarding() {
  try {
    const { tenantId, session } = await getActiveTenant('settings');
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        businessType: true,
        contacts: { select: { type: true } },
        paymentMethods: { select: { isActive: true } },
      },
    });
    const missing = setupMissing(tenant);
    if (missing.length) throw new Error(`أكمل أولًا: ${missing.join('، ')}`);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingStep: 4, onboardingCompletedAt: new Date() },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'tenant.onboarding_completed', entityType: 'Tenant', entityId: tenantId });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إكمال إعداد المتجر' };
  }
}
