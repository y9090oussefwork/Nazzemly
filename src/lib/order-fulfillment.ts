import 'server-only';

import crypto from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { decryptSecret, encryptSecret } from './security';

export const FULFILLMENT_MODES = ['manual_contact', 'auto_delivery', 'customer_data'] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export type RequiredCustomerField = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'password';
  required: boolean;
};

export type FulfillmentStatusTemplate = {
  key: string;
  label: string;
  message: string;
  final?: boolean;
};

export const DEFAULT_STATUS_TEMPLATES: FulfillmentStatusTemplate[] = [
  {
    key: 'awaiting_contact',
    label: 'بانتظار تواصل الدعم',
    message: 'تم استلام طلبك بنجاح. سيتواصل معك فريق الدعم لإتمام التفعيل.',
  },
  {
    key: 'awaiting_customer_data',
    label: 'بانتظار بيانات العميل',
    message: 'تم استلام طلبك. أرسل البيانات المطلوبة لإكمال التفعيل.',
  },
  {
    key: 'activation_in_progress',
    label: 'جاري التفعيل',
    message: 'بدأ فريق الدعم تنفيذ طلبك، وسيصلك تحديث فور اكتمال التفعيل.',
  },
  {
    key: 'invitation_sent',
    label: 'تم إرسال الدعوة',
    message: 'تم إرسال دعوة التفعيل إلى بريدك الإلكتروني. برجاء فتح البريد وقبول الدعوة.',
  },
  {
    key: 'fulfilled',
    label: 'تم التفعيل',
    message: 'تم تفعيل اشتراكك بنجاح. نتمنى لك تجربة ممتازة.',
    final: true,
  },
  {
    key: 'cancelled',
    label: 'ملغي',
    message: 'تم إلغاء الطلب. تواصل مع الدعم إذا كنت تحتاج إلى مساعدة.',
    final: true,
  },
];

type TransactionClient = Prisma.TransactionClient;

type FulfillmentPlan = {
  id: string;
  tenantId: string;
  serviceId: string;
  name: string;
  durationDays: number;
  price: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  trackInventory: boolean;
  stockQuantity: number;
  fulfillmentMode: string;
  requiredCustomerFields: Prisma.JsonValue | null;
  statusTemplates: Prisma.JsonValue | null;
  purchaseMessage: string | null;
  warrantyType: string;
  warrantyDays: number | null;
  service: { name: string };
};

