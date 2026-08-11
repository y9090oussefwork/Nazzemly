'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { cleanText, oneOf, optionalText } from '@/lib/validation';
import { encryptSecret, randomToken } from '@/lib/security';
import { writeAuditLog } from '@/lib/audit';

const TRIGGERS = ['command', 'keyword', 'welcome', 'payment_approved', 'subscription_expiring'] as const;

export async function getBotControlCenter() {
  try {
    const { tenantId } = await getActiveTenant('bot');
    const [settings, automations, broadcasts, events, linkedCustomers] = await Promise.all([
      prisma.botSettings.findUnique({
        where: { tenantId },
        select: {
          id: true,
          botUsername: true,
          botName: true,
          tokenLast4: true,
          isActive: true,
          welcomeMsg: true,
          supportMessage: true,
          menuConfig: true,
          connectionStatus: true,
          lastWebhookAt: true,
          lastHealthCheckAt: true,
          lastError: true,
          updatedAt: true,
        },
      }),
      prisma.botAutomation.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          trigger: true,
          triggerConfig: true,
          actionType: true,
          message: true,
          actionConfig: true,
          sortOrder: true,
          isActive: true,
          version: true,
          updatedAt: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.botBroadcast.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          message: true,
          segment: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          delivered: true,
          failed: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.botEvent.findMany({
        where: { tenantId },
        select: {
          id: true,
          externalId: true,
          type: true,
          status: true,
          attempts: true,
          processedAt: true,
          error: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.customer.count({ where: { tenantId, tgId: { not: null }, deletedAt: null } }),
    ]);
    return {
      success: true,
      settings,
      automations,
      broadcasts,
      events,
      metrics: {
        linkedCustomers,
        delivered: broadcasts.reduce((sum, item) => sum + item.delivered, 0),
        failed: broadcasts.reduce((sum, item) => sum + item.failed, 0),
        failedEvents: events.filter((item) => item.status === 'failed').length,
      },
      triggerOptions: TRIGGERS,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تحميل مركز البوت',
      settings: null,
      automations: [],
      broadcasts: [],
      events: [],
      metrics: { linkedCustomers: 0, delivered: 0, failed: 0, failedEvents: 0 },
      triggerOptions: TRIGGERS,
    };
  }
}

export async function saveBotAutomation(input: {
  id?: string;
  name: string;
  trigger: string;
  triggerValue?: string;
  message: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('bot');
    const name = cleanText(input.name, 'اسم الأتمتة', 2, 100);
    const trigger = oneOf(input.trigger, TRIGGERS, 'نوع التشغيل');
    const triggerValue = optionalText(input.triggerValue, 100);
    const message = cleanText(input.message, 'نص الرسالة', 1, 4000);
    if ((trigger === 'command' || trigger === 'keyword') && !triggerValue) {
      throw new Error('اكتب الكلمة أو الأمر الذي يشغل الرسالة');
    }

    let settings = await prisma.botSettings.findUnique({
      where: { tenantId },
      select: { id: true },
    });
    if (!settings) {
      settings = await prisma.botSettings.create({
        data: { tenantId, botName: 'بوت المتجر' },
        select: { id: true },
      });
    }

    const data = {
      name,
      trigger,
      triggerConfig: triggerValue ? { value: triggerValue } : undefined,
      actionType: 'message',
      message,
      isActive: input.isActive ?? true,
      sortOrder: Math.min(Math.max(Math.trunc(Number(input.sortOrder ?? 0)), 0), 10_000),
    };

    let automation;
    if (input.id) {
      const existing = await prisma.botAutomation.findFirst({
        where: { id: input.id, tenantId },
        select: { id: true, version: true },
      });
      if (!existing) throw new Error('الأتمتة غير موجودة');
      automation = await prisma.botAutomation.update({
        where: { id: existing.id },
        data: { ...data, version: { increment: 1 } },
      });
    } else {
      automation = await prisma.botAutomation.create({
        data: { tenantId, botSettingsId: settings.id, ...data },
      });
    }

    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: input.id ? 'bot.automation_updated' : 'bot.automation_created',
      entityType: 'BotAutomation',
      entityId: automation.id,
      metadata: { trigger, triggerValue, isActive: automation.isActive },
    });
    revalidatePath('/dashboard');
    return { success: true, automation };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ الأتمتة' };
  }
}

export async function deleteBotAutomation(idInput: string) {
  try {
    const { tenantId, session } = await getActiveTenant('bot');
    const id = cleanText(idInput, 'الأتمتة', 5, 100);
    const removed = await prisma.botAutomation.deleteMany({ where: { id, tenantId } });
    if (removed.count !== 1) throw new Error('الأتمتة غير موجودة');
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'bot.automation_deleted',
      entityType: 'BotAutomation',
      entityId: id,
    });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حذف الأتمتة' };
  }
}

