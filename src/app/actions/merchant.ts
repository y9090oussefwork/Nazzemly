'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { hashPassword } from '@/lib/session';

// ----------------------------------------------------
// 1. DASHBOARD & STATS ACTIONS
// ----------------------------------------------------

export async function getDashboardStats() {
  try {
    const { tenantId } = await getActiveTenant();

    // Fetch essential models
    const totalCustomers = await prisma.customer.count({ where: { tenantId } });
    
    const activeSubs = await prisma.subscription.count({
      where: { tenantId, status: 'active' },
    });
    const expiringSoon = await prisma.subscription.count({
      where: { tenantId, status: 'expiring_soon' },
    });
    const expiredSubs = await prisma.subscription.count({
      where: { tenantId, status: 'expired' },
    });

    // Financial sums (this month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Monthly Revenue
    const monthlyRevenueRaw = await prisma.subscription.aggregate({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
      },
      _sum: { sellingPrice: true },
    });
    const monthlyRevenue = monthlyRevenueRaw._sum.sellingPrice || 0;

    // Monthly Cost
    const monthlyCostRaw = await prisma.subscription.aggregate({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
      },
      _sum: { costPrice: true },
    });
    const monthlyCost = monthlyCostRaw._sum.costPrice || 0;

    // Monthly Expenses
    const monthlyExpensesRaw = await prisma.expense.aggregate({
      where: {
        tenantId,
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    const monthlyExpenses = monthlyExpensesRaw._sum.amount || 0;

    // Monthly Ads Spend
    const monthlyAdsRaw = await prisma.adCampaign.aggregate({
      where: {
        tenantId,
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    const monthlyAds = monthlyAdsRaw._sum.amount || 0;

    // Net Profit calculation
    const netProfit = monthlyRevenue - monthlyCost - monthlyExpenses - monthlyAds;

    // Top selling service
    const serviceSales = await prisma.subscription.groupBy({
      by: ['serviceId'],
      where: { tenantId, createdAt: { gte: startOfMonth } },
      _count: true,
      orderBy: { _count: { serviceId: 'desc' } },
      take: 1,
    });

    let bestService = 'لا توجد مبيعات';
    if (serviceSales.length > 0) {
      const srv = await prisma.service.findUnique({
        where: { id: serviceSales[0].serviceId },
        select: { name: true },
      });
      if (srv) bestService = srv.name;
    }

    // New customers this month
    const newCustomers = await prisma.customer.count({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
      },
    });

    // Recent activity list
    const recentSubs = await prisma.subscription.findMany({
      where: { tenantId },
      include: { customer: true, service: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const recentActivity = recentSubs.map((s) => ({
      id: s.id,
      text: `تم بيع اشتراك "${s.service.name}" للعميل "${s.customer.name}" بقيمة ${s.sellingPrice} EGP`,
      date: s.createdAt,
    }));

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
        netProfit,
        bestService,
        newCustomers,
        recentActivity,
      },
    };
  } catch (e: any) {
    console.error('Failed to get dashboard stats:', e);
    return { success: false, error: e.message };
  }
}

// ----------------------------------------------------
// 2. CUSTOMER ACTIONS
// ----------------------------------------------------

export async function getCustomers() {
  try {
    const { tenantId } = await getActiveTenant();
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      include: {
        subscriptions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, customers };
  } catch (e: any) {
    return { success: false, error: e.message, customers: [] };
  }
}

export async function addCustomer(data: { name: string; phone: string; email?: string; notes?: string }) {
  try {
    const { tenantId } = await getActiveTenant();
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        notes: data.notes || '',
        createdBy: 'merchant_panel',
      },
    });
    return { success: true, customer };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateCustomer(id: string, data: { name: string; phone: string; email?: string; notes?: string }) {
  try {
    const { tenantId } = await getActiveTenant();
    const customer = await prisma.customer.update({
      where: { id, tenantId },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        notes: data.notes || '',
      },
    });
    return { success: true, customer };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteCustomer(id: string) {
  try {
    const { tenantId } = await getActiveTenant();
    await prisma.customer.delete({
      where: { id, tenantId },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ----------------------------------------------------
// 3. SERVICE ACTIONS
// ----------------------------------------------------

export async function getServices() {
  try {
    const { tenantId } = await getActiveTenant();
    const services = await prisma.service.findMany({
      where: { tenantId },
      include: {
        _count: { select: { subscriptions: true } },
      },
      orderBy: { name: 'asc' },
    });
    return { success: true, services };
  } catch (e: any) {
    return { success: false, error: e.message, services: [] };
  }
}

export async function addService(data: { name: string; defaultDuration: number; defaultSellingPrice: number; defaultCostPrice?: number }) {
  try {
    const { tenantId } = await getActiveTenant();
    const service = await prisma.service.create({
      data: {
        tenantId,
        name: data.name,
        defaultDuration: data.defaultDuration,
        defaultSellingPrice: data.defaultSellingPrice,
        defaultCostPrice: data.defaultCostPrice || 0.0,
      },
    });
    return { success: true, service };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateService(id: string, data: { name: string; defaultDuration: number; defaultSellingPrice: number; defaultCostPrice?: number }) {
  try {
    const { tenantId } = await getActiveTenant();
    const service = await prisma.service.update({
      where: { id, tenantId },
      data: {
        name: data.name,
        defaultDuration: data.defaultDuration,
        defaultSellingPrice: data.defaultSellingPrice,
        defaultCostPrice: data.defaultCostPrice || 0.0,
      },
    });
    return { success: true, service };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteService(id: string) {
  try {
    const { tenantId } = await getActiveTenant();
    await prisma.service.delete({
      where: { id, tenantId },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ----------------------------------------------------
// 4. SUBSCRIPTION ACTIONS
// ----------------------------------------------------

export async function getSubscriptions() {
  try {
    const { tenantId } = await getActiveTenant();
    const subscriptions = await prisma.subscription.findMany({
      where: { tenantId },
      include: {
        customer: true,
        service: true,
      },
      orderBy: { endDate: 'asc' },
    });
    return { success: true, subscriptions };
  } catch (e: any) {
    return { success: false, error: e.message, subscriptions: [] };
  }
}

export async function addSubscription(data: {
  customerId: string;
  serviceId: string;
  package?: string;
  startDate: string;
  endDate?: string;
  sellingPrice: number;
  costPrice?: number;
  notes?: string;
}) {
  try {
    const { tenantId } = await getActiveTenant();
    
    const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
    if (!service) throw new Error('Service not found');

    const start = new Date(data.startDate);
    const end = data.endDate ? new Date(data.endDate) : new Date(start.getTime() + service.defaultDuration * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.create({
      data: {
        tenantId,
        customerId: data.customerId,
        serviceId: data.serviceId,
        package: data.package || 'افتراضية',
        startDate: start,
        endDate: end,
        sellingPrice: data.sellingPrice,
        costPrice: data.costPrice || 0.0,
        status: 'active',
        notes: data.notes || '',
        createdBy: 'merchant_panel',
      },
    });

    return { success: true, subscription };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function renewSubscription(id: string, data: { startDate: string; endDate?: string; sellingPrice: number; costPrice?: number }) {
  try {
    const { tenantId } = await getActiveTenant();

    const originalSub = await prisma.subscription.findUnique({
      where: { id, tenantId },
      include: { service: true },
    });

    if (!originalSub) throw new Error('Subscription not found');

    // 1. Archive the old subscription (change status to expired/archived)
    await prisma.subscription.update({
      where: { id },
      data: { status: 'expired', notes: `تجديد مسبق في ${new Date().toLocaleDateString('en-GB')}` },
    });

    // 2. Create the renewed active subscription
    const start = new Date(data.startDate);
    const end = data.endDate ? new Date(data.endDate) : new Date(start.getTime() + originalSub.service.defaultDuration * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.create({
      data: {
        tenantId,
        customerId: originalSub.customerId,
        serviceId: originalSub.serviceId,
        package: originalSub.package,
        startDate: start,
        endDate: end,
        sellingPrice: data.sellingPrice,
        costPrice: data.costPrice || 0.0,
        status: 'active',
        notes: 'تجديد الاشتراك المسبق يدوياً',
        createdBy: 'merchant_panel',
      },
    });

    return { success: true, subscription };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteSubscription(id: string) {
  try {
    const { tenantId } = await getActiveTenant();
    await prisma.subscription.delete({
      where: { id, tenantId },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ----------------------------------------------------
// 5. EXPENSE ACTIONS
// ----------------------------------------------------

export async function getExpenses() {
  try {
    const { tenantId } = await getActiveTenant();
    const expenses = await prisma.expense.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
    });
    return { success: true, expenses };
  } catch (e: any) {
    return { success: false, error: e.message, expenses: [] };
  }
}

export async function addExpense(data: { category: string; amount: number; date: string; notes?: string }) {
  try {
    const { tenantId } = await getActiveTenant();
    const expense = await prisma.expense.create({
      data: {
        tenantId,
        category: data.category,
        amount: data.amount,
        date: new Date(data.date),
        notes: data.notes || '',
        createdBy: 'merchant_panel',
      },
    });
    return { success: true, expense };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteExpense(id: string) {
  try {
    const { tenantId } = await getActiveTenant();
    await prisma.expense.delete({
      where: { id, tenantId },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ----------------------------------------------------
// 6. ADVERTISING ACTIONS
// ----------------------------------------------------

export async function getAdvertising() {
  try {
    const { tenantId } = await getActiveTenant();
    const campaigns = await prisma.adCampaign.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
    });
    return { success: true, campaigns };
  } catch (e: any) {
    return { success: false, error: e.message, campaigns: [] };
  }
}

export async function addAdvertising(data: { platform: string; amount: number; date: string; notes?: string }) {
  try {
    const { tenantId } = await getActiveTenant();
    const campaign = await prisma.adCampaign.create({
      data: {
        tenantId,
        platform: data.platform,
        amount: data.amount,
        date: new Date(data.date),
        notes: data.notes || '',
      },
    });
    return { success: true, campaign };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteAdvertising(id: string) {
  try {
    const { tenantId } = await getActiveTenant();
    await prisma.adCampaign.delete({
      where: { id, tenantId },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ----------------------------------------------------
// 7. CONFIG & SETTINGS ACTIONS
// ----------------------------------------------------

export async function getSettings() {
  try {
    const { tenantId } = await getActiveTenant();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { botSettings: true },
    });
    return { success: true, tenant };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveSettings(data: { storeName: string; currency: string; reminderDays: number; notifEmail?: string }) {
  try {
    const { tenantId } = await getActiveTenant();
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        storeName: data.storeName,
        currency: data.currency,
        reminderDays: Number(data.reminderDays),
        notifEmail: data.notifEmail || null,
      },
    });
    return { success: true, tenant };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveBotSettings(data: { botToken: string; botUsername?: string; isActive: boolean; welcomeMsg?: string }) {
  try {
    const { tenantId } = await getActiveTenant();
    
    const bot = await prisma.botSettings.upsert({
      where: { tenantId },
      update: {
        botToken: data.botToken,
        botUsername: data.botUsername || '',
        isActive: data.isActive,
        welcomeMsg: data.welcomeMsg || 'أهلاً بك في المتجر الإلكتروني الخاص بنا!',
      },
      create: {
        tenantId,
        botToken: data.botToken,
        botUsername: data.botUsername || '',
        isActive: data.isActive,
        welcomeMsg: data.welcomeMsg || 'أهلاً بك في المتجر الإلكتروني الخاص بنا!',
      },
    });

    return { success: true, bot };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
