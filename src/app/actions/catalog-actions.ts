'use server';

import { revalidatePath } from 'next/cache';
import { Bot } from 'grammy';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { decryptBotToken } from '@/lib/telegram-manager';
import { publishCatalogUpdate } from '@/lib/telegram-marketing';
import { assertMerchantOnboardingComplete } from '@/lib/merchant-onboarding';

type CategoryInput = {
  id?: string;
  name: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
  showInBot?: boolean;
  isActive?: boolean;
};

type ServiceInput = {
  id?: string;
  categoryId?: string;
  name: string;
  icon?: string;
  description?: string;
  features?: string[];
  defaultDuration?: number;
  defaultSellingPrice: number;
  defaultCostPrice?: number;
  showInBot?: boolean;
  isActive?: boolean;
};

type PlanInput = {
  id?: string;
  serviceId: string;
  name: string;
  durationDays: number;
  price: number;
  costPrice?: number;
  trackInventory?: boolean;
  stockQuantity?: number;
  showInBot?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

const money = (value: unknown) => Number(value ?? 0);

function requiredText(value: unknown, label: string, max = 160) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} مطلوب`);
  if (text.length > max) throw new Error(`${label} أطول من المسموح`);
  return text;
}

function optionalText(value: unknown, max = 1000) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > max) throw new Error('النص أطول من المسموح');
  return text;
}

function positiveInt(value: unknown, label: string, max = 3650) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new Error(`${label} غير صحيح`);
  }
  return number;
}

function nonNegativeMoney(value: unknown, label: string) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || number > 10_000_000) {
    throw new Error(`${label} غير صحيح`);
  }
  return Math.round(number * 100) / 100;
}

function toPlanDto(
  plan: {
    id: string;
    name: string;
    durationDays: number;
    price: unknown;
    costPrice: unknown;
    trackInventory: boolean;
    stockQuantity: number;
    showInBot: boolean;
    isActive: boolean;
    sortOrder: number;
    fulfillmentMode: string;
    requiredCustomerFields: unknown;
    statusTemplates: unknown;
    purchaseMessage: string | null;
    warrantyType: string;
    warrantyDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  baseDuration: number,
  basePrice: number,
) {
  const price = money(plan.price);
  const referencePrice = Math.round((basePrice * plan.durationDays * 100) / Math.max(baseDuration, 1)) / 100;
  const savings = Math.max(0, Math.round((referencePrice - price) * 100) / 100);
  const savingsPercent = referencePrice > 0 ? Math.round((savings / referencePrice) * 100) : 0;
  return {
    ...plan,
    price,
    costPrice: money(plan.costPrice),
    referencePrice,
    savings,
    savingsPercent,
    available: !plan.trackInventory || plan.stockQuantity > 0,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

async function notifyWaitingCustomers(tenantId: string, planId: string) {
  const [settings, plan, interests] = await Promise.all([
    prisma.botSettings.findUnique({ where: { tenantId } }),
    prisma.servicePlan.findFirst({
      where: { id: planId, tenantId },
      include: { service: { select: { name: true } } },
    }),
    prisma.serviceInterest.findMany({
      where: { tenantId, servicePlanId: planId, status: 'waiting' },
      include: { customer: { select: { tgId: true } } },
    }),
  ]);
  if (!settings?.isActive || !plan || !interests.length) return 0;

  let bot: Bot;
  try {
    bot = new Bot(decryptBotToken(settings));
  } catch {
    return 0;
  }

  let sent = 0;
  for (const interest of interests) {
    if (!interest.customer.tgId) continue;
    try {
      await bot.api.sendMessage(
        interest.customer.tgId,
        `✅ الخدمة متاحة الآن\n\n${plan.service.name} — ${plan.name}\nالسعر: ${money(plan.price).toFixed(2)}\n\nيمكنك فتح قائمة الخدمات وطلبها الآن.`,
      );
      await prisma.serviceInterest.update({
        where: { id: interest.id },
        data: { status: 'notified', notifiedAt: new Date() },
      });
      sent += 1;
    } catch (error) {
      console.error('Could not send restock notification', error);
    }
  }
  return sent;
}

export async function getCatalog() {
  const { tenantId, currency } = await getActiveTenant('services', { allowInactiveTenant: true });
  const [categories, uncategorizedServices, waitingCount] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        services: {
          orderBy: { name: 'asc' },
          include: {
            plans: { orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }] },
            _count: { select: { subscriptions: true, interests: true } },
          },
        },
      },
    }),
    prisma.service.findMany({
      where: { tenantId, categoryId: null },
      orderBy: { name: 'asc' },
      include: {
        plans: { orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }] },
        _count: { select: { subscriptions: true, interests: true } },
      },
    }),
    prisma.serviceInterest.count({ where: { tenantId, status: 'waiting' } }),
  ]);

  type ServiceRow = (typeof uncategorizedServices)[number];
  const serviceDto = (service: ServiceRow) => {
    const defaultSellingPrice = money(service.defaultSellingPrice);
    return {
      ...service,
      defaultSellingPrice,
      defaultCostPrice: money(service.defaultCostPrice),
      plans: service.plans.map((plan) =>
        toPlanDto(plan, service.defaultDuration, defaultSellingPrice),
      ),
      createdAt: service.createdAt.toISOString(),
      updatedAt: service.updatedAt.toISOString(),
    };
  };

  return {
    currency,
    waitingCount,
    categories: categories.map((category) => ({
      ...category,
      services: category.services.map((service) => serviceDto(service)),
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    })),
    uncategorizedServices: uncategorizedServices.map(serviceDto),
  };
}

export async function saveServiceCategory(input: CategoryInput) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    await assertMerchantOnboardingComplete(tenantId);
    const data = {
      name: requiredText(input.name, 'اسم التصنيف', 100),
      icon: optionalText(input.icon, 8),
      description: optionalText(input.description, 500),
      sortOrder: Math.max(0, Math.min(999, Number(input.sortOrder ?? 0) || 0)),
      showInBot: input.showInBot !== false,
      isActive: input.isActive !== false,
    };
    const category = input.id
      ? await prisma.serviceCategory.update({ where: { id: input.id, tenantId }, data })
      : await prisma.serviceCategory.create({ data: { tenantId, ...data } });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: input.id ? 'catalog.category_updated' : 'catalog.category_created',
      entityType: 'ServiceCategory',
      entityId: category.id,
    });
    revalidatePath('/dashboard/services');
    return { success: true, categoryId: category.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ التصنيف' };
  }
}

export async function saveCatalogService(input: ServiceInput) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    await assertMerchantOnboardingComplete(tenantId);
    if (input.categoryId) {
      const category = await prisma.serviceCategory.findFirst({
        where: { id: input.categoryId, tenantId },
        select: { id: true },
      });
      if (!category) throw new Error('التصنيف غير موجود');
    }

    const defaultDuration = positiveInt(input.defaultDuration ?? 30, 'المدة الأساسية');
    const defaultSellingPrice = nonNegativeMoney(input.defaultSellingPrice, 'سعر الاشتراك الأساسي');
    if (defaultSellingPrice <= 0) throw new Error('سعر الاشتراك الأساسي يجب أن يكون أكبر من صفر');
    const features = (input.features ?? [])
      .map((feature) => String(feature).trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((feature) => feature.slice(0, 180));
    const data = {
      categoryId: input.categoryId || null,
      name: requiredText(input.name, 'اسم الخدمة', 120),
      icon: optionalText(input.icon, 8),
      description: optionalText(input.description, 1500),
      features,
      defaultDuration,
      defaultSellingPrice,
      defaultCostPrice: nonNegativeMoney(input.defaultCostPrice, 'سعر التكلفة'),
      showInBot: input.showInBot !== false,
      isActive: input.isActive !== false,
    };

    const service = await prisma.$transaction(async (tx) => {
      if (input.id) {
        const existing = await tx.service.findFirst({ where: { id: input.id, tenantId }, select: { id: true } });
        if (!existing) throw new Error('الخدمة غير موجودة');
        return tx.service.update({ where: { id: input.id }, data });
      }
      const created = await tx.service.create({ data: { tenantId, ...data } });
      await tx.servicePlan.create({
        data: {
          tenantId,
          serviceId: created.id,
          name: defaultDuration === 30 ? 'شهر واحد' : `${defaultDuration} يوم`,
          durationDays: defaultDuration,
          price: defaultSellingPrice,
          costPrice: data.defaultCostPrice,
          trackInventory: false,
          stockQuantity: 0,
          showInBot: true,
        },
      });
      return created;
    });

    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: input.id ? 'catalog.service_updated' : 'catalog.service_created',
      entityType: 'Service',
      entityId: service.id,
      metadata: { categoryId: data.categoryId, showInBot: data.showInBot },
    });
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/manage');
    if (!input.id) {
      await publishCatalogUpdate({ tenantId, kind: 'service', serviceId: service.id, serviceName: service.name, description: service.description });
    }
    return { success: true, serviceId: service.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ الخدمة' };
  }
}

export async function saveServicePlan(input: PlanInput) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    await assertMerchantOnboardingComplete(tenantId);
    const service = await prisma.service.findFirst({
      where: { id: input.serviceId, tenantId },
      select: { id: true, name: true },
    });
    if (!service) throw new Error('الخدمة غير موجودة');

    const trackInventory = input.trackInventory === true;
    const stockQuantity = trackInventory
      ? Math.max(0, Math.min(1_000_000, Math.trunc(Number(input.stockQuantity ?? 0) || 0)))
      : 0;
    const data = {
      serviceId: service.id,
      name: requiredText(input.name, 'اسم المدة', 100),
      durationDays: positiveInt(input.durationDays, 'مدة الاشتراك'),
      price: nonNegativeMoney(input.price, 'السعر'),
      costPrice: nonNegativeMoney(input.costPrice, 'التكلفة'),
      trackInventory,
      stockQuantity,
      showInBot: input.showInBot !== false,
      isActive: input.isActive !== false,
      sortOrder: Math.max(0, Math.min(999, Number(input.sortOrder ?? 0) || 0)),
    };
    if (data.price <= 0) throw new Error('السعر يجب أن يكون أكبر من صفر');

    const previous = input.id
      ? await prisma.servicePlan.findFirst({
          where: { id: input.id, tenantId },
          select: { stockQuantity: true, trackInventory: true },
        })
      : null;
    const plan = input.id
      ? await prisma.servicePlan.update({ where: { id: input.id, tenantId }, data })
      : await prisma.servicePlan.create({ data: { tenantId, ...data } });

    const becameAvailable =
      data.trackInventory && data.stockQuantity > 0 && (!previous || !previous.trackInventory || previous.stockQuantity <= 0);
    const notifiedCount = becameAvailable ? await notifyWaitingCustomers(tenantId, plan.id) : 0;
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: input.id ? 'catalog.plan_updated' : 'catalog.plan_created',
      entityType: 'ServicePlan',
      entityId: plan.id,
      metadata: { stockQuantity, becameAvailable, notifiedCount },
    });
    revalidatePath('/dashboard/services');
    if (becameAvailable) {
      await publishCatalogUpdate({ tenantId, kind: 'restock', serviceId: service.id, serviceName: service.name, planName: plan.name, stockQuantity: plan.stockQuantity });
    }
    return { success: true, planId: plan.id, notifiedCount };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ مدة الاشتراك' };
  }
}

export async function setCatalogItemState(input: {
  type: 'category' | 'service' | 'plan';
  id: string;
  isActive?: boolean;
  showInBot?: boolean;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    const data = {
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      ...(typeof input.showInBot === 'boolean' ? { showInBot: input.showInBot } : {}),
    };
    if (!Object.keys(data).length) throw new Error('لا يوجد تغيير للحفظ');
    if (input.type === 'category') {
      await prisma.serviceCategory.update({ where: { id: input.id, tenantId }, data });
    } else if (input.type === 'service') {
      await prisma.service.update({ where: { id: input.id, tenantId }, data });
    } else {
      await prisma.servicePlan.update({ where: { id: input.id, tenantId }, data });
    }
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'catalog.state_updated',
      entityType: input.type,
      entityId: input.id,
      metadata: data,
    });
    revalidatePath('/dashboard/services');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث الحالة' };
  }
}

export async function getServiceInterests() {
  const { tenantId } = await getActiveTenant('services', { allowInactiveTenant: true });
  const rows = await prisma.serviceInterest.findMany({
    where: { tenantId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 300,
    include: {
      customer: { select: { id: true, name: true, phone: true, tgUsername: true, tgId: true } },
      service: { select: { id: true, name: true } },
      servicePlan: { select: { id: true, name: true, stockQuantity: true, trackInventory: true } },
    },
  });
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
  }));
}

export async function updateServiceInterest(input: {
  id: string;
  status: 'waiting' | 'contacted' | 'notified' | 'converted' | 'closed';
}) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    const interest = await prisma.serviceInterest.update({
      where: { id: input.id, tenantId },
      data: { status: input.status },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'catalog.interest_updated',
      entityType: 'ServiceInterest',
      entityId: interest.id,
      metadata: { status: input.status },
    });
    revalidatePath('/dashboard/services');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث طلب الاهتمام' };
  }
}
