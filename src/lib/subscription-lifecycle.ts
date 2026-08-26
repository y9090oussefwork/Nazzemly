import 'server-only';

import { prisma } from './prisma';

/** Keeps the stored state aligned with the real end date before any customer-facing read. */
export async function expireDueSubscriptions(tenantId?: string, now = new Date()) {
  return prisma.subscription.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: { in: ['active', 'expiring_soon'] },
      endDate: { lte: now },
    },
    data: { status: 'expired' },
  });
}
