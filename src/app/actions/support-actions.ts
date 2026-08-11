'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { requireSuperAdmin } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

function text(value: unknown, label: string, min: number, max: number) {
  const cleaned = String(value ?? '').trim();
  if (cleaned.length < min) throw new Error(`${label} قصير جداً`);
  if (cleaned.length > max) throw new Error(`${label} أطول من المسموح`);
  return cleaned;
}

function ticketDto<T extends { createdAt: Date; updatedAt: Date; lastReplyAt: Date; closedAt: Date | null; messages: Array<{ createdAt: Date }> }>(ticket: T) {
  return {
    ...ticket,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastReplyAt: ticket.lastReplyAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
    messages: ticket.messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
  };
}

export async function getMySupportTickets() {
  try {
    const { tenantId } = await getActiveTenant('dashboard');
    const tickets = await prisma.supportTicket.findMany({
      where: { tenantId },
      orderBy: { lastReplyAt: 'desc' },
      include: {
        createdBy: { select: { fullName: true, username: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { fullName: true, username: true } } } },
      },
      take: 100,
    });
    return { success: true, tickets: tickets.map(ticketDto) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل رسائل الدعم', tickets: [] };
  }
}

export async function createSupportTicket(input: { subject: string; category?: string; priority?: string; message: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('dashboard');
    const subject = text(input.subject, 'عنوان المشكلة', 3, 160);
    const message = text(input.message, 'تفاصيل المشكلة', 10, 5000);
    const category = ['general', 'technical', 'billing', 'bot', 'suggestion'].includes(input.category || '') ? input.category! : 'general';
    const priority = ['low', 'normal', 'high', 'urgent'].includes(input.priority || '') ? input.priority! : 'normal';
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId,
        createdById: session.userId,
        subject,
        category,
        priority,
        status: 'open',
        lastReplyBy: 'merchant',
        messages: { create: { tenantId, authorId: session.userId, senderType: 'merchant', message } },
      },
    });
    await writeAuditLog({ tenantId, userId: session.userId, action: 'support.ticket_created', entityType: 'SupportTicket', entityId: ticket.id, metadata: { category, priority } });
    revalidatePath('/dashboard/support');
    revalidatePath('/admin/support');
    return { success: true, ticketId: ticket.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إرسال طلب الدعم' };
  }
}

export async function replySupportTicket(input: { ticketId: string; message: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('dashboard');
    const message = text(input.message, 'الرسالة', 2, 5000);
    const ticket = await prisma.supportTicket.findFirst({ where: { id: input.ticketId, tenantId }, select: { id: true, status: true } });
    if (!ticket) throw new Error('طلب الدعم غير موجود');
    await prisma.$transaction([
      prisma.supportMessage.create({ data: { tenantId, ticketId: ticket.id, authorId: session.userId, senderType: 'merchant', message } }),
      prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: ticket.status === 'closed' ? 'open' : ticket.status, closedAt: null, lastReplyBy: 'merchant', lastReplyAt: new Date() } }),
    ]);
    revalidatePath('/dashboard/support');
    revalidatePath('/admin/support');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إرسال الرد' };
  }
}

export async function getPlatformSupportTickets() {
  try {
    await requireSuperAdmin();
    const tickets = await prisma.supportTicket.findMany({
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { lastReplyAt: 'desc' }],
      include: {
        tenant: { select: { id: true, storeName: true, saasPlan: true, saasStatus: true } },
        createdBy: { select: { fullName: true, username: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { fullName: true, username: true } } } },
      },
      take: 300,
    });
    return { success: true, tickets: tickets.map(ticketDto) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل تذاكر التجار', tickets: [] };
  }
}

export async function replyPlatformSupportTicket(input: { ticketId: string; message: string }) {
  try {
    const session = await requireSuperAdmin();
    const message = text(input.message, 'الرسالة', 2, 5000);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: input.ticketId }, select: { id: true, tenantId: true } });
    if (!ticket) throw new Error('طلب الدعم غير موجود');
    await prisma.$transaction([
      prisma.supportMessage.create({ data: { tenantId: ticket.tenantId, ticketId: ticket.id, authorId: session.userId, senderType: 'platform', message } }),
      prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'answered', closedAt: null, lastReplyBy: 'platform', lastReplyAt: new Date() } }),
    ]);
    await writeAuditLog({ tenantId: ticket.tenantId, userId: session.userId, action: 'support.platform_replied', entityType: 'SupportTicket', entityId: ticket.id });
    revalidatePath('/dashboard/support');
    revalidatePath('/admin/support');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إرسال الرد' };
  }
}

export async function setPlatformTicketStatus(input: { ticketId: string; status: 'open' | 'in_progress' | 'answered' | 'closed' }) {
  try {
    const session = await requireSuperAdmin();
    const ticket = await prisma.supportTicket.update({
      where: { id: input.ticketId },
      data: { status: input.status, closedAt: input.status === 'closed' ? new Date() : null },
    });
    await writeAuditLog({ tenantId: ticket.tenantId, userId: session.userId, action: 'support.status_updated', entityType: 'SupportTicket', entityId: ticket.id, metadata: { status: input.status } });
    revalidatePath('/dashboard/support');
    revalidatePath('/admin/support');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث حالة الطلب' };
  }
}