export function normalizeRequiredFields(value: unknown): RequiredCustomerField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => {
      const label = String(item.label ?? '').trim().slice(0, 80);
      const rawKey = String(item.key ?? label ?? `field_${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
      const type = ['email', 'phone', 'password'].includes(String(item.type))
        ? (String(item.type) as RequiredCustomerField['type'])
        : 'text';
      return {
        key: rawKey || `field_${index + 1}`,
        label,
        type,
        required: item.required !== false,
      };
    })
    .filter((item) => item.label)
    .slice(0, 12);
}

export function normalizeStatusTemplates(value: unknown): FulfillmentStatusTemplate[] {
  if (!Array.isArray(value)) return DEFAULT_STATUS_TEMPLATES;
  const parsed = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item, index) => ({
      key: String(item.key ?? `custom_${index + 1}`).trim().slice(0, 60),
      label: String(item.label ?? '').trim().slice(0, 80),
      message: String(item.message ?? '').trim().slice(0, 1500),
      final: item.final === true,
    }))
    .filter((item) => item.key && item.label);
  return parsed.length ? parsed : DEFAULT_STATUS_TEMPLATES;
}

export function renderOrderMessage(
  message: string,
  input: { customerName: string; serviceName: string; planName?: string | null; orderNo: string },
) {
  return message
    .replaceAll('{اسم_العميل}', input.customerName)
    .replaceAll('{الخدمة}', input.serviceName)
    .replaceAll('{الخطة}', input.planName || '')
    .replaceAll('{رقم_الطلب}', input.orderNo);
}

function createOrderNo() {
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  return `ORD-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function warrantyEndsAt(plan: FulfillmentPlan, startDate: Date, subscriptionEndsAt: Date) {
  if (plan.warrantyType === 'subscription_duration') return subscriptionEndsAt;
  if (plan.warrantyType === 'fixed_days' && plan.warrantyDays && plan.warrantyDays > 0) {
    return addDays(startDate, plan.warrantyDays);
  }
  return null;
}

async function reserveTrackedStock(tx: TransactionClient, plan: FulfillmentPlan) {
  if (!plan.trackInventory) return;
  const reserved = await tx.servicePlan.updateMany({
    where: { id: plan.id, tenantId: plan.tenantId, stockQuantity: { gt: 0 } },
    data: { stockQuantity: { decrement: 1 } },
  });
  if (reserved.count !== 1) throw new Error('نفد المخزون الآن. يمكنك تسجيل اهتمامك ليصلك إشعار عند التوفر.');
}

async function claimDeliveryUnit(tx: TransactionClient, plan: FulfillmentPlan) {
  const candidates = await tx.accountPool.findMany({
    where: {
      tenantId: plan.tenantId,
      serviceId: plan.serviceId,
      status: 'available',
      OR: [{ servicePlanId: plan.id }, { servicePlanId: null }],
    },
    orderBy: [{ servicePlanId: 'desc' }, { createdAt: 'asc' }],
    take: 50,
  });

  for (const candidate of candidates) {
    if (candidate.deliveredCount >= candidate.capacity) continue;
    const claimed = await tx.accountPool.updateMany({
      where: {
        id: candidate.id,
        tenantId: plan.tenantId,
        status: 'available',
        deliveredCount: candidate.deliveredCount,
      },
      data: {
        deliveredCount: { increment: 1 },
        isUsed: candidate.deliveredCount + 1 >= candidate.capacity,
        usedAt: candidate.usedAt || new Date(),
      },
    });
    if (claimed.count === 1) return candidate;
  }
  throw new Error('لا توجد بيانات تسليم متاحة لهذه الخطة الآن.');
}

export async function createPaidOrderInTransaction(
  tx: TransactionClient,
  input: {
    tenantId: string;
    customerId: string;
    plan: FulfillmentPlan;
    source: 'telegram_bot' | 'dashboard' | 'customer_portal';
  },
) {
  const { plan } = input;
  const mode = FULFILLMENT_MODES.includes(plan.fulfillmentMode as FulfillmentMode)
    ? (plan.fulfillmentMode as FulfillmentMode)
    : 'manual_contact';
  const requiredFields = normalizeRequiredFields(plan.requiredCustomerFields);

  await reserveTrackedStock(tx, plan);
  const initialStatus =
    mode === 'auto_delivery'
      ? 'processing_delivery'
      : mode === 'customer_data' && requiredFields.length
        ? 'awaiting_customer_data'
        : 'awaiting_contact';
  const order = await tx.order.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      serviceId: plan.serviceId,
      servicePlanId: plan.id,
      orderNo: createOrderNo(),
      source: input.source,
      paymentStatus: 'paid',
      fulfillmentStatus: initialStatus,
      amount: plan.price,
      costPrice: plan.costPrice,
      warrantyType: plan.warrantyType,
      events: {
        create: {
          tenantId: input.tenantId,
          type: 'order_created',
          toStatus: initialStatus,
          isCustomerVisible: true,
        },
      },
    },
  });

  if (mode !== 'auto_delivery') {
    if (initialStatus === 'awaiting_customer_data') {
      await tx.botFlowSession.upsert({
        where: { tenantId_customerId: { tenantId: input.tenantId, customerId: input.customerId } },
        update: {
          orderId: order.id,
          flow: 'order_customer_data',
          step: 0,
          dataEncrypted: encryptSecret('{}'),
          expiresAt: addDays(new Date(), 2),
        },
        create: {
          tenantId: input.tenantId,
          customerId: input.customerId,
          orderId: order.id,
          flow: 'order_customer_data',
          step: 0,
          dataEncrypted: encryptSecret('{}'),
          expiresAt: addDays(new Date(), 2),
        },
      });
    }
    return { order, subscription: null, delivery: null, requiredFields, mode };
  }

  const delivery = await claimDeliveryUnit(tx, plan);
  const startDate = new Date();
  const endDate = addDays(startDate, plan.durationDays);
  const subscription = await tx.subscription.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      serviceId: plan.serviceId,
      servicePlanId: plan.id,
      orderNo: order.orderNo,
      package: plan.name,
      startDate,
      endDate,
      sellingPrice: plan.price,
      priceBeforeDiscount: plan.price,
      costPrice: plan.costPrice,
      status: 'active',
      notes: 'تسليم تلقائي عبر البوت',
      createdBy: input.source,
    },
  });
  const warrantyEnd = warrantyEndsAt(plan, startDate, endDate);
  await tx.deliveryAllocation.create({
    data: {
      tenantId: input.tenantId,
      accountPoolId: delivery.id,
      orderId: order.id,
      customerId: input.customerId,
      subscriptionId: subscription.id,
    },
  });
  const completedOrder = await tx.order.update({
    where: { id: order.id },
    data: {
      subscriptionId: subscription.id,
      fulfillmentStatus: 'fulfilled',
      warrantyEndsAt: warrantyEnd,
      completedAt: new Date(),
      events: {
        create: {
          tenantId: input.tenantId,
          type: 'auto_delivery_completed',
          fromStatus: initialStatus,
          toStatus: 'fulfilled',
          isCustomerVisible: true,
        },
      },
    },
  });
  const credentials = delivery.credentialsEncrypted
    ? decryptSecret(delivery.credentialsEncrypted)
    : delivery.credentials;
  return { order: completedOrder, subscription, delivery: { ...delivery, credentials }, requiredFields, mode };
}

