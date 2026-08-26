'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { cleanText, oneOf, optionalText } from '@/lib/validation';
import { expireDueSubscriptions } from '@/lib/subscription-lifecycle';

const renewalStates = ['not_due', 'ready', 'contacted', 'renewed', 'not_renewing'] as const;

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(days = 0) {
  const value = startOfToday();
  value.setDate(value.getDate() + days + 1);
  return value;
}

export async function getOperationsCenter() {
  const { tenantId, currency } = await getActiveTenant('dashboard');
  await expireDueSubscriptions(tenantId);
  const today = startOfToday();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const renewalLimit = endOfDay(7);

  const [
    pendingPayments,
    openOrders,
    dueRenewals,
    overdueTasks,
    openTickets,
    lowStockPlans,
    orderTotals,
    expenseTotals,
    unreadNotifications,
  ] = await Promise.all([
    prisma.paymentRequest.count({ where: { tenantId, status: 'pending' } }),
    prisma.order.count({
      where: { tenantId, fulfillmentStatus: { in: ['pending', 'processing', 'waiting_customer_data'] } },
    }),
    prisma.subscription.count({
      where: { tenantId, status: 'active', endDate: { gte: today, lt: renewalLimit } },
    }),
    prisma.task.count({ where: { tenantId, status: { not: 'done' }, dueAt: { lt: today } } }),
    prisma.supportTicket.count({ where: { tenantId, status: { in: ['open', 'in_progress'] } } }),
    prisma.servicePlan.count({
      where: { tenantId, isActive: true, trackInventory: true, stockQuantity: { lte: 0 } },
    }),
    prisma.order.aggregate({
      where: { tenantId, paymentStatus: 'paid', fulfillmentStatus: { not: 'cancelled' }, createdAt: { gte: monthStart } },
      _sum: { amount: true, costPrice: true, discountAmount: true, paymentFee: true },
    }),
    prisma.expense.aggregate({ where: { tenantId, date: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.notification.count({ where: { tenantId, readAt: null } }),
  ]);

  const revenue = Number(orderTotals._sum?.amount ?? 0);
  const directCosts = Number(orderTotals._sum?.costPrice ?? 0) + Number(orderTotals._sum?.paymentFee ?? 0);
  const expenses = Number(expenseTotals._sum?.amount ?? 0);

  return {
    success: true,
    currency,
    metrics: {
      revenue,
      profit: revenue - directCosts - expenses,
      expenses,
      pendingPayments,
      openOrders,
      dueRenewals,
      overdueTasks,
      openTickets,
      lowStockPlans,
      unreadNotifications,
    },
    attention: [
      { key: 'payments', count: pendingPayments, label: 'طلبات شحن بانتظار الاعتماد', href: '/dashboard?screen=requests', tone: 'emerald' },
      { key: 'orders', count: openOrders, label: 'طلبات تحتاج تنفيذًا', href: '/dashboard/orders', tone: 'violet' },
      { key: 'renewals', count: dueRenewals, label: 'تجديدات خلال 7 أيام', href: '/dashboard/renewals', tone: 'amber' },
      { key: 'tasks', count: overdueTasks, label: 'مهام متأخرة', href: '/dashboard/operations?tab=crm', tone: 'rose' },
      { key: 'stock', count: lowStockPlans, label: 'خطط نفد مخزونها', href: '/dashboard/services', tone: 'orange' },
    ].filter((item) => item.count > 0),
  };
}

export async function getGlobalSearchResults(rawQuery: string) {
  const { tenantId } = await getActiveTenant('dashboard');
  const query = cleanText(rawQuery, 'البحث', 2, 80);
  const contains = { contains: query, mode: 'insensitive' as const };
  const [customers, orders, subscriptions, services] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId, deletedAt: null, OR: [{ name: contains }, { phone: contains }, { email: contains }, { tgUsername: contains }] },
      take: 6,
      select: { id: true, name: true, phone: true, email: true },
    }),
    prisma.order.findMany({
      where: { tenantId, OR: [{ orderNo: contains }, { customer: { name: contains } }, { customer: { phone: contains } }] },
      take: 6,
      select: { id: true, orderNo: true, amount: true, fulfillmentStatus: true, customer: { select: { name: true } } },
    }),
    prisma.subscription.findMany({
      where: { tenantId, OR: [{ orderNo: contains }, { customer: { name: contains } }, { service: { name: contains } }] },
      take: 6,
      select: { id: true, orderNo: true, endDate: true, status: true, customer: { select: { name: true } }, service: { select: { name: true } } },
    }),
    prisma.service.findMany({ where: { tenantId, isActive: true, name: contains }, take: 6, select: { id: true, name: true } }),
  ]);

  return { success: true, customers, orders, subscriptions, services };
}

