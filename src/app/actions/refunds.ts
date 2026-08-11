'use server';

import { Bot } from 'grammy';
import { Prisma } from '@/generated/prisma/client';
import { writeAuditLog } from '@/lib/audit';
import { money, requirePositiveMoney } from '@/lib/money';
import { prisma } from '@/lib/prisma';
import { decryptBotToken } from '@/lib/telegram-manager';
import { getActiveTenant } from '@/lib/tenant';
import { walletTransactionHelpers } from '@/lib/wallet';

const REFUND_METHODS = ['wallet', 'manual'] as const;

type RefundMethod = (typeof REFUND_METHODS)[number];

function asId(value: unknown, label: string) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 100) throw new Error(`${label} غير صحيح.`);
  return id;
}

function asReason(value: unknown) {
  const reason = String(value ?? '').trim();
  if (reason.length > 1000) throw new Error('سبب العملية أطول من المسموح.');
  return reason || 'بدون ملاحظة إضافية';
}

function asAmount(value: unknown) {
  return new Prisma.Decimal(requirePositiveMoney(value));
}

function totalRecorded(events: Array<{ metadata: Prisma.JsonValue | null }>, type: string) {
  return events
    .filter((event) => {
      const metadata = event.metadata;
      return metadata && typeof metadata === 'object' && !Array.isArray(metadata) && (metadata as Record<string, unknown>).kind === type;
    })
    .reduce((total, event) => {
      const metadata = event.metadata as Record<string, unknown>;
      const amount = Number(metadata.amount);
      return Number.isFinite(amount) ? total.plus(amount) : total;
    }, new Prisma.Decimal(0));
}

async function notifyCustomer(tenantId: string, tgId: string | null, message: string) {
  if (!tgId) return false;
  const settings = await prisma.botSettings.findUnique({ where: { tenantId }, select: { isActive: true, botTokenEncrypted: true, botToken: true } });
  if (!settings?.isActive || !settings.botTokenEncrypted) return false;
  try {
    await new Bot(decryptBotToken(settings as Parameters<typeof decryptBotToken>[0])).api.sendMessage(tgId, message);
    return true;
  } catch {
    return false;
  }
}

