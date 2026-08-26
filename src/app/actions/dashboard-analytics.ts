'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { oneOf } from '@/lib/validation';

const periods = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear'] as const;
type Period = typeof periods[number];

function rangeFor(rawPeriod: string) {
  const period = oneOf(rawPeriod, periods, 'مدة التقرير') as Period;
  const now = new Date(); const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (period === 'yesterday') { start.setDate(start.getDate() - 1); end.setTime(start.getTime()); end.setHours(23, 59, 59, 999); }
  if (period === 'last7') start.setDate(start.getDate() - 6);
  if (period === 'last30') start.setDate(start.getDate() - 29);
  if (period === 'thisMonth') start.setDate(1);
  if (period === 'lastMonth') { start.setMonth(start.getMonth() - 1, 1); end.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime()); }
  if (period === 'thisYear') start.setMonth(0, 1);
  return { period, start, end };
}

export async function getDashboardAnalytics(rawPeriod = 'thisMonth') {
  const { tenantId, currency } = await getActiveTenant('dashboard');
  const { period, start, end } = rangeFor(rawPeriod);
  const [orders, subscriptions, expenses, customersCreated, subscriptionsCreated, payments, totalCustomers, activeSubscriptions, openOrders, pendingPayments, lowStock, expiring] = await Promise.all([
    prisma.order.findMany({ where: { tenantId, createdAt: { gte: start, lte: end }, fulfillmentStatus: { not: 'cancelled' } }, select: { createdAt: true, subscriptionId: true, amount: true, costPrice: true, paymentFee: true, discountAmount: true, fulfillmentStatus: true, service: { select: { name: true } } } }),
    prisma.subscription.findMany({ where: { tenantId, createdAt: { gte: start, lte: end }, status: { not: 'canceled' } }, select: { createdAt: true, sellingPrice: true, costPrice: true, service: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { tenantId, date: { gte: start, lte: end } }, select: { amount: true, date: true, category: true } }),
    prisma.customer.count({ where: { tenantId, deletedAt: null, createdAt: { gte: start, lte: end } } }),
    prisma.subscription.count({ where: { tenantId, createdAt: { gte: start, lte: end } } }),
    prisma.paymentRequest.count({ where: { tenantId, createdAt: { gte: start, lte: end }, status: 'approved' } }),
    prisma.customer.count({ where: { tenantId, deletedAt: null } }),
    prisma.subscription.count({ where: { tenantId, status: 'active' } }),
    prisma.order.count({ where: { tenantId, fulfillmentStatus: { in: ['pending', 'processing', 'waiting_customer_data'] } } }),
    prisma.paymentRequest.count({ where: { tenantId, status: 'pending' } }),
    prisma.servicePlan.count({ where: { tenantId, isActive: true, trackInventory: true, stockQuantity: { lte: 0 } } }),
    prisma.subscription.count({ where: { tenantId, status: 'active', endDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) } } }),
  ]);
  const standaloneOrders = orders.filter((item) => !item.subscriptionId);
  const revenue = subscriptions.reduce((sum, item) => sum + Number(item.sellingPrice), 0) + standaloneOrders.reduce((sum, item) => sum + Number(item.amount), 0);
  const directCosts = subscriptions.reduce((sum, item) => sum + Number(item.costPrice), 0) + standaloneOrders.reduce((sum, item) => sum + Number(item.costPrice) + Number(item.paymentFee), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const serviceMap = new Map<string, { amount: number; sales: number }>();
  const addServiceSale = (name: string, amount: number) => {
    const current = serviceMap.get(name) ?? { amount: 0, sales: 0 };
    serviceMap.set(name, { amount: current.amount + amount, sales: current.sales + 1 });
  };
  for (const subscription of subscriptions) addServiceSale(subscription.service.name, Number(subscription.sellingPrice));
  for (const order of standaloneOrders) addServiceSale(order.service.name, Number(order.amount));
  const expenseMap = new Map<string, number>(); for (const expense of expenses) expenseMap.set(expense.category, (expenseMap.get(expense.category) ?? 0) + Number(expense.amount));
  const days = Math.max(1, Math.min(31, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1));
  const chart = Array.from({ length: days }, (_, index) => { const day = new Date(start); day.setDate(day.getDate() + index); return { key: day.toISOString().slice(0, 10), label: new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: days > 14 ? 'short' : undefined }).format(day), revenue: 0, expenses: 0 }; });
  const index = new Map(chart.map((item, i) => [item.key, i]));
  for (const subscription of subscriptions) { const bucket = chart[index.get(subscription.createdAt.toISOString().slice(0, 10)) ?? -1]; if (bucket) bucket.revenue += Number(subscription.sellingPrice); } for (const order of standaloneOrders) { const bucket = chart[index.get(order.createdAt.toISOString().slice(0, 10)) ?? -1]; if (bucket) bucket.revenue += Number(order.amount); }
  for (const expense of expenses) { const bucket = chart[index.get(expense.date.toISOString().slice(0, 10)) ?? -1]; if (bucket) bucket.expenses += Number(expense.amount); }
  return { success: true, period, currency, range: { start: start.toISOString(), end: end.toISOString() }, metrics: { revenue, directCosts, expenses: expenseTotal, profit: revenue - directCosts - expenseTotal, orders: subscriptions.length + standaloneOrders.length, customersCreated, subscriptionsCreated, approvedTopups: payments, totalCustomers, activeSubscriptions, openOrders, pendingPayments, lowStock, expiring }, chart, topServices: [...serviceMap.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(([name, values]) => ({ name, ...values })), expenseCategories: [...expenseMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount })) };
}
