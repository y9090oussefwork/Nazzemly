'use server';

import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { approvePaymentRequest } from '@/lib/wallet';
import { getBotInstance } from '@/lib/bot';

/**
 * Submits transaction details for a payment request (called by end-user or bot)
 */
export async function submitManualPayment(
  requestId: string,
  senderIdentifier: string,
  transactionId?: string,
  notes?: string
) {
  try {
    const request = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        senderIdentifier,
        transactionId: transactionId || null,
        notes: notes || 'تم تقديم بيانات الدفع بانتظار المراجعة اليدوية',
        status: 'pending', // Reset/maintain pending status
      },
    });

    return { success: true, request };
  } catch (e: any) {
    console.error('Failed to submit manual payment details:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Gets all pending payment requests for the active merchant tenant
 */
export async function getPendingPayments() {
  try {
    const { tenantId } = await getActiveTenant();

    const requests = await prisma.paymentRequest.findMany({
      where: {
        status: 'pending',
        customer: {
          tenantId,
        },
      },
      include: {
        customer: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { success: true, requests };
  } catch (e: any) {
    console.error('Failed to get pending payments:', e);
    return { success: false, error: e.message, requests: [] };
  }
}

/**
 * Approves a pending payment request manually (credits the wallet balance)
 */
export async function approvePayment(
  requestId: string,
  transactionId: string,
  notes?: string
) {
  try {
    const { tenantId } = await getActiveTenant();

    // Verify request belongs to the tenant
    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: {
        customer: true,
      },
    });

    if (!request || request.customer.tenantId !== tenantId) {
      throw new Error('Payment request not found or access denied');
    }

    const approvedRequest = await approvePaymentRequest(requestId, transactionId, notes || 'تم القبول والتحقق يدوياً بواسطة التاجر');

    // Notify customer on Telegram if connected
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { botSettings: true },
    });

    if (request.customer.tgId && tenant?.botSettings?.botToken && tenant.botSettings.isActive) {
      try {
        const bot = getBotInstance(tenant.botSettings.botToken, tenantId);
        const totalAmount = request.amount + request.fraction;
        const freshCustomer = await prisma.customer.findUnique({
          where: { id: request.customerId },
          select: { walletBalance: true },
        });

        await bot.api.sendMessage(
          request.customer.tgId,
          `✅ **تم تأكيد عملية الدفع يدوياً من قبل التاجر!**\n\n` +
          `💰 رصيد الشحن: *${totalAmount.toFixed(2)} EGP*\n` +
          `💵 رصيد محفظتك الحالي: *${freshCustomer?.walletBalance.toFixed(2)} EGP*\n\n` +
          `شكراً لثقتك بنا! يمكنك الآن البدء بشراء الاشتراكات.`,
          { parse_mode: 'Markdown' }
        );
      } catch (botErr) {
        console.error('Failed to send Telegram manual approval notification:', botErr);
      }
    }

    return { success: true, request: approvedRequest };
  } catch (e: any) {
    console.error('Failed to approve payment manually:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Rejects a pending payment request (e.g. invalid receipt)
 */
export async function rejectPayment(requestId: string, notes?: string) {
  try {
    const { tenantId } = await getActiveTenant();

    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: { customer: true },
    });

    if (!request || request.customer.tenantId !== tenantId) {
      throw new Error('Payment request not found or access denied');
    }

    const updatedRequest = await prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        notes: notes || 'تم رفض العملية - بيانات غير صحيحة أو لم نتوصل بالتحويل',
      },
    });

    // Notify customer on Telegram if connected
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { botSettings: true },
    });

    if (request.customer.tgId && tenant?.botSettings?.botToken && tenant.botSettings.isActive) {
      try {
        const bot = getBotInstance(tenant.botSettings.botToken, tenantId);
        const totalAmount = request.amount + request.fraction;

        await bot.api.sendMessage(
          request.customer.tgId,
          `❌ **تم رفض طلب شحن المحفظة**\n\n` +
          `💰 قيمة الطلب المرفوض: *${totalAmount.toFixed(2)} EGP*\n` +
          `📝 السبب/ملاحظات: *${updatedRequest.notes}*\n\n` +
          `يرجى مراجعة تفاصيل التحويل أو التواصل مع الدعم الفني لحل المشكلة.`,
          { parse_mode: 'Markdown' }
        );
      } catch (botErr) {
        console.error('Failed to send Telegram rejection notification:', botErr);
      }
    }

    return { success: true, request: updatedRequest };
  } catch (e: any) {
    console.error('Failed to reject payment:', e);
    return { success: false, error: e.message };
  }
}