export async function captureNextOrderField(
  tx: TransactionClient,
  input: { tenantId: string; customerId: string; value: string },
) {
  const session = await tx.botFlowSession.findFirst({
    where: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      flow: 'order_customer_data',
      expiresAt: { gt: new Date() },
    },
    include: { order: { include: { servicePlan: true } } },
  });
  if (!session?.order?.servicePlan) return null;
  const fields = normalizeRequiredFields(session.order.servicePlan.requiredCustomerFields);
  const field = fields[session.step];
  if (!field) return null;
  const value = input.value.trim().slice(0, 2000);
  if (!value && field.required) throw new Error(`${field.label} مطلوب`);
  if (field.type === 'email' && !/^\S+@\S+\.\S+$/.test(value)) throw new Error('اكتب بريدًا إلكترونيًا صحيحًا');
  if (field.type === 'phone' && value.replace(/\D/g, '').length < 8) throw new Error('اكتب رقم هاتف صحيحًا');

  await tx.orderInputValue.upsert({
    where: { orderId_fieldKey: { orderId: session.order.id, fieldKey: field.key } },
    update: { label: field.label, valueEncrypted: encryptSecret(value) },
    create: {
      tenantId: input.tenantId,
      orderId: session.order.id,
      fieldKey: field.key,
      label: field.label,
      valueEncrypted: encryptSecret(value),
    },
  });
  const nextStep = session.step + 1;
  const nextField = fields[nextStep];
  if (nextField) {
    await tx.botFlowSession.update({ where: { id: session.id }, data: { step: nextStep } });
    return { completed: false, orderId: session.order.id, field: nextField };
  }
  await tx.order.update({
    where: { id: session.order.id },
    data: {
      fulfillmentStatus: 'activation_in_progress',
      events: {
        create: {
          tenantId: input.tenantId,
          type: 'customer_data_completed',
          fromStatus: 'awaiting_customer_data',
          toStatus: 'activation_in_progress',
          isCustomerVisible: true,
        },
      },
    },
  });
  await tx.botFlowSession.delete({ where: { id: session.id } });
  return { completed: true, orderId: session.order.id, field: null };
}

export function decryptOrderInputValue(valueEncrypted: string) {
  return decryptSecret(valueEncrypted);
}

