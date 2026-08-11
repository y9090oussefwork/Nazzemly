'use server';

import { Bot } from 'grammy';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { approvePaymentRequest } from '@/lib/wallet';
import { decryptBotToken } from '@/lib/telegram-manager';
import { cleanText, optionalText } from '@/lib/validation';
import { money } from '@/lib/money';
import { writeAuditLog } from '@/lib/audit';

function paymentDto<T extends {
  amount: unknown;
  fraction: unknown;
  reportedAmount?: unknown | null;
  customer?: { walletBalance: unknown } | null;
}>(request: T) {
  return {
    ...request,
    amount: money(request.amount as never),
    fraction: money(request.fraction as never),
    reportedAmount: request.reportedAmount == null
      ? null
      : money(request.reportedAmount as never),
    customer: request.customer
      ? { ...request.customer, walletBalance: money(request.customer.walletBalance as never) }
      : request.customer,
  };
}

async function notifyCustomer(
  tenantId: string,
  telegramId: string | null,
  message: string,
) {
  if (!telegramId) return;
  try {
    const settings = await prisma.botSettings.findUnique({
      where: { tenantId },
      select: {
        isActive: true,
        botTokenEncrypted: true,
      },
    });
    if (!settings?.isActive || !settings.botTokenEncrypted) return;
    const token = decryptBotToken({ botTokenEncrypted: settings.botTokenEncrypted, botToken: null });
    await new Bot(token).api.sendMessage(telegramId, message);
  } catch (error) {
    console.error('تعذر إرسال إشعار تيليجرام', error);
  }
}

export async function submitManualPayment(
  requestIdInput: string,
  senderIdentifierInput: string,
  transactionIdInput?: string,
  notesInput?: string,
) {
  try {
    const { tenantId, session } = await getActiveTenant('payments');
    const requestId = cleanText(requestIdInput, 'طلب الدفع', 10, 100);
    const senderIdentifier = cleanText(senderIdentifierInput, 'بيانات المرسل', 3, 100);
    const transactionId = optionalText(transactionIdInput, 100);
    const notes = optionalText(notesInput, 1000);

    const updated = await prisma.paymentRequest.updateMany({
      where: {
        id: requestId,
        tenantId: tenantId,
        status: 'pending',
      },
      data: {
        senderIdentifier,
        transactionId,
        notes: notes ?? 'تم تقديم بيانات الدفع وبانتظار المراجعة',
      },
    });
    if (updated.count !== 1) throw new Error('طلب الدفع غير موجود أو تمت معالجته');

    await writeAuditLog({
      tenantId: tenantId,
      userId: session.userId,
      action: 'payment.details_updated',
      entityType: 'PaymentRequest',
      entityId: requestId,
    });
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('submitManualPayment failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث الدفعة' };
  }
}

export async function getPendingPayments() {
  try {
    const { tenantId } = await getActiveTenant('payments');
    const requests = await prisma.paymentRequest.findMany({
      where: {
        tenantId: tenantId,
        status: 'pending',
        notes: { notIn: ['awaiting_transfer', 'awaiting_sender', 'awaiting_amount', 'awaiting_proof'] },
      },
      select: {
        id: true,
        amount: true,
        fraction: true,
        method: true,
        paymentMethodId: true,
        reportedAmount: true,
        senderIdentifier: true,
        transactionId: true,
        notes: true,
        screenshotUrl: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        paymentMethod: {
          select: {
            label: true,
            type: true,
            accountIdentifier: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            tgId: true,
            walletBalance: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { success: true, requests: requests.map(paymentDto) };
  } catch (error) {
    console.error('getPendingPayments failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تحميل المدفوعات',
      requests: [],
    };
  }
}

export async function approvePayment(
  requestIdInput: string,
  transactionIdInput?: string,
  notesInput?: string,
) {
  try {
    const { tenantId, session } = await getActiveTenant('payments');
    const requestId = cleanText(requestIdInput, 'طلب الدفع', 10, 100);
    const transactionId = optionalText(transactionIdInput, 100) ?? undefined;
    const notes = optionalText(notesInput, 1000) ?? undefined;

    const current = await prisma.paymentRequest.findFirst({
      where: { id: requestId, tenantId: tenantId },
      select: {
        customer: { select: { tgId: true } },
      },
    });
    if (!current) throw new Error('طلب الدفع غير موجود');

    const approved = await approvePaymentRequest({
      tenantId: tenantId,
      paymentRequestId: requestId,
      approvedById: session.userId,
      transactionId,
      notes,
    });

    await writeAuditLog({
      tenantId: tenantId,
      userId: session.userId,
      action: 'payment.approved',
      entityType: 'PaymentRequest',
      entityId: requestId,
      metadata: {
        transactionId: transactionId ?? null,
        creditedAmount: money(approved.creditedAmount),
      },
    });

    await notifyCustomer(
      tenantId,
      current.customer.tgId,
      `✅ تم اعتماد دفعتك وشحن ${money(approved.creditedAmount).toFixed(2)} EGP. رصيدك الحالي ${money(approved.walletBalance).toFixed(2)} EGP.`,
    );
    revalidatePath('/dashboard');
    return {
      success: true,
      request: paymentDto(approved.request),
      walletBalance: money(approved.walletBalance),
    };
  } catch (error) {
    console.error('approvePayment failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر اعتماد الدفعة' };
  }
}

export async function rejectPayment(requestIdInput: string, notesInput?: string) {
  try {
    const { tenantId, session } = await getActiveTenant('payments');
    const requestId = cleanText(requestIdInput, 'طلب الدفع', 10, 100);
    const notes = optionalText(notesInput, 1000) ?? 'تم رفض الدفعة بعد المراجعة';

    const request = await prisma.paymentRequest.findFirst({
      where: {
        id: requestId,
        tenantId: tenantId,
        status: 'pending',
      },
      select: {
        id: true,
        amount: true,
        fraction: true,
        customer: { select: { tgId: true } },
      },
    });
    if (!request) throw new Error('طلب الدفع غير موجود أو تمت معالجته');

    const updated = await prisma.paymentRequest.updateMany({
      where: { id: request.id, tenantId: tenantId, status: 'pending' },
      data: {
        status: 'rejected',
        notes,
        processedAt: new Date(),
        approvedById: session.userId,
      },
    });
    if (updated.count !== 1) throw new Error('تمت معالجة الطلب مسبقاً');

    await writeAuditLog({
      tenantId: tenantId,
      userId: session.userId,
      action: 'payment.rejected',
      entityType: 'PaymentRequest',
      entityId: request.id,
      metadata: { notes },
    });
    await notifyCustomer(
      tenantId,
      request.customer.tgId,
      `❌ تعذر اعتماد دفعتك بقيمة ${request.amount.plus(request.fraction).toFixed(2)} EGP. السبب: ${notes}`,
    );
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('rejectPayment failed', error);
    return { success: false, error: error instanceof Error ? error.message : 'تعذر رفض الدفعة' };
  }
}
