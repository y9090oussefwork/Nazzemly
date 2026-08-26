'use server';

import { Bot } from 'grammy';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';
import { getActiveTenant } from '@/lib/tenant';
import { decryptBotToken } from '@/lib/telegram-manager';
import { cleanText, oneOf } from '@/lib/validation';

const customerStages = ['lead', 'qualified', 'customer', 'inactive'] as const;

function uniqueCustomerIds(rawIds: string[]) {
  const ids = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error('اختر عميلًا واحدًا على الأقل.');
  if (ids.length > 100) throw new Error('يمكن تنفيذ الإجراء على 100 عميل كحد أقصى في المرة الواحدة.');
  return ids.map((id) => cleanText(id, 'معرّف العميل', 3, 80));
}

function cleanTags(rawTags: string[] | undefined) {
  const suppliedTags = (rawTags || [])
    .map((tag) => typeof tag === 'string' ? tag.trim() : '')
    .filter(Boolean);
  return [...new Set(suppliedTags.map((tag) => cleanText(tag, 'الوسم', 1, 30)))].slice(0, 20);
}

function mergeTags(current: string[], add: string[], remove: string[]) {
  const removed = new Set(remove.map((tag) => tag.toLocaleLowerCase('ar-EG')));
  const result = current.filter((tag) => !removed.has(tag.toLocaleLowerCase('ar-EG')));
  for (const tag of add) {
    if (!result.some((existing) => existing.toLocaleLowerCase('ar-EG') === tag.toLocaleLowerCase('ar-EG'))) result.push(tag);
  }
  return result.slice(0, 20);
}

export async function bulkUpdateCustomers(input: {
  customerIds: string[];
  addTags?: string[];
  removeTags?: string[];
  stage?: string;
  markContacted?: boolean;
}) {
  const { tenantId, session } = await getActiveTenant('customers');
  const customerIds = uniqueCustomerIds(input.customerIds);
  const addTags = cleanTags(input.addTags);
  const removeTags = cleanTags(input.removeTags);
  const stage = input.stage ? oneOf(input.stage, customerStages, 'مرحلة العميل') : null;
  if (!addTags.length && !removeTags.length && !stage && !input.markContacted) throw new Error('اختر إجراءً واحدًا على الأقل.');

  const customers = await prisma.customer.findMany({
    where: { tenantId, id: { in: customerIds }, deletedAt: null },
    select: { id: true, tags: true },
  });
  if (customers.length !== customerIds.length) throw new Error('تعذر العثور على أحد العملاء المختارين. حدّث الصفحة ثم حاول مرة أخرى.');

  const actionParts = [
    addTags.length ? `إضافة الوسوم: ${addTags.join('، ')}` : '',
    removeTags.length ? `إزالة الوسوم: ${removeTags.join('، ')}` : '',
    stage ? 'تغيير مرحلة العميل' : '',
    input.markContacted ? 'تسجيل متابعة' : '',
  ].filter(Boolean);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const customer of customers) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          ...(addTags.length || removeTags.length ? { tags: mergeTags(customer.tags, addTags, removeTags) } : {}),
          ...(stage ? { stage } : {}),
          ...(input.markContacted ? { lastContactAt: now } : {}),
        },
      });
      await tx.customerActivity.create({
        data: {
          tenantId,
          customerId: customer.id,
          userId: session.userId,
          type: 'bulk_update',
          title: 'إجراء جماعي على العميل',
          details: actionParts.join(' · '),
          metadata: { addTags, removeTags, stage, markContacted: Boolean(input.markContacted), selectedCount: customers.length },
        },
      });
    }
  });

  await writeAuditLog({
    tenantId,
    userId: session.userId,
    action: 'customers.bulk_updated',
    entityType: 'Customer',
    metadata: { customerIds, addTags, removeTags, stage, markContacted: Boolean(input.markContacted) },
  });
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/customers');
  return { success: true, updated: customers.length };
}

export async function sendTelegramBulkMessage(input: { customerIds: string[]; message: string }) {
  const { tenantId, session } = await getActiveTenant('customers');
  const customerIds = uniqueCustomerIds(input.customerIds);
  const message = cleanText(input.message, 'نص الرسالة', 3, 3000);
  const [settings, customers] = await Promise.all([
    prisma.botSettings.findUnique({
      where: { tenantId },
      select: { isActive: true, botTokenEncrypted: true, botToken: true },
    }),
    prisma.customer.findMany({
      where: { tenantId, id: { in: customerIds }, deletedAt: null },
      select: { id: true, name: true, tgId: true },
    }),
  ]);
  if (customers.length !== customerIds.length) throw new Error('تعذر العثور على أحد العملاء المختارين. حدّث الصفحة ثم حاول مرة أخرى.');
  if (!settings?.isActive || (!settings.botTokenEncrypted && !settings.botToken)) throw new Error('اربط وشغّل بوت تيليجرام أولًا لإرسال الرسائل الجماعية.');

  const bot = new Bot(decryptBotToken(settings));
  const deliveredIds: string[] = [];
  const failedIds: string[] = [];
  let skipped = 0;
  for (const customer of customers) {
    if (!customer.tgId) {
      skipped += 1;
      continue;
    }
    try {
      await bot.api.sendMessage(customer.tgId, message.replaceAll('{customer_name}', customer.name));
      deliveredIds.push(customer.id);
    } catch {
      failedIds.push(customer.id);
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const customer of customers) {
      const delivered = deliveredIds.includes(customer.id);
      const state = delivered ? 'تم الإرسال عبر تيليجرام' : customer.tgId ? 'تعذر الإرسال عبر تيليجرام' : 'تخطي: العميل لم يربط تيليجرام';
      await tx.customerActivity.create({
        data: {
          tenantId,
          customerId: customer.id,
          userId: session.userId,
          type: 'telegram_message',
          title: state,
          details: message.slice(0, 700),
          metadata: { channel: 'telegram', delivered, bulk: true },
        },
      });
      if (delivered) await tx.customer.update({ where: { id: customer.id }, data: { lastContactAt: now } });
    }
  });

  await writeAuditLog({
    tenantId,
    userId: session.userId,
    action: 'customers.telegram_bulk_message',
    entityType: 'Customer',
    metadata: { customerIds, delivered: deliveredIds.length, failed: failedIds.length, skipped },
  });
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/customers');
  return { success: true, delivered: deliveredIds.length, failed: failedIds.length, skipped };
}
