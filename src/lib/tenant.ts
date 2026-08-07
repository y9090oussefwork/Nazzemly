import { requireAuth } from './session';
import { prisma } from './prisma';

export interface TenantContext {
  tenantId: string;
  storeName: string;
  currency: string;
}

/**
 * Resolves the tenant context for the currently logged-in merchant staff user.
 * Scopes database queries to the active tenant.
 */
export async function getActiveTenant(): Promise<TenantContext> {
  const session = await requireAuth();
  
  // Optionally fetch fresh settings from DB
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, storeName: true, currency: true }
  });

  if (!tenant) {
    throw new Error('Tenant not found or disabled');
  }

  return {
    tenantId: tenant.id,
    storeName: tenant.storeName,
    currency: tenant.currency
  };
}

/**
 * Scopes a prisma query object to the current tenant ID.
 * Usage: const customers = await prisma.customer.findMany({ where: withTenant(tenantId, { ... }) })
 */
export function withTenant<T extends Record<string, any>>(tenantId: string, query: T): T & { tenantId: string } {
  return {
    ...query,
    tenantId
  };
}
