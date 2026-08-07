'use server';

import { prisma } from '@/lib/prisma';
import { requireSuperAdmin, hashPassword } from '@/lib/session';

/**
 * Gets aggregated SaaS platform statistics for the Super Admin
 */
export async function getSystemStats() {
  await requireSuperAdmin();

  try {
    const totalMerchants = await prisma.tenant.count({
      where: { id: { not: 'system_tenant' } }
    });

    const activeMerchants = await prisma.tenant.count({
      where: { id: { not: 'system_tenant' }, saasStatus: 'active' }
    });

    const expiredMerchants = await prisma.tenant.count({
      where: { id: { not: 'system_tenant' }, saasStatus: 'expired' }
    });

    // Sum of all approved payments from merchants
    const revenueRaw = await prisma.saaSPaymentRequest.aggregate({
      where: { status: 'approved' },
      _sum: { amount: true }
    });
    const totalPlatformRevenue = revenueRaw._sum.amount || 0;

    const pendingRequests = await prisma.saaSPaymentRequest.count({
      where: { status: 'pending' }
    });

    return {
      success: true,
      stats: {
        totalMerchants,
        activeMerchants,
        expiredMerchants,
        totalPlatformRevenue,
        pendingRequests
      }
    };
  } catch (e: any) {
    console.error('Failed to get system stats:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Gets all merchants and their SaaS subscription details
 */
export async function getMerchants() {
  await requireSuperAdmin();

  try {
    const merchants = await prisma.tenant.findMany({
      where: { id: { not: 'system_tenant' } },
      include: {
        users: {
          select: { username: true }
        },
        _count: {
          select: { customers: true, subscriptions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return { success: true, merchants };
  } catch (e: any) {
    console.error('Failed to get merchants:', e);
    return { success: false, error: e.message, merchants: [] };
  }
}

/**
 * Creates a new merchant tenant and their initial admin user account
 */
export async function createMerchant(data: { storeName: string; usernameInput: string; passwordInput: string }) {
  await requireSuperAdmin();

  const username = data.usernameInput.trim().toLowerCase();

  try {
    // Check if username is already taken globally
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      throw new Error('اسم المستخدم هذا محجوز بالفعل في النظام');
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30); // 30 days free trial

    const result = await prisma.$transaction(async (t) => {
      // 1. Create Tenant
      const tenant = await t.tenant.create({
        data: {
          storeName: data.storeName,
          currency: 'EGP',
          saasPlan: 'free_trial',
          saasStatus: 'active',
          saasExpiry: expiry,
          saasBalance: 0.0,
        }
      });

      // 2. Create Admin User
      const user = await t.user.create({
        data: {
          tenantId: tenant.id,
          username,
          password: hashPassword(data.passwordInput),
          role: 'admin',
          permissions: ['dashboard', 'customers', 'subscriptions', 'services', 'expenses', 'advertising', 'notifications', 'archive', 'settings']
        }
      });

      return { tenant, user };
    });

    return { success: true, tenant: result.tenant };
  } catch (e: any) {
    console.error('Failed to create merchant:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Modifies merchant SaaS subscription configurations manually
 */
export async function updateMerchantSaaS(
  tenantId: string,
  data: { plan: string; status: string; expiry: string; balance: number }
) {
  await requireSuperAdmin();

  try {
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        saasPlan: data.plan,
        saasStatus: data.status,
        saasExpiry: data.expiry ? new Date(data.expiry) : null,
        saasBalance: Number(data.balance)
      }
    });

    return { success: true, tenant: updated };
  } catch (e: any) {
    console.error('Failed to update merchant SaaS settings:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Gets all pending SaaS payment requests from merchants
 */
export async function getSaaSPayments() {
  await requireSuperAdmin();

  try {
    const requests = await prisma.saaSPaymentRequest.findMany({
      include: {
        tenant: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return { success: true, requests };
  } catch (e: any) {
    console.error('Failed to get SaaS payments:', e);
    return { success: false, error: e.message, requests: [] };
  }
}

/**
 * Approves a merchant's payment request to credit their system balance
 */
export async function approveSaaSPayment(requestId: string, notes?: string) {
  await requireSuperAdmin();

  try {
    const result = await prisma.$transaction(async (t) => {
      const request = await t.saaSPaymentRequest.findUnique({
        where: { id: requestId },
        include: { tenant: true }
      });

      if (!request) {
        throw new Error('SaaS Payment request not found');
      }

      if (request.status !== 'pending') {
        throw new Error(`SaaS Payment is already ${request.status}`);
      }

      // Update status
      const updatedRequest = await t.saaSPaymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          notes: notes || 'تم التحقق من استلام المبلغ بنجاح وشحن الرصيد'
        }
      });

      // Increment merchant balance
      await t.tenant.update({
        where: { id: request.tenantId },
        data: {
          saasBalance: {
            increment: request.amount
          },
          // Auto-resume store status if suspended or expired
          saasStatus: 'active'
        }
      });

      return updatedRequest;
    });

    return { success: true, request: result };
  } catch (e: any) {
    console.error('Failed to approve SaaS payment:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Rejects a merchant's payment request
 */
export async function rejectSaaSPayment(requestId: string, notes: string) {
  await requireSuperAdmin();

  try {
    const updated = await prisma.saaSPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        notes: notes || 'تم رفض العملية - لم نستقبل الحوالة المذكورة'
      }
    });

    return { success: true, request: updated };
  } catch (e: any) {
    console.error('Failed to reject SaaS payment:', e);
    return { success: false, error: e.message };
  }
}