export async function cancelOrderAndRefund(input: {
  orderId: string;
  amount: unknown;
  reason?: string;
  method: RefundMethod;
  sendToCustomer?: boolean;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const orderId = asId(input.orderId, 'الطلب');
    const amount = asAmount(input.amount);
    const reason = asReason(input.reason);
    if (!REFUND_METHODS.includes(input.method)) throw new Error('طريقة الاسترداد غير صحيحة.');

    const outcome = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId },
        select: {
          id: true, orderNo: true, amount: true, customerId: true, subscriptionId: true, fulfillmentStatus: true,
          customer: { select: { name: true, tgId: true } },
          service: { select: { name: true } },
          events: { where: { type: 'refund_recorded' }, select: { metadata: true } },
        },
      });
      if (!order) throw new Error('الطلب غير موجود.');
      if (order.fulfillmentStatus === 'cancelled') throw new Error('هذا الطلب ملغي بالفعل.');

      const alreadyRefunded = totalRecorded(order.events, 'refund');
      const remaining = new Prisma.Decimal(order.amount).minus(alreadyRefunded);
      if (amount.greaterThan(remaining)) throw new Error(`المبلغ أكبر من المتبقي للاسترداد (${money(remaining).toFixed(2)}).`);
      const totalAfter = alreadyRefunded.plus(amount);
      const fullyRefunded = totalAfter.greaterThanOrEqualTo(order.amount);

      if (input.method === 'wallet') {
        await walletTransactionHelpers.creditInTransaction(tx, {
          tenantId,
          customerId: order.customerId,
          amount,
          type: 'refund',
          description: `استرداد طلب ${order.orderNo}: ${reason}`,
          createdById: session.userId,
          idempotencyKey: `refund:${order.id}:${totalAfter.toFixed(2)}`,
          metadata: { orderId: order.id, orderNo: order.orderNo, reason },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          fulfillmentStatus: 'cancelled',
          paymentStatus: fullyRefunded ? 'refunded' : 'partially_refunded',
          cancelledAt: new Date(),
          events: {
            create: {
              tenantId,
              actorId: session.userId,
              type: 'refund_recorded',
              fromStatus: order.fulfillmentStatus,
              toStatus: 'cancelled',
              message: input.method === 'wallet'
                ? `تم إلغاء الطلب وإعادة ${money(amount).toFixed(2)} إلى محفظة العميل. ${reason}`
                : `تم إلغاء الطلب وتسجيل رد خارجي بقيمة ${money(amount).toFixed(2)}. ${reason}`,
              isCustomerVisible: input.sendToCustomer === true,
              metadata: { kind: 'refund', amount: Number(amount), method: input.method, reason },
            },
          },
        },
      });
      if (order.subscriptionId) {
        await tx.subscription.updateMany({ where: { id: order.subscriptionId, tenantId }, data: { status: 'cancelled', notes: `تم الإلغاء والاسترداد: ${reason}` } });
      }
      return { customer: order.customer, serviceName: order.service.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const sent = input.sendToCustomer === true
      ? await notifyCustomer(tenantId, outcome.customer.tgId, `تم إلغاء اشتراك ${outcome.serviceName}. ${input.method === 'wallet' ? `أُعيد ${money(amount).toFixed(2)} إلى محفظتك.` : `سجّل المتجر استرداداً بقيمة ${money(amount).toFixed(2)}، تواصل مع الدعم إذا احتجت التفاصيل.`}`)
      : false;
    await writeAuditLog({ tenantId, userId: session.userId, action: 'order.refunded', entityType: 'Order', entityId: orderId, metadata: { amount: Number(amount), method: input.method, reason, sent } });
    return { success: true, sent };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تنفيذ الاسترداد.' };
  }
}

