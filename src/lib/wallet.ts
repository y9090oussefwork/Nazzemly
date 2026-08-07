import { prisma } from './prisma';

/**
 * Charges the customer's wallet balance
 */
export async function chargeWallet(
  customerId: string,
  amount: number,
  description: string,
  tx?: any
) {
  const client = tx || prisma;
  
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  return await client.$transaction(async (t: any) => {
    // 1. Update customer balance
    const customer = await t.customer.update({
      where: { id: customerId },
      data: {
        walletBalance: {
          increment: amount,
        },
      },
    });

    // 2. Create wallet transaction record
    await t.walletTransaction.create({
      data: {
        customerId,
        amount,
        type: 'deposit',
        description,
      },
    });

    return customer;
  });
}

/**
 * Debits the customer's wallet balance (throws error if insufficient funds)
 */
export async function debitWallet(
  customerId: string,
  amount: number,
  description: string,
  tx?: any
) {
  const client = tx || prisma;

  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  return await client.$transaction(async (t: any) => {
    // 1. Check customer's balance
    const customer = await t.customer.findUnique({
      where: { id: customerId },
      select: { walletBalance: true },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (customer.walletBalance < amount) {
      throw new Error('Insufficient balance');
    }

    // 2. Decrement balance
    const updatedCustomer = await t.customer.update({
      where: { id: customerId },
      data: {
        walletBalance: {
          decrement: amount,
        },
      },
    });

    // 3. Create transaction record
    await t.walletTransaction.create({
      data: {
        customerId,
        amount: -amount,
        type: 'purchase',
        description,
      },
    });

    return updatedCustomer;
  });
}

/**
 * Generates a unique fractional amount for a payment request
 * to match incoming transactions. Matches within a 15-minute window.
 */
export async function generateUniqueFraction(amount: number): Promise<number> {
  const timeWindow = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago

  // Get all active pending requests for the same base amount in the last 15 minutes
  const activeRequests = await prisma.paymentRequest.findMany({
    where: {
      amount,
      status: 'pending',
      createdAt: {
        gte: timeWindow,
      },
    },
    select: {
      fraction: true,
    },
  });

  const occupiedFractions = new Set(activeRequests.map((r) => Math.round(r.fraction * 100)));

  // Try to find an unoccupied fraction from 0.01 to 0.99
  let fractionInt = 1;
  for (let i = 1; i <= 99; i++) {
    const randomFraction = Math.floor(Math.random() * 99) + 1; // Randomize order a bit
    if (!occupiedFractions.has(randomFraction)) {
      fractionInt = randomFraction;
      break;
    }
  }

  return fractionInt / 100;
}

/**
 * Creates a new payment request with a unique fraction
 */
export async function createPaymentRequest(
  customerId: string,
  amount: number,
  method: 'vodafone_cash' | 'instapay',
  senderIdentifier?: string
) {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const fraction = await generateUniqueFraction(amount);

  return await prisma.paymentRequest.create({
    data: {
      customerId,
      amount,
      fraction,
      method,
      senderIdentifier,
      status: 'pending',
    },
  });
}

/**
 * Approves a payment request manually or automatically
 */
export async function approvePaymentRequest(
  paymentRequestId: string,
  transactionId?: string,
  notes?: string
) {
  return await prisma.$transaction(async (t) => {
    // 1. Get payment request
    const request = await t.paymentRequest.findUnique({
      where: { id: paymentRequestId },
      include: { customer: true },
    });

    if (!request) {
      throw new Error('Payment request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Payment request is already ${request.status}`);
    }

    const totalCredit = request.amount + request.fraction;

    // 2. Update payment request status
    const updatedRequest = await t.paymentRequest.update({
      where: { id: paymentRequestId },
      data: {
        status: 'approved',
        transactionId: transactionId || request.transactionId,
        notes: notes || 'تم القبول والشحن بنجاح',
      },
    });

    // 3. Increment customer wallet balance
    await t.customer.update({
      where: { id: request.customerId },
      data: {
        walletBalance: {
          increment: totalCredit,
        },
      },
    });

    // 4. Create wallet transaction ledger entry
    await t.walletTransaction.create({
      data: {
        customerId: request.customerId,
        amount: totalCredit,
        type: 'deposit',
        description: `شحن رصيد تلقائي (${request.method === 'instapay' ? 'إنستا باي' : 'فودافون كاش'}) بقيمة ${totalCredit} EGP`,
      },
    });

    return updatedRequest;
  });
}
