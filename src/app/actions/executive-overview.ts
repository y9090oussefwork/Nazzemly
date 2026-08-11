'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';

export async function getExecutiveOverview() {
  const { tenantId, currency } = await getActiveTenant('dashboard');
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [subscriptions, expenses, customers, activeSubscriptions, pendingPayments] = await Promise.all([
    prisma.subscription.findMany({ where: { tenantId, createdAt: { gte: start }, status: { not: 'canceled' } }, select: { createdAt: true, sellingPrice: true, costPrice: true, service: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { tenantId, date: { gte: start } }, select: { date: true, amount: true } }),
    prisma.customer.count({ where: { tenantId, deletedAt: null } }),
    prisma.subscription.count({ where: { tenantId, status: 'active' } }),
    prisma.paymentRequest.count({ where: { tenantId, status: 'pending' } }),
  ]);
  const formatter = new Intl.DateTimeFormat('ar-EG', { month: 'short' });
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1); return { key: `${date.getFullYear()}-${date.getMonth()}`, label: formatter.format(date), revenue: 0, costs: 0, expenses: 0 }; });
  const lookup = new Map(months.map((item, index) => [item.key, index]));
  for (const item of subscriptions) { const bucket = months[lookup.get(`${item.createdAt.getFullYear()}-${item.createdAt.getMonth()}`) ?? -1]; if (bucket) { bucket.revenue += Number(item.sellingPrice); bucket.costs += Number(item.costPrice); } }
  for (const item of expenses) { const bucket = months[lookup.get(`${item.date.getFullYear()}-${item.date.getMonth()}`) ?? -1]; if (bucket) bucket.expenses += Number(item.amount); }
  const totals = new Map<string, number>(); for (const item of subscriptions) totals.set(item.service.name, (totals.get(item.service.name) ?? 0) + Number(item.sellingPrice));
  return { success: true, currency, customers, activeSubscriptions, pendingPayments, months: months.map((item) => ({ ...item, profit: item.revenue - item.costs - item.expenses })), topServices: [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, revenue]) => ({ name, revenue })) };
}
