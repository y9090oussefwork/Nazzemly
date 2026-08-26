/* eslint-disable @typescript-eslint/no-unused-vars */
'use server';

import { Bot } from 'grammy';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';
import { decryptSecret, encryptSecret } from '@/lib/security';
import { decryptBotToken } from '@/lib/telegram-manager';
import {
  DEFAULT_STATUS_TEMPLATES,
  FULFILLMENT_MODES,
  normalizeRequiredFields,
  normalizeStatusTemplates,
  renderOrderMessage,
} from '@/lib/order-fulfillment';

const DELIVERY_KINDS = ['account', 'link', 'code', 'custom'] as const;
const DELIVERY_STATUSES = ['available', 'disabled'] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}

function text(value: unknown, label: string, max = 1500) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} مطلوب`);
  if (result.length > max) throw new Error(`${label} أطول من المسموح`);
  return result;
}

function optionalText(value: unknown, max = 1500) {
  const result = String(value ?? '').trim();
  if (!result) return null;
  if (result.length > max) throw new Error('النص أطول من المسموح');
  return result;
}

function renewalSourceId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).renewedFromId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function int(value: unknown, label: string, min: number, max: number) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${label} غير صحيح`);
  return result;
}

async function sendTelegramStatusMessage(input: {
  tenantId: string;
  tgId: string | null;
  message: string;
}) {
  if (!input.tgId || !input.message) return false;
  const settings = await prisma.botSettings.findUnique({ where: { tenantId: input.tenantId } });
  if (!settings?.isActive) return false;
  try {
    const bot = new Bot(decryptBotToken(settings));
    await bot.api.sendMessage(input.tgId, input.message);
    return true;
  } catch (error) {
    console.error('Could not send order status message', error);
    return false;
  }
}

