'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { cleanText, oneOf } from '@/lib/validation';
import { writeAuditLog } from '@/lib/audit';

const channels = ['telegram', 'whatsapp', 'internal'] as const;

export async function getMessageTemplates() {
  const { tenantId } = await getActiveTenant('dashboard', { allowInactiveTenant: true });
  const templates = await prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: [{ category: 'asc' }, { name: 'asc' }], select: { id: true, name: true, category: true, channel: true, content: true, isActive: true, updatedAt: true } });
  return { success: true, templates };
}

export async function saveMessageTemplate(input: { id?: string; name: string; category?: string; channel: string; content: string; isActive?: boolean }) {
  const { tenantId, session } = await getActiveTenant('dashboard');
  const data = { name: cleanText(input.name, 'اسم القالب', 2, 100), category: cleanText(input.category || 'general', 'التصنيف', 2, 50), channel: oneOf(input.channel, channels, 'القناة'), content: cleanText(input.content, 'نص الرسالة', 3, 3000), isActive: input.isActive !== false };
  const id = input.id ? cleanText(input.id, 'القالب', 1, 80) : null;
  if (id) {
    const updated = await prisma.messageTemplate.updateMany({ where: { id, tenantId }, data });
    if (!updated.count) throw new Error('القالب غير موجود.');
  } else {
    await prisma.messageTemplate.create({ data: { tenantId, ...data } });
  }
  await writeAuditLog({ tenantId, userId: session.userId, action: id ? 'message_template.updated' : 'message_template.created', entityType: 'MessageTemplate', entityId: id });
  return { success: true };
}

export async function deleteMessageTemplate(id: string) {
  const { tenantId, session } = await getActiveTenant('dashboard');
  const templateId = cleanText(id, 'القالب', 1, 80);
  await prisma.messageTemplate.deleteMany({ where: { id: templateId, tenantId } });
  await writeAuditLog({ tenantId, userId: session.userId, action: 'message_template.deleted', entityType: 'MessageTemplate', entityId: templateId });
  return { success: true };
}