export async function getRenewalWorkspace() {
  // Keep the renewal workspace available when a merchant subscription is expired,
  // so the merchant can still review customer renewals and recover the account.
  const { tenantId, currency } = await getActiveTenant('subscriptions', { allowInactiveTenant: true });
  await expireDueSubscriptions(tenantId);
  const today = startOfToday();
  const limit = endOfDay(30);
  const subscriptions = await prisma.subscription.findMany({
    where: { tenantId, status: { in: ['active', 'expired'] }, endDate: { lt: limit } },
    orderBy: { endDate: 'asc' },
    take: 250,
    select: {
      id: true, orderNo: true, endDate: true, sellingPrice: true, renewalStatus: true, renewalContactedAt: true,
      customer: { select: { id: true, name: true, phone: true, tgUsername: true, lastContactAt: true } },
      service: { select: { name: true } }, servicePlan: { select: { name: true, graceDays: true } },
    },
  });
  const counts = { overdue: 0, today: 0, week: 0, month: 0, contacted: 0 };
  for (const subscription of subscriptions) {
    if (subscription.renewalStatus === 'contacted') counts.contacted += 1;
    const end = new Date(subscription.endDate);
    if (end < today) counts.overdue += 1;
    else if (end < endOfDay(1)) counts.today += 1;
    else if (end < endOfDay(7)) counts.week += 1;
    else counts.month += 1;
  }
  return { success: true, currency, today: today.toISOString(), counts, subscriptions };
}

export async function updateRenewalStatus(input: { subscriptionId: string; status: string; note?: string }) {
  const { tenantId, session } = await getActiveTenant('subscriptions');
  const userId = session.userId;
  const status = oneOf(input.status, renewalStates, 'حالة التجديد غير صحيحة');
  const subscription = await prisma.subscription.findFirst({
    where: { id: cleanText(input.subscriptionId, 'الاشتراك', 1, 80), tenantId },
    select: { id: true, customerId: true, orderNo: true },
  });
  if (!subscription) throw new Error('الاشتراك غير موجود.');
  const contacted = status === 'contacted' ? new Date() : undefined;
  await prisma.$transaction([
    prisma.subscription.update({ where: { id: subscription.id }, data: { renewalStatus: status, renewalContactedAt: contacted } }),
    prisma.customerActivity.create({
      data: { tenantId, customerId: subscription.customerId, type: 'renewal', title: `حالة التجديد: ${status}`, details: optionalText(input.note, 500), userId },
    }),
  ]);
  await writeAuditLog({ tenantId, userId, action: 'subscription.renewal_status_updated', entityType: 'Subscription', entityId: subscription.id, metadata: { status } });
  return { success: true };
}

export async function getNotifications() {
  const { tenantId, session } = await getActiveTenant('dashboard');
  const userId = session.userId;
  const notifications = await prisma.notification.findMany({
    where: { tenantId, OR: [{ userId: null }, { userId }] }, orderBy: { createdAt: 'desc' }, take: 60,
    select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  });
  return { success: true, notifications };
}

export async function markNotificationsRead(ids?: string[]) {
  const { tenantId, session } = await getActiveTenant('dashboard');
  const userId = session.userId;
  const validIds = ids?.map((id) => cleanText(id, 'التنبيه', 1, 80)) ?? [];
  await prisma.notification.updateMany({
    where: { tenantId, OR: [{ userId: null }, { userId }], ...(validIds.length ? { id: { in: validIds } } : {}) },
    data: { readAt: new Date() },
  });
  return { success: true };
}
