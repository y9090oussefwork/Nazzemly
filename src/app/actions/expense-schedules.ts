'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { cleanText, dateValue, optionalText, oneOf } from '@/lib/validation';
import { money, requirePositiveMoney } from '@/lib/money';
import {
  monthlyRecurringEstimate,
  recurringFrequencies,
  syncDueRecurringExpenses,
  type RecurringFrequency,
} from '@/lib/recurring-expenses';

type RecurringExpenseInput = {
  id?: string;
  category: string;
  amount: number;
  frequency: string;
  interval?: number;
  startDate: string;
  nextRunAt?: string;
  endDate?: string;
  notes?: string;
  isActive?: boolean;
};

function revalidateExpensePages() {
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/expenses');
  revalidatePath('/dashboard/manage');
}

export async function getExpenseWorkspace() {
  try {
    const { tenantId, currency } = await getActiveTenant('expenses');
    const generated = await syncDueRecurringExpenses(tenantId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [expenses, schedules, currentMonth] = await Promise.all([
      prisma.expense.findMany({
        where: { tenantId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: { recurringExpense: { select: { id: true, frequency: true } } },
        take: 800,
      }),
      prisma.recurringExpense.findMany({
        where: { tenantId },
        orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
        include: { _count: { select: { expenses: true } } },
        take: 300,
      }),
      prisma.expense.aggregate({
        where: { tenantId, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    const scheduleRows = schedules.map((schedule) => ({
      ...schedule,
      amount: money(schedule.amount),
      monthlyEstimate: monthlyRecurringEstimate(
        money(schedule.amount),
        recurringFrequencies.includes(schedule.frequency as RecurringFrequency)
          ? (schedule.frequency as RecurringFrequency)
          : 'monthly',
        schedule.interval,
      ),
      startDate: schedule.startDate.toISOString(),
      nextRunAt: schedule.nextRunAt.toISOString(),
      endDate: schedule.endDate?.toISOString() ?? null,
      lastGeneratedAt: schedule.lastGeneratedAt?.toISOString() ?? null,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }));

    return {
      success: true,
      currency,
      generated,
      currentMonthTotal: money(currentMonth._sum.amount),
      activeMonthlyCommitment: scheduleRows
        .filter((schedule) => schedule.isActive)
        .reduce((total, schedule) => total + schedule.monthlyEstimate, 0),
      expenses: expenses.map((expense) => ({
        ...expense,
        amount: money(expense.amount),
        date: expense.date.toISOString(),
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.updatedAt.toISOString(),
      })),
      schedules: scheduleRows,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تحميل المصروفات',
      currency: 'EGP',
      generated: 0,
      currentMonthTotal: 0,
      activeMonthlyCommitment: 0,
      expenses: [],
      schedules: [],
    };
  }
}

export async function saveRecurringExpense(input: RecurringExpenseInput) {
  try {
    const { tenantId, session } = await getActiveTenant('expenses');
    const frequency = oneOf(input.frequency, recurringFrequencies, 'التكرار');
    const interval = Math.max(1, Math.min(365, Math.trunc(Number(input.interval || 1))));
    const startDate = dateValue(input.startDate, 'تاريخ البداية');
    const endDate = input.endDate ? dateValue(input.endDate, 'تاريخ النهاية') : null;
    if (endDate && endDate < startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');

    const existing = input.id
      ? await prisma.recurringExpense.findFirst({ where: { id: input.id, tenantId } })
      : null;
    if (input.id && !existing) throw new Error('المصروف المتكرر غير موجود');
    const requestedNextRun = input.nextRunAt ? dateValue(input.nextRunAt, 'موعد الاستحقاق القادم') : null;
    const nextRunAt = requestedNextRun || existing?.nextRunAt || startDate;
    if (endDate && nextRunAt > endDate) throw new Error('موعد الاستحقاق القادم بعد تاريخ نهاية التكرار');

    const data = {
      category: cleanText(input.category, 'اسم المصروف', 2, 100),
      amount: requirePositiveMoney(input.amount, 'قيمة المصروف'),
      frequency,
      interval,
      startDate,
      nextRunAt,
      endDate,
      notes: optionalText(input.notes, 1000),
      isActive: input.isActive !== false,
    };
    const schedule = existing
      ? await prisma.recurringExpense.update({ where: { id: existing.id }, data })
      : await prisma.recurringExpense.create({ data: { tenantId, createdBy: session.userId, ...data } });
    const generated = await syncDueRecurringExpenses(tenantId);
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: existing ? 'recurring_expense.update' : 'recurring_expense.create',
      entityType: 'RecurringExpense',
      entityId: schedule.id,
      metadata: { frequency, interval, generated },
    });
    revalidateExpensePages();
    return { success: true, scheduleId: schedule.id, generated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ المصروف المتكرر' };
  }
}

export async function setRecurringExpenseActive(input: { id: string; isActive: boolean }) {
  try {
    const { tenantId, session } = await getActiveTenant('expenses');
    const changed = await prisma.recurringExpense.updateMany({
      where: { id: input.id, tenantId },
      data: { isActive: input.isActive },
    });
    if (changed.count !== 1) throw new Error('المصروف المتكرر غير موجود');
    const generated = input.isActive ? await syncDueRecurringExpenses(tenantId) : 0;
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: input.isActive ? 'recurring_expense.resume' : 'recurring_expense.pause',
      entityType: 'RecurringExpense',
      entityId: input.id,
      metadata: { generated },
    });
    revalidateExpensePages();
    return { success: true, generated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث حالة المصروف' };
  }
}

export async function updateExpense(input: { id: string; category: string; amount: number; date: string; notes?: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('expenses');
    const expense = await prisma.expense.update({
      where: { id: input.id, tenantId },
      data: {
        category: cleanText(input.category, 'التصنيف', 2, 100),
        amount: requirePositiveMoney(input.amount, 'قيمة المصروف'),
        date: dateValue(input.date, 'التاريخ'),
        notes: optionalText(input.notes, 1000),
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'expense.update',
      entityType: 'Expense',
      entityId: expense.id,
    });
    revalidateExpensePages();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تعديل المصروف' };
  }
}
