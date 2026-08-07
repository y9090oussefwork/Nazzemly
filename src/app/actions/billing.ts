'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth, hashPassword } from '@/lib/session';

const PLAN_PRICES: Record<string, number> = {
  basic: 150.0,
  premium: 300.0,
};

/**
 * Changes password of the currently logged in merchant staff user
 */
export async function changeMerchantPassword(newPasswordInput: string) {
  try {
    const session = await requireAuth();
    const hashedPassword = hashPassword(newPasswordInput);

    await prisma.user.update({
      where: { id: session.userId },
      data: { password: hashedPassword }
    });

    return { success: true };
  } catch (e: any) {
    console.error('Failed to change password:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Submits a payment request to the Super Admin to recharge the store balance
 */
export async function requestSaaSRecharge(amount: number, method: 'vodafone_cash' | 'instapay', senderIdentifier: string) {
  try {
    const session = await requireAuth();

    if (amount <= 0) {
      throw new Error('يجب أن تكون القيمة موجبة');
    }

    const request = await prisma.saaSPaymentRequest.create({
      data: {
        tenantId: session.tenantId,
        amount,
        method,
        senderIdentifier,
        status: 'pending',
        notes: 'بانتظار مراجعة وقبول المشرف العام'
      }
    });

    return { success: true, request };
  } catch (e: any) {
    console.error('Failed to request SaaS recharge:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Renews the merchant's store subscription for 30 days using their SaaS platform balance
 */
export async function renewSaaSPlan() {
  try {
    const session = await requireAuth();

    const result = await prisma.$transaction(async (t) => {
      // 1. Fetch current Tenant status
      const tenant = await t.tenant.findUnique({
        where: { id: session.tenantId }
      });

      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Check current plan price
      const plan = tenant.saasPlan === 'free_trial' ? 'basic' : tenant.saasPlan;
      const price = PLAN_PRICES[plan] || 150.0;

      if (tenant.saasBalance < price) {
        throw new Error(`رصيدك غير كافٍ. سعر الباقة (${plan}) هو ${price} EGP. رصيدك الحالي هو ${tenant.saasBalance} EGP.`);
      }

      // Calculate new expiry date
      let newExpiry = new Date();
      if (tenant.saasExpiry && tenant.saasExpiry > new Date()) {
        // If still active, extend from current expiry date
        newExpiry = new Date(tenant.saasExpiry);
      }
      newExpiry.setDate(newExpiry.getDate() + 30); // Add 30 days

      // Update tenant
      const updatedTenant = await t.tenant.update({
        where: { id: session.tenantId },
        data: {
          saasBalance: {
            decrement: price
          },
          saasPlan: plan,
          saasExpiry: newExpiry,
          saasStatus: 'active'
        }
      });

      return updatedTenant;
    });

    return { success: true, tenant: result };
  } catch (e: any) {
    console.error('Failed to renew SaaS plan:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Gets all previous payment requests submitted by the active merchant
 */
export async function getMySaaSPayments() {
  try {
    const session = await requireAuth();

    const requests = await prisma.saaSPaymentRequest.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: 'desc' }
    });

    return { success: true, requests };
  } catch (e: any) {
    console.error('Failed to get my SaaS payments:', e);
    return { success: false, error: e.message, requests: [] };
  }
}
