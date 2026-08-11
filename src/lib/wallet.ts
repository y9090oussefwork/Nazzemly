import 'server-only';

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePositiveMoney } from "@/lib/money";

type DbTransaction = Prisma.TransactionClient;

function decimalAmount(value: unknown) {
  return new Prisma.Decimal(requirePositiveMoney(value));
}

function decimalNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

async function creditInTransaction(
  tx: DbTransaction,
  input: {
    tenantId: string;
    customerId: string;
    amount: unknown;
    description: string;
    type?: string;
    createdById?: string;
    idempotencyKey?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const amount = decimalAmount(input.amount);
  const customer = await tx.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new Error("العميل غير موجود");

  const updated = await tx.customer.update({
    where: { id: customer.id },
    data: { walletBalance: { increment: amount } },
    select: { id: true, walletBalance: true },
  });

  await tx.walletTransaction.create({
    data: {
      tenantId: input.tenantId,
      customerId: customer.id,
      createdById: input.createdById,
      amount,
      balanceAfter: updated.walletBalance,
      type: input.type ?? "deposit",
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    },
  });
  return updated;
}

async function debitInTransaction(
  tx: DbTransaction,
  input: {
    tenantId: string;
    customerId: string;
    amount: unknown;
    description: string;
    type?: string;
    createdById?: string;
    idempotencyKey?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const amount = decimalAmount(input.amount);
  const changed = await tx.customer.updateMany({
    where: {
      id: input.customerId,
      tenantId: input.tenantId,
      deletedAt: null,
      walletBalance: { gte: amount },
    },
    data: { walletBalance: { decrement: amount } },
  });

  if (changed.count !== 1) {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new Error("العميل غير موجود");
    throw new Error("الرصيد غير كافٍ");
  }

  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: input.customerId },
    select: { id: true, walletBalance: true },
  });

  await tx.walletTransaction.create({
    data: {
      tenantId: input.tenantId,
      customerId: customer.id,
      createdById: input.createdById,
      amount: amount.negated(),
      balanceAfter: customer.walletBalance,
      type: input.type ?? "purchase",
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    },
  });
  return customer;
}

export async function creditWallet(input: {
  tenantId: string;
  customerId: string;
  amount: unknown;
  description: string;
  type?: string;
  createdById?: string;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction((tx) => creditInTransaction(tx, input), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function debitWallet(input: {
  tenantId: string;
  customerId: string;
  amount: unknown;
  description: string;
  type?: string;
  createdById?: string;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction((tx) => debitInTransaction(tx, input), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function createPaymentRequest(input: {
  tenantId: string;
  customerId: string;
  amount: unknown;
  method: string;
  paymentMethodId?: string;
  senderIdentifier?: string;
}) {
  const amount = decimalAmount(input.amount);
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new Error("العميل غير موجود");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const used = await prisma.paymentRequest.findMany({
    where: {
      tenantId: input.tenantId,
      amount,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { fraction: true },
  });
  const occupied = new Set(used.map((item) => Math.round(decimalNumber(item.fraction) * 100)));

  const start = Math.floor(Math.random() * 99) + 1;
  for (let offset = 0; offset < 99; offset += 1) {
    const candidate = ((start + offset - 1) % 99) + 1;
    if (occupied.has(candidate)) continue;
    try {
      return await prisma.paymentRequest.create({
        data: {
          tenantId: input.tenantId,
          customerId: customer.id,
          amount,
          fraction: new Prisma.Decimal(candidate).dividedBy(100),
          method: input.method,
          paymentMethodId: input.paymentMethodId,
          senderIdentifier: input.senderIdentifier,
          expiresAt,
          status: "pending",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("لا يوجد رقم دفع متاح الآن، حاول بعد دقائق");
}

export async function approvePaymentRequest(input: {
  tenantId: string;
  paymentRequestId: string;
  approvedById?: string;
  transactionId?: string;
  notes?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const request = await tx.paymentRequest.findFirst({
        where: { id: input.paymentRequestId, tenantId: input.tenantId },
        select: {
          id: true,
          customerId: true,
          amount: true,
          fraction: true,
          method: true,
          status: true,
          transactionId: true,
        },
      });
      if (!request) throw new Error("طلب الدفع غير موجود");

      const credit = request.amount.plus(request.fraction);
      const idempotencyKey = `payment:${request.id}`;
      const existingCredit = await tx.walletTransaction.findUnique({
        where: { idempotencyKey },
        select: { customerId: true, tenantId: true, amount: true, type: true },
      });

      // قد تكون محاولة قديمة سجلت حركة المحفظة ثم تعطلت قبل تغيير حالة الطلب.
      // نتحقق من التطابق أولاً ثم نعتمد الطلب بدون إضافة رصيد للمرة الثانية.
      if (existingCredit) {
        if (
          existingCredit.tenantId !== input.tenantId ||
          existingCredit.customerId !== request.customerId ||
          existingCredit.type !== 'payment' ||
          !existingCredit.amount.equals(credit)
        ) {
          throw new Error("يوجد تعارض في السجل المالي لهذا الطلب. راجع الدعم قبل الاعتماد.");
        }
        if (request.status !== 'pending' && request.status !== 'approved') {
          throw new Error("حالة طلب الدفع لا تسمح باعتماده.");
        }
        const updatedRequest = request.status === 'pending'
          ? await tx.paymentRequest.update({
              where: { id: request.id },
              data: {
                status: 'approved',
                approvedById: input.approvedById,
                transactionId: input.transactionId ?? request.transactionId,
                notes: input.notes ?? 'تمت استعادة اعتماد الدفعة من السجل المالي الموجود',
                processedAt: new Date(),
              },
            })
          : await tx.paymentRequest.findUniqueOrThrow({ where: { id: request.id } });
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: request.customerId },
          select: { walletBalance: true },
        });
        return { request: updatedRequest, walletBalance: customer.walletBalance, creditedAmount: credit, recovered: true };
      }

      if (request.status !== "pending") throw new Error("تمت معالجة الطلب مسبقاً");

      const claimed = await tx.paymentRequest.updateMany({
        where: { id: request.id, tenantId: input.tenantId, status: "pending" },
        data: {
          status: "approved",
          approvedById: input.approvedById,
          transactionId: input.transactionId ?? request.transactionId,
          notes: input.notes ?? "تم التحقق من الدفعة وشحن المحفظة",
          processedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new Error("تمت معالجة الطلب مسبقاً");

      const customer = await creditInTransaction(tx, {
        tenantId: input.tenantId,
        customerId: request.customerId,
        amount: credit,
        description: `شحن محفظة عبر ${request.method}`,
        type: "payment",
        createdById: input.approvedById,
        idempotencyKey,
        metadata: {
          paymentRequestId: request.id,
          transactionId: input.transactionId ?? request.transactionId ?? undefined,
        },
      });

      const updatedRequest = await tx.paymentRequest.findUniqueOrThrow({ where: { id: request.id } });
      return { request: updatedRequest, walletBalance: customer.walletBalance, creditedAmount: credit };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export const walletTransactionHelpers = { creditInTransaction, debitInTransaction };