export async function savePlanFulfillmentSettings(input: {
  servicePlanId: string;
  fulfillmentMode: string;
  requiredCustomerFields?: Array<{ label: string; type?: string; required?: boolean }>;
  statusTemplates?: Array<{ key?: string; label: string; message: string; final?: boolean }>;
  purchaseMessage?: string;
  warrantyType?: string;
  warrantyDays?: number | null;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    if (!FULFILLMENT_MODES.includes(input.fulfillmentMode as (typeof FULFILLMENT_MODES)[number])) {
      throw new Error('طريقة التنفيذ غير صحيحة');
    }
    const plan = await prisma.servicePlan.findFirst({
      where: { id: input.servicePlanId, tenantId },
      select: { id: true },
    });
    if (!plan) throw new Error('الخطة غير موجودة');
    const requiredCustomerFields = (input.requiredCustomerFields ?? [])
      .map((field, index) => ({
        key: `field_${index + 1}`,
        label: text(field.label, 'اسم البيان', 80),
        type: ['email', 'phone', 'password'].includes(String(field.type)) ? String(field.type) : 'text',
        required: field.required !== false,
      }))
      .slice(0, 12);
    const statusTemplates = (input.statusTemplates?.length ? input.statusTemplates : DEFAULT_STATUS_TEMPLATES)
      .map((item, index) => ({
        key: String(item.key || `custom_${index + 1}`).trim().slice(0, 60),
        label: text(item.label, 'اسم الحالة', 80),
        message: text(item.message, 'رسالة الحالة', 1500),
        final: item.final === true,
      }))
      .slice(0, 20);
    const warrantyType = ['none', 'fixed_days', 'subscription_duration'].includes(String(input.warrantyType))
      ? String(input.warrantyType)
      : 'none';
    const warrantyDays = warrantyType === 'fixed_days' ? int(input.warrantyDays, 'مدة الضمان', 1, 3650) : null;
    await prisma.servicePlan.update({
      where: { id: plan.id },
      data: {
        fulfillmentMode: input.fulfillmentMode,
        requiredCustomerFields,
        statusTemplates,
        purchaseMessage: optionalText(input.purchaseMessage, 1500),
        warrantyType,
        warrantyDays,
        ...(input.fulfillmentMode === 'auto_delivery' ? { trackInventory: true } : {}),
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'fulfillment.settings_updated',
      entityType: 'ServicePlan',
      entityId: plan.id,
      metadata: { fulfillmentMode: input.fulfillmentMode, warrantyType },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function getDeliveryInventory(servicePlanId?: string) {
  const { tenantId } = await getActiveTenant('services');
  const items = await prisma.accountPool.findMany({
    where: { tenantId, ...(servicePlanId ? { servicePlanId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: {
      service: { select: { name: true } },
      servicePlan: { select: { name: true } },
      allocations: {
        where: { revokedAt: null },
        orderBy: { deliveredAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          order: { select: { id: true, orderNo: true } },
        },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    serviceId: item.serviceId,
    servicePlanId: item.servicePlanId,
    serviceName: item.service.name,
    planName: item.servicePlan?.name || null,
    label: item.label,
    kind: item.kind,
    credentialHint: item.credentialHint,
    capacity: item.capacity,
    deliveredCount: item.deliveredCount,
    remaining: Math.max(0, item.capacity - item.deliveredCount),
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    allocations: item.allocations.map((allocation) => ({
      id: allocation.id,
      deliveredAt: allocation.deliveredAt.toISOString(),
      customer: allocation.customer,
      order: allocation.order,
    })),
  }));
}

export async function addDeliveryUnits(input: {
  servicePlanId: string;
  units: Array<{ label?: string; kind?: string; credentials: string; capacity?: number }>;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    const plan = await prisma.servicePlan.findFirst({
      where: { id: input.servicePlanId, tenantId },
      select: { id: true, serviceId: true },
    });
    if (!plan) throw new Error('الخطة غير موجودة');
    const units = input.units.slice(0, 200).map((unit, index) => {
      const credentials = text(unit.credentials, `بيانات الوحدة ${index + 1}`, 5000);
      const kind = DELIVERY_KINDS.includes(unit.kind as (typeof DELIVERY_KINDS)[number]) ? unit.kind! : 'account';
      const capacity = int(unit.capacity ?? 1, 'عدد مرات البيع', 1, 10000);
      return {
        tenantId,
        serviceId: plan.serviceId,
        servicePlanId: plan.id,
        label: optionalText(unit.label, 120),
        kind,
        credentialsEncrypted: encryptSecret(credentials),
        credentialHint: `${credentials.slice(0, 3)}••••`,
        capacity,
      };
    });
    if (!units.length) throw new Error('أضف وحدة تسليم واحدة على الأقل');
    const totalCapacity = units.reduce((sum, unit) => sum + unit.capacity, 0);
    await prisma.$transaction(async (tx) => {
      await tx.accountPool.createMany({ data: units });
      await tx.servicePlan.update({
        where: { id: plan.id },
        data: { trackInventory: true, stockQuantity: { increment: totalCapacity } },
      });
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'delivery_inventory.created',
      entityType: 'ServicePlan',
      entityId: plan.id,
      metadata: { units: units.length, capacity: totalCapacity },
    });
    return { success: true, createdCount: units.length, addedCapacity: totalCapacity };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function setDeliveryUnitStatus(input: { id: string; status: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    if (!DELIVERY_STATUSES.includes(input.status as (typeof DELIVERY_STATUSES)[number])) throw new Error('الحالة غير صحيحة');
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.accountPool.findFirst({ where: { id: input.id, tenantId } });
      if (!item) throw new Error('وحدة التسليم غير موجودة');
      if (item.status === input.status) return item;
      const remaining = Math.max(0, item.capacity - item.deliveredCount);
      if (item.servicePlanId && remaining > 0) {
        const plan = await tx.servicePlan.findFirst({ where: { id: item.servicePlanId, tenantId } });
        if (plan) {
          const nextStock = input.status === 'available'
            ? plan.stockQuantity + remaining
            : Math.max(0, plan.stockQuantity - remaining);
          await tx.servicePlan.update({ where: { id: plan.id }, data: { stockQuantity: nextStock } });
        }
      }
      return tx.accountPool.update({ where: { id: item.id }, data: { status: input.status } });
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'delivery_inventory.status_updated',
      entityType: 'AccountPool',
      entityId: result.id,
      metadata: { status: input.status },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function revealDeliveryUnit(id: string) {
  try {
    const { tenantId, session } = await getActiveTenant('services');
    const item = await prisma.accountPool.findFirst({
      where: { id, tenantId },
      select: { id: true, credentials: true, credentialsEncrypted: true },
    });
    if (!item) throw new Error('وحدة التسليم غير موجودة');
    const credentials = item.credentialsEncrypted ? decryptSecret(item.credentialsEncrypted) : item.credentials || '';
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'delivery_inventory.revealed',
      entityType: 'AccountPool',
      entityId: item.id,
    });
    return { success: true, credentials };
  } catch (error) {
    return { success: false, error: errorMessage(error), credentials: '' };
  }
}

export async function getOrders(input?: { status?: string; query?: string; queueOnly?: boolean }) {
  const { tenantId } = await getActiveTenant('subscriptions', { allowInactiveTenant: true });
  const query = String(input?.query ?? '').trim().slice(0, 100);
  const rows = await prisma.order.findMany({
    where: {
      tenantId,
      ...(input?.status ? { fulfillmentStatus: input.status } : input?.queueOnly ? { fulfillmentStatus: { notIn: ['fulfilled', 'cancelled'] } } : {}),
      ...(query
        ? {
            OR: [
              { orderNo: { contains: query, mode: 'insensitive' } },
              { customer: { name: { contains: query, mode: 'insensitive' } } },
              { customer: { phone: { contains: query } } },
              { service: { name: { contains: query, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      customer: { select: { id: true, name: true, phone: true, tgId: true, tgUsername: true } },
      service: { select: { id: true, name: true } },
      servicePlan: { select: { id: true, name: true, durationDays: true, statusTemplates: true } },
      assignedTo: { select: { id: true, fullName: true, username: true } },
      inputValues: { select: { id: true, fieldKey: true, label: true } },
      deliveryAllocations: {
        include: { accountPool: { select: { id: true, label: true, kind: true, credentialHint: true } } },
      },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  return rows.map((order) => ({
    ...order,
    amount: Number(order.amount),
    costPrice: Number(order.costPrice),
    discountAmount: Number(order.discountAmount),
    paymentFee: Number(order.paymentFee),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt?.toISOString() || null,
    warrantyEndsAt: order.warrantyEndsAt?.toISOString() || null,
    statusTemplates: normalizeStatusTemplates(order.servicePlan?.statusTemplates),
    events: order.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString(), sentAt: event.sentAt?.toISOString() || null })),
  }));
}

export async function revealOrderInputValues(orderId: string) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true, inputValues: { select: { fieldKey: true, label: true, valueEncrypted: true } } },
    });
    if (!order) throw new Error('الطلب غير موجود');
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'order.customer_data_revealed',
      entityType: 'Order',
      entityId: order.id,
    });
    return {
      success: true,
      values: order.inputValues.map((item) => ({
        key: item.fieldKey,
        label: item.label,
        value: decryptSecret(item.valueEncrypted),
      })),
    };
  } catch (error) {
    return { success: false, error: errorMessage(error), values: [] };
  }
}

export async function updateOrderFulfillmentStatus(input: {
  orderId: string;
  status: string;
  message?: string;
  sendToCustomer?: boolean;
  internalNote?: string;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const before = await prisma.order.findFirst({
      where: { id: input.orderId, tenantId },
      include: {
        customer: { select: { name: true, tgId: true } },
        service: { select: { name: true } },
        servicePlan: true,
        events: { where: { type: 'order_created' }, orderBy: { createdAt: 'asc' }, take: 1, select: { metadata: true } },
      },
    });
    if (!before) throw new Error('الطلب غير موجود');
    const templates = normalizeStatusTemplates(before.servicePlan?.statusTemplates);
    const template = templates.find((item) => item.key === input.status);
    if (!template && !['awaiting_contact', 'awaiting_customer_data', 'activation_in_progress', 'invitation_sent', 'fulfilled', 'cancelled'].includes(input.status)) {
      throw new Error('حالة الطلب غير صحيحة');
    }
    const rawMessage = optionalText(input.message, 1500) || template?.message || '';
    const customerMessage = renderOrderMessage(rawMessage, {
      customerName: before.customer.name,
      serviceName: before.service.name,
      planName: before.servicePlan?.name,
      orderNo: before.orderNo,
    });
    const finalState = template?.final === true || input.status === 'fulfilled';
    const cancelled = input.status === 'cancelled';
    const previousSubscriptionId = renewalSourceId(before.events[0]?.metadata);
    const updated = await prisma.$transaction(async (tx) => {
      let subscriptionId = before.subscriptionId;
      let warrantyEndsAt = before.warrantyEndsAt;
      if (finalState && !cancelled && !subscriptionId) {
        const activationDate = new Date();
        const previousSubscription = previousSubscriptionId
          ? await tx.subscription.findFirst({
              where: { id: previousSubscriptionId, tenantId, customerId: before.customerId, serviceId: before.serviceId },
              select: { id: true, endDate: true, notes: true },
            })
          : null;
        const startDate = previousSubscription && previousSubscription.endDate > activationDate
          ? previousSubscription.endDate
          : activationDate;
        const durationDays = before.servicePlan?.durationDays || 30;
        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + durationDays);
        const subscription = await tx.subscription.create({
          data: {
            tenantId,
            customerId: before.customerId,
            serviceId: before.serviceId,
            servicePlanId: before.servicePlanId,
            renewedFromId: previousSubscription?.id || null,
            orderNo: before.orderNo,
            package: before.servicePlan?.name,
            startDate,
            endDate,
            sellingPrice: before.amount,
            priceBeforeDiscount: before.amount,
            costPrice: before.costPrice,
            status: 'active',
            notes: previousSubscription ? 'تم تفعيل تجديد من إدارة الطلبات' : 'تم التفعيل من إدارة الطلبات',
            createdBy: session.userId,
          },
        });
        subscriptionId = subscription.id;
        if (previousSubscription) {
          await tx.subscription.update({
            where: { id: previousSubscription.id },
            data: {
              status: 'expired',
              renewalStatus: 'renewed',
              notes: [previousSubscription.notes, `تم التجديد بعد التفعيل في ${activationDate.toLocaleDateString('ar-EG')}`].filter(Boolean).join('\n'),
            },
          });
        }
        if (before.warrantyType === 'subscription_duration') warrantyEndsAt = endDate;
        if (before.warrantyType === 'fixed_days' && before.servicePlan?.warrantyDays) {
          warrantyEndsAt = new Date(startDate);
          warrantyEndsAt.setUTCDate(warrantyEndsAt.getUTCDate() + before.servicePlan.warrantyDays);
        }
      }
      return tx.order.update({
        where: { id: before.id },
        data: {
          fulfillmentStatus: input.status,
          subscriptionId,
          warrantyEndsAt,
          completedAt: finalState && !cancelled ? new Date() : before.completedAt,
          cancelledAt: cancelled ? new Date() : before.cancelledAt,
          internalNote: optionalText(input.internalNote, 2000) ?? before.internalNote,
          events: {
            create: {
              tenantId,
              actorId: session.userId,
              type: 'fulfillment_status_changed',
              fromStatus: before.fulfillmentStatus,
              toStatus: input.status,
              message: customerMessage || null,
              isCustomerVisible: input.sendToCustomer === true,
            },
          },
        },
      });
    });
    const sent = input.sendToCustomer === true && customerMessage
      ? await sendTelegramStatusMessage({ tenantId, tgId: before.customer.tgId, message: customerMessage })
      : false;
    if (sent) {
      await prisma.orderEvent.updateMany({
        where: { tenantId, orderId: before.id, toStatus: input.status, sentAt: null },
        data: { sentAt: new Date() },
      });
    }
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'order.status_updated',
      entityType: 'Order',
      entityId: before.id,
      metadata: { from: before.fulfillmentStatus, to: input.status, sent },
    });
    return { success: true, orderId: updated.id, sent };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
