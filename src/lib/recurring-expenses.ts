import 'server-only';

import { prisma } from './prisma';

export const recurringFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringFrequency = (typeof recurringFrequencies)[number];

function monthAdvance(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function advanceRecurringDate(date: Date, frequency: RecurringFrequency, interval: number) {
  const step = Math.max(1, Math.trunc(interval));
  const next = new Date(date);
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + step);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + step * 7);
  else if (frequency === 'monthly') return monthAdvance(next, step);
  else if (frequency === 'quarterly') return monthAdvance(next, step * 3);
  else return monthAdvance(next, step * 12);
  return next;
}

export function monthlyRecurringEstimate(amount: number, frequency: RecurringFrequency, interval: number) {
  const step = Math.max(1, interval);
  if (frequency === 'daily') return (amount * 30.4375) / step;
  if (frequency === 'weekly') return (amount * 4.345) / step;
  if (frequency === 'monthly') return amount / step;
  if (frequency === 'quarterly') return amount / (step * 3);
  return amount / (step * 12);
}

export async function syncDueRecurringExpenses(tenantId: string, through = new Date()) {
  const boundary = new Date(Date.UTC(through.getUTCFullYear(), through.getUTCMonth(), through.getUTCDate(), 23, 59, 59, 999));
  const schedules = await prisma.recurringExpense.findMany({
    where: {
      tenantId,
      isActive: true,
      nextRunAt: { lte: boundary },
      OR: [{ endDate: null }, { endDate: { gte: new Date(0) } }],
    },
    orderBy: { nextRunAt: 'asc' },
    take: 500,
  });

  let generated = 0;
  for (const schedule of schedules) {
    const frequency = recurringFrequencies.includes(schedule.frequency as RecurringFrequency)
      ? (schedule.frequency as RecurringFrequency)
      : 'monthly';
    const dueDates: Date[] = [];
    let cursor = new Date(schedule.nextRunAt);
    let loops = 0;
    while (cursor <= boundary && (!schedule.endDate || cursor <= schedule.endDate) && loops < 240) {
      dueDates.push(new Date(cursor));
      cursor = advanceRecurringDate(cursor, frequency, schedule.interval);
      loops += 1;
    }
    if (!dueDates.length) {
      if (schedule.endDate && cursor > schedule.endDate) {
        await prisma.recurringExpense.updateMany({
          where: { id: schedule.id, tenantId, nextRunAt: schedule.nextRunAt },
          data: { isActive: false },
        });
      }
      continue;
    }

    const noMoreRuns = Boolean(schedule.endDate && cursor > schedule.endDate);
    const result = await prisma.$transaction(async (tx) => {
      const inserted = await tx.expense.createMany({
        data: dueDates.map((date) => ({
          tenantId,
          recurringExpenseId: schedule.id,
          category: schedule.category,
          amount: schedule.amount,
          date,
          notes: schedule.notes,
          createdBy: schedule.createdBy,
        })),
        skipDuplicates: true,
      });
      await tx.recurringExpense.updateMany({
        where: { id: schedule.id, tenantId, nextRunAt: schedule.nextRunAt },
        data: {
          nextRunAt: cursor,
          lastGeneratedAt: dueDates.at(-1),
          ...(noMoreRuns ? { isActive: false } : {}),
        },
      });
      return inserted.count;
    });
    generated += result;
  }
  return generated;
}
