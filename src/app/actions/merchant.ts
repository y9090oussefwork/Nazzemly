'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { configureTelegramBot, getTelegramHealth } from '@/lib/telegram-manager';
import { encryptSecret } from '@/lib/security';
import { money, requirePositiveMoney } from '@/lib/money';
import { syncDueRecurringExpenses } from '@/lib/recurring-expenses';
import { assertMerchantOnboardingComplete } from '@/lib/merchant-onboarding';
import {
  cleanText,
  dateValue,
  normalizePhone,
  optionalEmail,
  optionalText,
  oneOf,
} from '@/lib/validation';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}

function customerDto(customer: Record<string, unknown>) {
  return { ...customer, walletBalance: money(customer.walletBalance as never) };
}

function serviceDto(service: Record<string, unknown>) {
  const plans = Array.isArray(service.plans)
    ? service.plans.map((plan) => {
        const item = plan as Record<string, unknown>;
        return { ...item, price: money(item.price as never), costPrice: money(item.costPrice as never) };
      })
    : undefined;
  return {
    ...service,
    ...(plans ? { plans } : {}),
    defaultSellingPrice: money(service.defaultSellingPrice as never),
    defaultCostPrice: money(service.defaultCostPrice as never),
  };
}

function subscriptionDto(subscription: Record<string, unknown>) {
  return {
    ...subscription,
    sellingPrice: money(subscription.sellingPrice as never),
    priceBeforeDiscount: money(subscription.priceBeforeDiscount as never),
    discountValue: money(subscription.discountValue as never),
    discountAmount: money(subscription.discountAmount as never),
    costPrice: money(subscription.costPrice as never),
  };
}

function subscriptionPricing(basePriceInput: unknown, typeInput?: string, valueInput?: number) {
  const basePrice = Math.round(money(basePriceInput as never) * 100) / 100;
  if (basePrice <= 0) throw new Error('سعر الخطة غير صحيح');
  const discountType = typeInput === 'percentage' || typeInput === 'fixed' ? typeInput : null;
  const discountValue = discountType ? Math.max(0, Number(valueInput || 0)) : 0;
  if (!Number.isFinite(discountValue)) throw new Error('قيمة الخصم غير صحيحة');
  if (discountType === 'percentage' && discountValue > 100) throw new Error('نسبة الخصم لا يمكن أن تتجاوز 100%');
  if (discountType === 'fixed' && discountValue > basePrice) throw new Error('قيمة الخصم أكبر من سعر الاشتراك');
  const rawDiscount = discountType === 'percentage' ? basePrice * discountValue / 100 : discountType === 'fixed' ? discountValue : 0;
  const discountAmount = Math.round(rawDiscount * 100) / 100;
  const sellingPrice = Math.max(0, Math.round((basePrice - discountAmount) * 100) / 100);
  return { basePrice, discountType, discountValue, discountAmount, sellingPrice };
}

