'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { cleanText, oneOf, optionalText } from '@/lib/validation';

const caseStates = ['new', 'open', 'investigating', 'waiting_customer', 'replaced', 'resolved', 'rejected', 'closed'] as const;
const casePriorities = ['low', 'normal', 'high', 'urgent'] as const;

function nextCaseNumber() {
  return `WAR-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
}

export async function getWarrantyWorkspace() {
  const { tenantId } = await getActiveTenant('subscriptions');
  const cases = await prisma.warrantyCase.findMany({
    where: { tenantId }, orderBy: [{ status: 'asc' }, { openedAt: 'desc' }], take: 250,
    select: {
      id: true, number: true, status: true, priority: true, problem: true, resolution: true, openedAt: true, resolvedAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      order: { select: { id: true, orderNo: true, serviceNameSnapshot: true } },
      subscription: { select: { id: true, orderNo: true, service: { select: { name: true } }, servicePlan: { select: { name: true } } } },
      accountPool: { select: { id: true, label: true } },
      assignedTo: { select: { id: true, fullName: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, type: true, message: true, createdAt: true, actor: { select: { fullName: true } } } },
    },
  });
  const summary = cases.reduce((value, item) => {
    value.total += 1;
    if (['new', 'open', 'investigating', 'waiting_customer'].includes(item.status)) value.open += 1;
    if (item.priority === 'urgent' || item.priority === 'high') value.priority += 1;
    if (item.status === 'replaced') value.replaced += 1;
    return value;
  }, { total: 0, open: 0, priority: 0, replaced: 0 });
  return { success: true, summary, cases };
}

export async function openWarrantyCase(input: { customerId: string; problem: string; orderId?: string; subscriptionId?: string; accountPoolId?: string; priority?: string }) {
  const { tenantId, session } = await getActiveTenant('subscriptions');
  const userId = session.userId;
  const customerId = cleanText(input.customerId, 'العميل', 1, 80);
  const [customer, order, subscription, unit] = await Promise.all([
    prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null }, select: { id: true } }),
    input.orderId ? prisma.order.findFirst({ where: { id: cleanText(input.orderId, 'الطلب', 1, 80), tenantId }, select: { id: true } }) : null,
    input.subscriptionId ? prisma.subscription.findFirst({ where: { id: cleanText(input.subscriptionId, 'الاشتراك', 1, 80), tenantId }, select: { id: true, customerId: true } }) : null,
    input.accountPoolId ? prisma.accountPool.findFirst({ where: { id: cleanText(input.accountPoolId, 'وحدة التسليم', 1, 80), tenantId }, select: { id: true } }) : null,
  ]);
  if (!customer) throw new Error('العميل غير موجود.');
  if (input.orderId && !order) throw new Error('الطلب غير موجود.');
  if (subscription && subscription.customerId !== customerId) throw new Error('الاشتراك لا يخص هذا العميل.');
  if (input.accountPoolId && !unit) throw new Error('وحدة التسليم غير موجودة.');

  const record = await prisma.warrantyCase.create({
    data: {
      tenantId, customerId, orderId: order?.id, subscriptionId: subscription?.id, accountPoolId: unit?.id,
      number: nextCaseNumber(), problem: cleanText(input.problem, 'المشكلة', 3, 2000),
      priority: oneOf(input.priority ?? 'normal', casePriorities, 'أولوية الضمان غير صحيحة'),
      events: { create: { tenantId, type: 'opened', message: 'تم فتح حالة الضمان.', actorId: userId } },
    },
    select: { id: true, number: true },
  });
  await writeAuditLog({ tenantId, userId, action: 'warranty.opened', entityType: 'WarrantyCase', entityId: record.id, metadata: { number: record.number } });
  return { success: true, case: record };
}

export async function updateWarrantyCase(input: { caseId: string; status: string; priority?: string; resolution?: string; assigneeId?: string; note?: string }) {
  const { tenantId, session } = await getActiveTenant('subscriptions');
  const userId = session.userId;
  const caseId = cleanText(input.caseId, 'حالة الضمان', 1, 80);
  const status = oneOf(input.status, caseStates, 'حالة الضمان غير صحيحة');
  const priority = input.priority ? oneOf(input.priority, casePriorities, 'الأولوية غير صحيحة') : undefined;
  if (input.assigneeId) {
    const member = await prisma.user.findFirst({ where: { id: cleanText(input.assigneeId, 'الموظف', 1, 80), tenantId, isActive: true }, select: { id: true } });
    if (!member) throw new Error('الموظف المختار غير موجود ضمن فريق المتجر.');
  }
  const result = await prisma.warrantyCase.updateMany({
    where: { id: caseId, tenantId },
    data: {
      status, priority, resolution: optionalText(input.resolution, 2000), assignedToId: input.assigneeId ? cleanText(input.assigneeId, 'الموظف', 1, 80) : undefined,
      resolvedAt: ['replaced', 'resolved', 'rejected', 'closed'].includes(status) ? new Date() : undefined,
    },
  });
  if (!result.count) throw new Error('حالة الضمان غير موجودة.');
  await prisma.warrantyEvent.create({ data: { tenantId, warrantyCaseId: caseId, type: status, message: optionalText(input.note, 1000) ?? `تم تغيير الحالة إلى ${status}.`, actorId: userId } });
  await writeAuditLog({ tenantId, userId, action: 'warranty.updated', entityType: 'WarrantyCase', entityId: caseId, metadata: { status } });
  return { success: true };
}

export async function markDeliveryUnitProblem(input: { accountPoolId: string; reason: string }) {
  const { tenantId, session } = await getActiveTenant('services');
  const userId = session.userId;
  const accountPoolId = cleanText(input.accountPoolId, 'وحدة التسليم', 1, 80);
  const result = await prisma.accountPool.updateMany({
    where: { id: accountPoolId, tenantId, deletedAt: null },
    data: { status: 'problem', problemReason: cleanText(input.reason, 'السبب', 3, 1000) },
  });
  if (!result.count) throw new Error('وحدة التسليم غير موجودة.');
  await writeAuditLog({ tenantId, userId, action: 'delivery_unit.marked_problem', entityType: 'AccountPool', entityId: accountPoolId });
  return { success: true };
}