export async function compensateOrderCustomer(input: {
  orderId: string;
  amount: unknown;
  reason?: string;
  sendToCustomer?: boolean;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const orderId = asId(input.orderId, 'الطلب');
    const amount = asAmount(input.amount);
    const reason = asReason(input.reason);

    const outcome = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId },
        select: { id: true, orderNo: true, amount: true, customerId: true, fulfillmentStatus: true, customer: { select: { tgId: true } }, service: { select: { name: true } }, events: { where: { type: 'compensation_recorded' }, select: { metadata: true } } },
      });
      if (!order) throw new Error('الطلب غير موجود.');
      if (order.fulfillmentStatus === 'cancelled') throw new Error('لا يمكن تعويض طلب ملغي، استخدم الاسترداد بدلاً من ذلك.');
      const previous = totalRecorded(order.events, 'compensation');
      const remaining = new Prisma.Decimal(order.amount).minus(previous);
      if (amount.greaterThan(remaining)) throw new Error(`التعويض أكبر من قيمة الطلب المتبقية (${money(remaining).toFixed(2)}).`);
      await walletTransactionHelpers.creditInTransaction(tx, {
        tenantId,
        customerId: order.customerId,
        amount,
        type: 'compensation',
        description: `تعويض عن طلب ${order.orderNo}: ${reason}`,
        createdById: session.userId,
        idempotencyKey: `compensation:${order.id}:${previous.plus(amount).toFixed(2)}`,
        metadata: { orderId: order.id, orderNo: order.orderNo, reason },
      });
      await tx.orderEvent.create({
        data: {
          tenantId, orderId: order.id, actorId: session.userId, type: 'compensation_recorded',
          message: `تم إضافة تعويض ${money(amount).toFixed(2)} إلى محفظة العميل. ${reason}`,
          isCustomerVisible: input.sendToCustomer === true,
          metadata: { kind: 'compensation', amount: Number(amount), reason },
        },
      });
      return { customer: order.customer, serviceName: order.service.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const sent = input.sendToCustomer === true
      ? await notifyCustomer(tenantId, outcome.customer.tgId, `تم إضافة تعويض بقيمة ${money(amount).toFixed(2)} إلى محفظتك عن خدمة ${outcome.serviceName}.`)
      : false;
    await writeAuditLog({ tenantId, userId: session.userId, action: 'order.compensated', entityType: 'Order', entityId: orderId, metadata: { amount: Number(amount), reason, sent } });
    return { success: true, sent };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إضافة التعويض.' };
  }
}
export async function cancelStandaloneSubscriptionAndRefund(input: {
  subscriptionId: string;
  amount: unknown;
  reason?: string;
  sendToCustomer?: boolean;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('subscriptions');
    const subscriptionId = asId(input.subscriptionId, 'الاشتراك');
    const amount = asAmount(input.amount);
    const reason = asReason(input.reason);
    const outcome = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: { id: subscriptionId, tenantId },
        select: {
          id: true, orderNo: true, customerId: true, sellingPrice: true, status: true, notes: true,
          order: { select: { id: true } }, service: { select: { name: true } },
          customer: { select: { tgId: true, walletTransactions: { where: { type: 'subscription_refund' }, select: { metadata: true } } } },
        },
      });
      if (!subscription) throw new Error('الاشتراك غير موجود.');
      if (subscription.order) throw new Error('هذا الاشتراك مرتبط بطلب. افتح الطلب من صفحة الطلبات لتنفيذ الاسترداد كاملاً.');
      if (subscription.status === 'cancelled') throw new Error('هذا الاشتراك ملغي بالفعل.');
      const prior = subscription.customer.walletTransactions.reduce((total, item) => {
        const metadata = item.metadata;
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return total;
        const row = metadata as Record<string, unknown>;
        return row.subscriptionId === subscription.id && Number.isFinite(Number(row.amount)) ? total.plus(Number(row.amount)) : total;
      }, new Prisma.Decimal(0));
      const remaining = new Prisma.Decimal(subscription.sellingPrice).minus(prior);
      if (amount.greaterThan(remaining)) throw new Error(`المبلغ أكبر من المتبقي للاسترداد (${money(remaining).toFixed(2)}).`);
      await walletTransactionHelpers.creditInTransaction(tx, {
        tenantId, customerId: subscription.customerId, amount, type: 'subscription_refund', createdById: session.userId,
        description: `استرداد اشتراك ${subscription.orderNo || subscription.service.name}: ${reason}`,
        idempotencyKey: `subscription-refund:${subscription.id}:${prior.plus(amount).toFixed(2)}`,
        metadata: { subscriptionId: subscription.id, amount: Number(amount), reason },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: 'cancelled', notes: `${subscription.notes ? `${subscription.notes}\n` : ''}تم الإلغاء والاسترداد بقيمة ${money(amount).toFixed(2)}: ${reason}` },
      });
      await tx.customerActivity.create({ data: { tenantId, customerId: subscription.customerId, type: 'subscription_refund', title: 'إلغاء واسترداد اشتراك', details: `${subscription.service.name} | ${money(amount).toFixed(2)}`, metadata: { subscriptionId: subscription.id, amount: Number(amount), reason } } });
      return { tgId: subscription.customer.tgId, serviceName: subscription.service.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const sent = input.sendToCustomer === true ? await notifyCustomer(tenantId, outcome.tgId, `تم إلغاء اشتراك ${outcome.serviceName} وإعادة ${money(amount).toFixed(2)} إلى محفظتك.`) : false;
    await writeAuditLog({ tenantId, userId: session.userId, action: 'subscription.refunded', entityType: 'Subscription', entityId: subscriptionId, metadata: { amount: Number(amount), reason, sent } });
    return { success: true, sent };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إلغاء الاشتراك واسترداد قيمته.' };
  }
}