export async function getDashboardStats() {
  try {
    const { tenantId } = await getActiveTenant('dashboard');
    await syncDueRecurringExpenses(tenantId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const reminderBoundary = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      activeSubs,
      expiringSoon,
      expiredSubs,
      revenue,
      cost,
      expenses,
      ads,
      newCustomers,
      recentSubs,
      openTasks,
      pipeline,
    ] = await Promise.all([
      prisma.customer.count({ where: { tenantId, deletedAt: null } }),
      prisma.subscription.count({ where: { tenantId, status: 'active', endDate: { gt: reminderBoundary } } }),
      prisma.subscription.count({ where: { tenantId, status: 'active', endDate: { gt: now, lte: reminderBoundary } } }),
      prisma.subscription.count({ where: { tenantId, OR: [{ status: 'expired' }, { endDate: { lte: now } }] } }),
      prisma.subscription.aggregate({
        where: { tenantId, createdAt: { gte: startOfMonth }, status: { not: 'canceled' } },
        _sum: { sellingPrice: true },
      }),
      prisma.subscription.aggregate({
        where: { tenantId, createdAt: { gte: startOfMonth }, status: { not: 'canceled' } },
        _sum: { costPrice: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.adCampaign.aggregate({
        where: { tenantId, date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.customer.count({ where: { tenantId, deletedAt: null, createdAt: { gte: startOfMonth } } }),
      prisma.subscription.findMany({
        where: { tenantId },
        select: {
          id: true,
          sellingPrice: true,
          createdAt: true,
          customer: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      prisma.task.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
      prisma.deal.aggregate({
        where: { tenantId, stage: { notIn: ['won', 'lost'] } },
        _sum: { value: true },
        _count: true,
      }),
    ]);

    const monthlyRevenue = money(revenue._sum.sellingPrice);
    const monthlyCost = money(cost._sum.costPrice);
    const monthlyExpenses = money(expenses._sum.amount);
    const monthlyAds = money(ads._sum.amount);

    return {
      success: true,
      stats: {
        totalCustomers,
        activeSubs,
        expiringSoon,
        expiredSubs,
        monthlyRevenue,
        monthlyExpenses,
        monthlyAds,
        netProfit: money(monthlyRevenue - monthlyCost - monthlyExpenses - monthlyAds),
        newCustomers,
        openTasks,
        pipelineValue: money(pipeline._sum.value),
        pipelineDeals: pipeline._count,
        recentActivity: recentSubs.map((item) => ({
          id: item.id,
          text: 'تم بيع ' + item.service.name + ' للعميل ' + item.customer.name,
          amount: money(item.sellingPrice),
          date: item.createdAt,
        })),
      },
    };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getCustomers(options?: { search?: string; page?: number; pageSize?: number }) {
  try {
    const { tenantId } = await getActiveTenant('customers');
    const page = Math.max(1, Number(options?.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(options?.pageSize) || 50));
    const search = options?.search?.trim();

    const where = {
      tenantId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { company: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          company: true,
          stage: true,
          source: true,
          tags: true,
          walletBalance: true,
          notes: true,
          tgUsername: true,
          assignedToId: true,
          createdAt: true,
          updatedAt: true,
          lastContactAt: true,
          assignedTo: { select: { id: true, fullName: true, username: true } },
          _count: { select: { subscriptions: true, tasks: true, deals: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      success: true,
      customers: customers.map((item) => customerDto(item)),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    };
  } catch (error) {
    return { success: false, error: errorMessage(error), customers: [] };
  }
}

export async function addCustomer(data: {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  company?: string;
  stage?: string;
  source?: string;
  tags?: string[];
  assignedToId?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('customers');
    await assertMerchantOnboardingComplete(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxCustomers: true, _count: { select: { customers: true } } },
    });
    if (tenant && tenant._count.customers >= tenant.maxCustomers) {
      throw new Error('تم الوصول إلى الحد الأقصى للعملاء في الباقة');
    }

    if (data.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: data.assignedToId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!assignee) throw new Error('الموظف المحدد غير صالح');
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        assignedToId: data.assignedToId || null,
        name: cleanText(data.name, 'اسم العميل', 2, 120),
        phone: normalizePhone(data.phone),
        email: optionalEmail(data.email),
        company: optionalText(data.company, 120),
        stage: oneOf(data.stage || 'lead', ['lead', 'qualified', 'customer', 'inactive'] as const, 'مرحلة العميل'),
        source: optionalText(data.source, 80),
        tags: Array.isArray(data.tags) ? data.tags.map((tag) => cleanText(tag, 'الوسم', 1, 30)).slice(0, 20) : [],
        notes: optionalText(data.notes),
        createdBy: session.userId,
        activities: {
          create: {
            tenantId,
            userId: session.userId,
            type: 'created',
            title: 'تم إنشاء العميل',
          },
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        company: true,
        stage: true,
        source: true,
        tags: true,
        walletBalance: true,
        notes: true,
        createdAt: true,
      },
    });

    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'customer.create',
      entityType: 'Customer',
      entityId: customer.id,
    });
    return { success: true, customer: customerDto(customer) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function updateCustomer(
  id: string,
  data: {
    name: string;
    phone: string;
    email?: string;
    notes?: string;
    company?: string;
    stage?: string;
    source?: string;
    tags?: string[];
    assignedToId?: string;
  },
) {
  try {
    const { tenantId, session } = await getActiveTenant('customers');
    const customer = await prisma.customer.update({
      where: { id, tenantId, deletedAt: null },
      data: {
        assignedToId: data.assignedToId || null,
        name: cleanText(data.name, 'اسم العميل', 2, 120),
        phone: normalizePhone(data.phone),
        email: optionalEmail(data.email),
        company: optionalText(data.company, 120),
        stage: oneOf(data.stage || 'customer', ['lead', 'qualified', 'customer', 'inactive'] as const, 'مرحلة العميل'),
        source: optionalText(data.source, 80),
        tags: Array.isArray(data.tags) ? data.tags.map((tag) => cleanText(tag, 'الوسم', 1, 30)).slice(0, 20) : [],
        notes: optionalText(data.notes),
        lastContactAt: new Date(),
        activities: {
          create: {
            tenantId,
            userId: session.userId,
            type: 'updated',
            title: 'تم تحديث بيانات العميل',
          },
        },
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'customer.update',
      entityType: 'Customer',
      entityId: id,
    });
    return { success: true, customer: customerDto(customer) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteCustomer(id: string) {
  try {
    const { tenantId, session } = await getActiveTenant('customers.delete');
    await prisma.customer.update({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), stage: 'inactive' },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'customer.archive',
      entityType: 'Customer',
      entityId: id,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getServices() {
  try {
    const { tenantId } = await getActiveTenant('services');
    const services = await prisma.service.findMany({
      where: { tenantId, isActive: true },
      include: { category: true, plans: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }] }, _count: { select: { subscriptions: true, accountPool: true } } },
      orderBy: { name: 'asc' },
    });
    return { success: true, services: services.map((item) => serviceDto(item)) };
  } catch (error) {
    return { success: false, error: errorMessage(error), services: [] };
  }
}

export async function addService(data: {
  name: string;
  description?: string;
  defaultDuration: number;
  defaultSellingPrice: number;
  defaultCostPrice?: number;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    await assertMerchantOnboardingComplete(tenantId);
    const duration = Math.min(3650, Math.max(1, Number(data.defaultDuration)));
    const sellingPrice = requirePositiveMoney(data.defaultSellingPrice, 'سعر البيع');
    const costPrice = Math.max(0, money(data.defaultCostPrice || 0));
    const service = await prisma.$transaction(async (tx) => {
      const created = await tx.service.create({
        data: {
          tenantId,
          name: cleanText(data.name, 'اسم الخدمة', 2, 120),
          description: optionalText(data.description),
          defaultDuration: duration,
          defaultSellingPrice: sellingPrice,
          defaultCostPrice: costPrice,
        },
      });
      await tx.servicePlan.create({
        data: {
          tenantId,
          serviceId: created.id,
          name: duration === 30 ? 'شهر واحد' : `${duration} يوم`,
          durationDays: duration,
          price: sellingPrice,
          costPrice,
          trackInventory: false,
          showInBot: true,
        },
      });
      return created;
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'service.create',
      entityType: 'Service',
      entityId: service.id,
    });
    return { success: true, service: serviceDto(service) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
export async function updateService(
  id: string,
  data: {
    name: string;
    description?: string;
    defaultDuration: number;
    defaultSellingPrice: number;
    defaultCostPrice?: number;
  },
) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    const service = await prisma.service.update({
      where: { id, tenantId },
      data: {
        name: cleanText(data.name, 'اسم الخدمة', 2, 120),
        description: optionalText(data.description),
        defaultDuration: Math.min(3650, Math.max(1, Number(data.defaultDuration))),
        defaultSellingPrice: requirePositiveMoney(data.defaultSellingPrice, 'سعر البيع'),
        defaultCostPrice: Math.max(0, money(data.defaultCostPrice || 0)),
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'service.update',
      entityType: 'Service',
      entityId: id,
    });
    return { success: true, service: serviceDto(service) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteService(id: string) {
  try {
    const { tenantId, session } = await getActiveTenant('services.delete');
    await prisma.service.update({ where: { id, tenantId }, data: { isActive: false } });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'service.archive',
      entityType: 'Service',
      entityId: id,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getSubscriptions() {
  try {
    const { tenantId } = await getActiveTenant('subscriptions');
    const subscriptions = await prisma.subscription.findMany({
      where: { tenantId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, defaultDuration: true } },
        servicePlan: { select: { id: true, name: true, durationDays: true } },
      },
      orderBy: { endDate: 'asc' },
      take: 500,
    });
    return { success: true, subscriptions: subscriptions.map((item) => subscriptionDto(item)) };
  } catch (error) {
    return { success: false, error: errorMessage(error), subscriptions: [] };
  }
}

export async function addSubscription(data: {
  customerId: string;
  serviceId: string;
  servicePlanId?: string;
  package?: string;
  startDate: string;
  endDate?: string;
  sellingPrice?: number;
  costPrice?: number;
  discountType?: string;
  discountValue?: number;
  notes?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    await assertMerchantOnboardingComplete(tenantId);
    const [customer, service, requestedPlan] = await Promise.all([
      prisma.customer.findFirst({ where: { id: data.customerId, tenantId, deletedAt: null }, select: { id: true } }),
      prisma.service.findFirst({ where: { id: data.serviceId, tenantId, isActive: true } }),
      data.servicePlanId
        ? prisma.servicePlan.findFirst({ where: { id: data.servicePlanId, serviceId: data.serviceId, tenantId, isActive: true } })
        : prisma.servicePlan.findFirst({ where: { serviceId: data.serviceId, tenantId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }] }),
    ]);
    if (!customer || !service) throw new Error('العميل أو الخدمة لا يتبع هذا المتجر');
    if (data.servicePlanId && !requestedPlan) throw new Error('مدة الاشتراك غير متاحة');
    const plan = requestedPlan;

    const startDate = dateValue(data.startDate, 'تاريخ البداية');
    const duration = plan?.durationDays || service.defaultDuration;
    const endDate = data.endDate
      ? dateValue(data.endDate, 'تاريخ النهاية')
      : new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
    if (endDate <= startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد البداية');
    const pricing = subscriptionPricing(plan?.price || service.defaultSellingPrice, data.discountType, data.discountValue);
    const costPrice = Math.max(0, money(plan?.costPrice || service.defaultCostPrice));

    const subscription = await prisma.$transaction(async (tx) => {
      if (plan?.trackInventory) {
        const stock = await tx.servicePlan.updateMany({
          where: { id: plan.id, tenantId, stockQuantity: { gt: 0 } },
          data: { stockQuantity: { decrement: 1 } },
        });
        if (stock.count !== 1) throw new Error('لا يوجد مخزون متاح لهذه المدة');
      }
      return tx.subscription.create({
        data: {
          tenantId,
          customerId: customer.id,
          serviceId: service.id,
          servicePlanId: plan?.id || null,
          orderNo: 'SUB-' + Date.now().toString(36).toUpperCase(),
          package: optionalText(data.package, 100) || plan?.name || null,
          startDate,
          endDate,
          sellingPrice: pricing.sellingPrice,
          priceBeforeDiscount: pricing.basePrice,
          discountType: pricing.discountType,
          discountValue: pricing.discountValue,
          discountAmount: pricing.discountAmount,
          costPrice,
          status: 'active',
          notes: optionalText(data.notes),
          createdBy: session.userId,
        },
      });
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'subscription.create',
      entityType: 'Subscription',
      entityId: subscription.id,
      metadata: {
        servicePlanId: plan?.id || null,
        priceBeforeDiscount: pricing.basePrice,
        discountAmount: pricing.discountAmount,
        sellingPrice: pricing.sellingPrice,
      },
    });
    return { success: true, subscription: subscriptionDto(subscription) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
export async function extendSubscription(
  id: string,
  data: { days?: number; notes?: string },
) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const days = Math.floor(Number(data.days || 0));
    const hasNotes = typeof data.notes === 'string';
    if ((!hasNotes && days < 1) || !Number.isFinite(days) || days < 0 || days > 3650) throw new Error('أدخل مدة صحيحة من يوم إلى 3650 يوماً');
    const current = await prisma.subscription.findFirst({ where: { id, tenantId } });
    if (!current) throw new Error('الاشتراك غير موجود');
    if (current.status === 'canceled') throw new Error('لا يمكن تمديد اشتراك ملغي؛ أنشئ أو جدّد اشتراكاً جديداً');

    const now = new Date();
    const base = current.endDate > now ? current.endDate : now;
    const endDate = new Date(base);
    endDate.setUTCDate(endDate.getUTCDate() + days);
    const subscription = await prisma.subscription.update({
      where: { id: current.id },
      data: {
        ...(days ? { endDate, status: 'active' } : {}),
        notes: optionalText(data.notes, 2000) ?? current.notes,
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'subscription.extend',
      entityType: 'Subscription',
      entityId: subscription.id,
      metadata: { days, previousEndDate: current.endDate.toISOString(), endDate: endDate.toISOString() },
    });
    return { success: true, subscription: subscriptionDto(subscription) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
export async function renewSubscription(
  id: string,
  data: {
    startDate: string;
    servicePlanId?: string;
    discountType?: string;
    discountValue?: number;
  },
) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const original = await prisma.subscription.findFirst({
      where: { id, tenantId },
      include: { service: true, servicePlan: true },
    });
    if (!original) throw new Error('الاشتراك غير موجود');

    const plan = data.servicePlanId
      ? await prisma.servicePlan.findFirst({
          where: { id: data.servicePlanId, serviceId: original.serviceId, tenantId, isActive: true },
        })
      : original.servicePlan || await prisma.servicePlan.findFirst({
          where: { serviceId: original.serviceId, tenantId, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
        });
    if (data.servicePlanId && !plan) throw new Error('مدة الاشتراك غير متاحة');

    const startDate = dateValue(data.startDate, 'تاريخ البداية');
    const duration = plan?.durationDays || original.service.defaultDuration;
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
    const pricing = subscriptionPricing(plan?.price || original.service.defaultSellingPrice, data.discountType, data.discountValue);
    const costPrice = Math.max(0, money(plan?.costPrice || original.service.defaultCostPrice));

    const subscription = await prisma.$transaction(async (tx) => {
      if (plan?.trackInventory) {
        const stock = await tx.servicePlan.updateMany({
          where: { id: plan.id, tenantId, stockQuantity: { gt: 0 } },
          data: { stockQuantity: { decrement: 1 } },
        });
        if (stock.count !== 1) throw new Error('لا يوجد مخزون متاح لهذه المدة');
      }
      await tx.subscription.update({
        where: { id: original.id },
        data: { status: 'expired', notes: 'تم التجديد في ' + new Date().toISOString() },
      });
      return tx.subscription.create({
        data: {
          tenantId,
          customerId: original.customerId,
          serviceId: original.serviceId,
          servicePlanId: plan?.id || null,
          renewedFromId: original.id,
          orderNo: 'SUB-' + Date.now().toString(36).toUpperCase(),
          package: plan?.name || original.package,
          startDate,
          endDate,
          sellingPrice: pricing.sellingPrice,
          priceBeforeDiscount: pricing.basePrice,
          discountType: pricing.discountType,
          discountValue: pricing.discountValue,
          discountAmount: pricing.discountAmount,
          costPrice,
          status: 'active',
          notes: 'تجديد اشتراك',
          createdBy: session.userId,
        },
      });
    });

    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'subscription.renew',
      entityType: 'Subscription',
      entityId: subscription.id,
      metadata: {
        renewedFromId: id,
        servicePlanId: plan?.id || null,
        priceBeforeDiscount: pricing.basePrice,
        discountAmount: pricing.discountAmount,
        sellingPrice: pricing.sellingPrice,
      },
    });
    return { success: true, subscription: subscriptionDto(subscription) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteSubscription(id: string) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions.delete');
    await prisma.subscription.update({
      where: { id, tenantId },
      data: { status: 'canceled', notes: 'تم الإلغاء من لوحة التحكم' },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'subscription.cancel',
      entityType: 'Subscription',
      entityId: id,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getExpenses() {
  try {
    const { tenantId } = await getActiveTenant('expenses');
    await syncDueRecurringExpenses(tenantId);
    const items = await prisma.expense.findMany({ where: { tenantId }, orderBy: { date: 'desc' }, take: 500 });
    return { success: true, expenses: items.map((item) => ({ ...item, amount: money(item.amount) })) };
  } catch (error) {
    return { success: false, error: errorMessage(error), expenses: [] };
  }
}

export async function addExpense(data: { category: string; amount: number; date: string; notes?: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('expenses');
    const expense = await prisma.expense.create({
      data: {
        tenantId,
        category: cleanText(data.category, 'التصنيف', 2, 100),
        amount: requirePositiveMoney(data.amount),
        date: dateValue(data.date, 'التاريخ'),
        notes: optionalText(data.notes),
        createdBy: session.userId,
      },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'expense.create', entityType: 'Expense', entityId: expense.id });
    return { success: true, expense: { ...expense, amount: money(expense.amount) } };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteExpense(id: string) {
  try {
    const { tenantId, session } = await getActiveTenant('expenses.delete');
    await prisma.expense.delete({ where: { id, tenantId } });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'expense.delete', entityType: 'Expense', entityId: id });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getAdvertising() {
  try {
    const { tenantId } = await getActiveTenant('advertising');
    const items = await prisma.adCampaign.findMany({ where: { tenantId }, orderBy: { date: 'desc' }, take: 500 });
    return { success: true, campaigns: items.map((item) => ({ ...item, amount: money(item.amount) })) };
  } catch (error) {
    return { success: false, error: errorMessage(error), campaigns: [] };
  }
}

export async function addAdvertising(data: { platform: string; amount: number; date: string; notes?: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('advertising');
    const campaign = await prisma.adCampaign.create({
      data: {
        tenantId,
        platform: cleanText(data.platform, 'المنصة', 2, 100),
        amount: requirePositiveMoney(data.amount),
        date: dateValue(data.date, 'التاريخ'),
        notes: optionalText(data.notes),
      },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'campaign.create', entityType: 'AdCampaign', entityId: campaign.id });
    return { success: true, campaign: { ...campaign, amount: money(campaign.amount) } };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteAdvertising(id: string) {
  try {
    const { tenantId, session } = await getActiveTenant('advertising.delete');
    await prisma.adCampaign.delete({ where: { id, tenantId } });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'campaign.delete', entityType: 'AdCampaign', entityId: id });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getSettings() {
  try {
    const { tenantId } = await getActiveTenant('settings');
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        storeName: true,
        currency: true,
        timezone: true,
        locale: true,
        reminderDays: true,
        notifEmail: true,
        logoUrl: true,
        saasPlan: true,
        saasStatus: true,
        saasExpiry: true,
        saasBalance: true,
        botSettings: {
          select: {
            id: true,
            botUsername: true,
            botName: true,
            tokenLast4: true,
            isActive: true,
            welcomeMsg: true,
            supportMessage: true,
            connectionStatus: true,
            lastWebhookAt: true,
            lastHealthCheckAt: true,
            lastError: true,
          },
        },
      },
    });
    if (!tenant) throw new Error('المتجر غير موجود');
    return { success: true, tenant: { ...tenant, saasBalance: money(tenant.saasBalance) } };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function saveSettings(data: {
  storeName: string;
  currency: string;
  reminderDays: number;
  notifEmail?: string;
  timezone?: string;
  locale?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('settings');
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        storeName: cleanText(data.storeName, 'اسم المتجر', 2, 120),
        currency: oneOf(data.currency, ['EGP', 'SAR', 'AED', 'USD'] as const, 'العملة'),
        reminderDays: Math.min(30, Math.max(1, Number(data.reminderDays))),
        notifEmail: optionalEmail(data.notifEmail),
        timezone: cleanText(data.timezone || 'Africa/Cairo', 'المنطقة الزمنية', 3, 80),
        locale: oneOf(data.locale || 'ar', ['ar', 'en'] as const, 'اللغة'),
      },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'tenant.settings_update', entityType: 'Tenant', entityId: tenantId });
    return { success: true, tenant: { ...tenant, saasBalance: money(tenant.saasBalance) } };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function saveBotSettings(data: {
  botToken?: string;
  isActive: boolean;
  welcomeMsg?: string;
  supportMessage?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('bot.manage');
    const { settings, connection } = await configureTelegramBot(tenantId, data);
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'telegram.configure',
      entityType: 'BotSettings',
      entityId: settings.id,
      metadata: { connectionStatus: settings.connectionStatus, connectionMode: connection.mode },
    });
    const connected = settings.connectionStatus === 'connected';
    return {
      success: true,
      connected,
      message: connected ? connection.message : null,
      warning: connected ? null : settings.lastError || connection.message,
      connectionMode: connection.mode,
      bot: {
        id: settings.id,
        botUsername: settings.botUsername,
        botName: settings.botName,
        tokenLast4: settings.tokenLast4,
        isActive: settings.isActive,
        welcomeMsg: settings.welcomeMsg,
        supportMessage: settings.supportMessage,
        connectionStatus: settings.connectionStatus,
        lastError: settings.lastError,
      },
    };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function checkBotHealth() {
  try {
    const { tenantId } = await getActiveTenant('bot.manage');
    return { success: true, health: await getTelegramHealth(tenantId) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getAccountPool(serviceId?: string) {
  try {
    const { tenantId } = await getActiveTenant('services');
    const items = await prisma.accountPool.findMany({
      where: { tenantId, ...(serviceId ? { serviceId } : {}) },
      select: {
        id: true,
        serviceId: true,
        credentialHint: true,
        isUsed: true,
        usedAt: true,
        subscriptionId: true,
        createdAt: true,
        service: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return { success: true, accounts: items };
  } catch (error) {
    return { success: false, error: errorMessage(error), accounts: [] };
  }
}

export async function addAccountToPool(data: { serviceId: string; credentials: string; hint?: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    const service = await prisma.service.findFirst({ where: { id: data.serviceId, tenantId, isActive: true }, select: { id: true } });
    if (!service) throw new Error('الخدمة غير موجودة');
    const credentials = cleanText(data.credentials, 'بيانات التسليم', 3, 4000);
    const item = await prisma.accountPool.create({
      data: {
        tenantId,
        serviceId: service.id,
        credentialsEncrypted: encryptSecret(credentials),
        credentialHint: optionalText(data.hint, 120) || credentials.slice(0, 3) + '••••',
      },
      select: { id: true, serviceId: true, credentialHint: true, isUsed: true, createdAt: true },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'inventory.create', entityType: 'AccountPool', entityId: item.id });
    return { success: true, account: item };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
