'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { cleanText, dateValue, oneOf, optionalText } from '@/lib/validation';
import { money } from '@/lib/money';
import { writeAuditLog } from '@/lib/audit';

const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const DEAL_STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;

async function validateRelations(tenantId: string, customerId?: string | null, userId?: string | null) {
  const [customer, user] = await Promise.all([
    customerId
      ? prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null }, select: { id: true } })
      : null,
    userId
      ? prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true }, select: { id: true } })
      : null,
  ]);
  if (customerId && !customer) throw new Error('العميل غير موجود');
  if (userId && !user) throw new Error('عضو الفريق غير موجود');
}

export async function getCRMWorkspace() {
  try {
    const { tenantId } = await getActiveTenant('dashboard');
    const [tasks, deals, team, activities] = await Promise.all([
      prisma.task.findMany({
        where: { tenantId },
        select: {
          id: true, title: true, description: true, status: true, priority: true,
          dueAt: true, completedAt: true, createdAt: true,
          customer: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, username: true, fullName: true } },
        },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
        take: 300,
      }),
      prisma.deal.findMany({
        where: { tenantId },
        select: {
          id: true, title: true, value: true, stage: true, probability: true,
          expectedCloseAt: true, notes: true, wonAt: true, lostAt: true, createdAt: true,
          customer: { select: { id: true, name: true, phone: true } },
          owner: { select: { id: true, username: true, fullName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }),
      prisma.user.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, username: true, fullName: true, role: true },
        orderBy: { username: 'asc' },
      }),
      prisma.customerActivity.findMany({
        where: { tenantId },
        select: {
          id: true, type: true, title: true, details: true, createdAt: true,
          customer: { select: { id: true, name: true } },
          user: { select: { username: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
    ]);
    const dealTotals = deals.reduce<Record<string, number>>((totals, deal) => {
      totals[deal.stage] = (totals[deal.stage] ?? 0) + money(deal.value);
      return totals;
    }, {});
    return {
      success: true,
      tasks,
      deals: deals.map((deal) => ({ ...deal, value: money(deal.value) })),
      team,
      activities,
      dealTotals,
    };
  } catch (error) {
    console.error('getCRMWorkspace failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تحميل مساحة CRM',
      tasks: [], deals: [], team: [], activities: [], dealTotals: {},
    };
  }
}

export async function saveTask(input: {
  id?: string; title: string; description?: string; status?: string; priority?: string;
  dueAt?: string; customerId?: string; assignedToId?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('tasks');
    const title = cleanText(input.title, 'عنوان المهمة', 2, 150);
    const description = optionalText(input.description, 2000);
    const status = oneOf(input.status ?? 'open', TASK_STATUSES, 'حالة المهمة');
    const priority = oneOf(input.priority ?? 'normal', PRIORITIES, 'الأولوية');
    const dueAt = input.dueAt ? dateValue(input.dueAt, 'موعد المهمة') : null;
    const customerId = optionalText(input.customerId, 100);
    const assignedToId = optionalText(input.assignedToId, 100);
    await validateRelations(tenantId, customerId, assignedToId);

    let task;
    if (input.id) {
      const exists = await prisma.task.findFirst({ where: { id: input.id, tenantId }, select: { id: true } });
      if (!exists) throw new Error('المهمة غير موجودة');
      task = await prisma.task.update({
        where: { id: exists.id },
        data: {
          title, description, status, priority, dueAt, customerId, assignedToId,
          completedAt: status === 'done' ? new Date() : null,
        },
      });
    } else {
      task = await prisma.task.create({
        data: {
          tenantId, title, description, status, priority, dueAt, customerId, assignedToId,
          createdById: session.userId,
          completedAt: status === 'done' ? new Date() : null,
        },
      });
    }
    if (customerId) {
      await prisma.customerActivity.create({
        data: {
          tenantId, customerId, userId: session.userId, type: 'task',
          title: input.id ? 'تحديث مهمة' : 'إضافة مهمة', details: title,
          metadata: { taskId: task.id, status, priority },
        },
      });
    }
    await writeAuditLog({
      tenantId, userId: session.userId,
      action: input.id ? 'task.updated' : 'task.created',
      entityType: 'Task', entityId: task.id,
    });
    revalidatePath('/dashboard');
    return { success: true, task };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ المهمة' };
  }
}

export async function deleteTask(idInput: string) {
  try {
    const { tenantId, session } = await getActiveTenant('tasks');
    const id = cleanText(idInput, 'المهمة', 5, 100);
    const removed = await prisma.task.deleteMany({ where: { id, tenantId } });
    if (removed.count !== 1) throw new Error('المهمة غير موجودة');
    await writeAuditLog({ tenantId, userId: session.userId, action: 'task.deleted', entityType: 'Task', entityId: id });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حذف المهمة' };
  }
}

export async function saveDeal(input: {
  id?: string; customerId: string; ownerId?: string; title: string; value: number;
  stage?: string; probability?: number; expectedCloseAt?: string; notes?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('deals');
    const customerId = cleanText(input.customerId, 'العميل', 5, 100);
    const ownerId = optionalText(input.ownerId, 100);
    const title = cleanText(input.title, 'اسم الصفقة', 2, 150);
    const stage = oneOf(input.stage ?? 'new', DEAL_STAGES, 'مرحلة الصفقة');
    const numericValue = Number(input.value);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100_000_000) {
      throw new Error('قيمة الصفقة غير صالحة');
    }
    const value = new Prisma.Decimal(numericValue.toFixed(2));
    const probability = Math.min(Math.max(Math.trunc(Number(input.probability ?? 10)), 0), 100);
    const expectedCloseAt = input.expectedCloseAt ? dateValue(input.expectedCloseAt, 'موعد الإغلاق') : null;
    const notes = optionalText(input.notes, 2000);
    await validateRelations(tenantId, customerId, ownerId);
    const stageDates = {
      wonAt: stage === 'won' ? new Date() : null,
      lostAt: stage === 'lost' ? new Date() : null,
    };

    let deal;
    if (input.id) {
      const exists = await prisma.deal.findFirst({ where: { id: input.id, tenantId }, select: { id: true } });
      if (!exists) throw new Error('الصفقة غير موجودة');
      deal = await prisma.deal.update({
        where: { id: exists.id },
        data: { customerId, ownerId, title, value, stage, probability, expectedCloseAt, notes, ...stageDates },
      });
    } else {
      deal = await prisma.deal.create({
        data: { tenantId, customerId, ownerId, title, value, stage, probability, expectedCloseAt, notes, ...stageDates },
      });
    }
    await prisma.customerActivity.create({
      data: {
        tenantId, customerId, userId: session.userId, type: 'deal',
        title: input.id ? 'تحديث صفقة' : 'إضافة صفقة',
        details: `${title} — ${money(value)}`,
        metadata: { dealId: deal.id, stage, probability },
      },
    });
    await writeAuditLog({
      tenantId, userId: session.userId,
      action: input.id ? 'deal.updated' : 'deal.created',
      entityType: 'Deal', entityId: deal.id,
      metadata: { stage, value: money(value) },
    });
    revalidatePath('/dashboard');
    return { success: true, deal: { ...deal, value: money(deal.value) } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ الصفقة' };
  }
}

export async function deleteDeal(idInput: string) {
  try {
    const { tenantId, session } = await getActiveTenant('deals');
    const id = cleanText(idInput, 'الصفقة', 5, 100);
    const removed = await prisma.deal.deleteMany({ where: { id, tenantId } });
    if (removed.count !== 1) throw new Error('الصفقة غير موجودة');
    await writeAuditLog({ tenantId, userId: session.userId, action: 'deal.deleted', entityType: 'Deal', entityId: id });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حذف الصفقة' };
  }
}

export async function getCustomerTimeline(customerIdInput: string) {
  try {
    const { tenantId } = await getActiveTenant('customers');
    const customerId = cleanText(customerIdInput, 'العميل', 5, 100);
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
      select: {
        id: true, name: true,
        activities: {
          select: {
            id: true, type: true, title: true, details: true, metadata: true, createdAt: true,
            user: { select: { username: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 300,
        },
      },
    });
    if (!customer) throw new Error('العميل غير موجود');
    return { success: true, customer };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل سجل العميل' };
  }
}