export async function queueBroadcast(input: {
  name: string;
  message: string;
  stage?: string;
  tag?: string;
  scheduledAt?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('bot');
    const name = cleanText(input.name, 'اسم الحملة', 2, 100);
    const message = cleanText(input.message, 'نص الرسالة', 1, 4000);
    const stage = optionalText(input.stage, 40);
    const tag = optionalText(input.tag, 50);
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) throw new Error('موعد الإرسال غير صالح');

    const settings = await prisma.botSettings.findUnique({
      where: { tenantId },
      select: { id: true, isActive: true, botTokenEncrypted: true },
    });
    if (!settings?.isActive || !settings.botTokenEncrypted) {
      throw new Error('فعّل البوت أولاً قبل إنشاء حملة');
    }

    const broadcast = await prisma.botBroadcast.create({
      data: {
        tenantId,
        botSettingsId: settings.id,
        name,
        message,
        segment: { stage, tag },
        status: 'queued',
        scheduledAt,
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'bot.broadcast_queued',
      entityType: 'BotBroadcast',
      entityId: broadcast.id,
      metadata: { scheduledAt, stage, tag },
    });
    revalidatePath('/dashboard');
    return { success: true, broadcast };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر جدولة الحملة' };
  }
}

export async function cancelBroadcast(idInput: string) {
  try {
    const { tenantId, session } = await getActiveTenant('bot');
    const id = cleanText(idInput, 'الحملة', 5, 100);
    const changed = await prisma.botBroadcast.updateMany({
      where: { id, tenantId, status: { in: ['draft', 'queued'] } },
      data: { status: 'cancelled' },
    });
    if (changed.count !== 1) throw new Error('الحملة غير موجودة أو بدأ إرسالها');
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'bot.broadcast_cancelled',
      entityType: 'BotBroadcast',
      entityId: id,
    });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إلغاء الحملة' };
  }
}

export async function rotateSmsWebhookSecret(allowedSendersInput: string[]) {
  try {
    const { tenantId, session } = await getActiveTenant('settings');
    const allowedSenders = Array.from(
      new Set(
        allowedSendersInput
          .map((value) => value.trim())
          .filter((value) => /^[A-Za-z0-9+_. -]{2,50}$/.test(value))
          .slice(0, 50),
      ),
    );
    const secret = randomToken(32);
    await prisma.sMSIntegration.upsert({
      where: { tenantId },
      update: {
        secretEncrypted: encryptSecret(secret),
        secretLast4: secret.slice(-4),
        isActive: true,
        allowedSenders,
        lastError: null,
      },
      create: {
        tenantId,
        secretEncrypted: encryptSecret(secret),
        secretLast4: secret.slice(-4),
        isActive: true,
        allowedSenders,
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'sms.secret_rotated',
      entityType: 'SMSIntegration',
      entityId: tenantId,
      metadata: { allowedSendersCount: allowedSenders.length },
    });
    const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') ?? '';
    return {
      success: true,
      secret,
      webhookUrl: `${baseUrl}/api/webhooks/sms/${tenantId}`,
      warning: 'انسخ السر الآن؛ لن يظهر مرة أخرى.',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إنشاء سر الربط' };
  }
}

export async function saveBotPaymentMenu(input: {
  vodafoneNumber?: string;
  instapayAddress?: string;
  rechargeAmounts?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('bot');
    const vodafoneNumber = optionalText(input.vodafoneNumber, 40);
    const instapayAddress = optionalText(input.instapayAddress, 120);
    if (vodafoneNumber && !/^[+0-9\s-]{7,30}$/.test(vodafoneNumber)) {
      throw new Error('رقم فودافون كاش غير صالح');
    }
    const rechargeAmounts = (input.rechargeAmounts || '50,100,200,500')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0 && item <= 100000)
      .slice(0, 8);
    if (!vodafoneNumber && !instapayAddress) {
      throw new Error('أدخل وسيلة دفع واحدة على الأقل');
    }
    if (!rechargeAmounts.length) throw new Error('أدخل قيمة شحن واحدة على الأقل');

    const settings = await prisma.botSettings.upsert({
      where: { tenantId },
      update: { menuConfig: { vodafoneNumber, instapayAddress, rechargeAmounts } },
      create: {
        tenantId,
        botName: 'بوت المتجر',
        menuConfig: { vodafoneNumber, instapayAddress, rechargeAmounts },
      },
      select: { id: true, menuConfig: true },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'bot.payment_menu_updated',
      entityType: 'BotSettings',
      entityId: settings.id,
    });
    revalidatePath('/dashboard');
    return { success: true, menuConfig: settings.menuConfig };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر حفظ وسائل الدفع' };
  }
}
