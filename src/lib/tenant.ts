import 'server-only';

import { prisma } from './prisma';
import { requirePermission, type SessionContext } from './session';

export interface TenantContext {
  tenantId: string;
  storeName: string;
  currency: string;
  session: SessionContext;
}

export async function getActiveTenant(permission = 'dashboard'): Promise<TenantContext> {
  const session = await requirePermission(permission);
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      storeName: true,
      currency: true,
      saasStatus: true,
      saasExpiry: true,
    },
  });

  if (!tenant) throw new Error('Tenant not found');
  if (tenant.saasStatus !== 'active' || (tenant.saasExpiry && tenant.saasExpiry <= new Date())) {
    throw new Error('TENANT_SUBSCRIPTION_INACTIVE');
  }

  return {
    tenantId: tenant.id,
    storeName: tenant.storeName,
    currency: tenant.currency,
    session,
  };
}

export function withTenant<T extends Record<string, unknown>>(
  tenantId: string,
  query: T,
): T & { tenantId: string } {
  return { ...query, tenantId };
}
