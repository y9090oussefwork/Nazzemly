import 'server-only';

import { headers } from 'next/headers';
import { prisma } from './prisma';

interface AuditInput {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip');
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
        ipAddress,
        userAgent: requestHeaders.get('user-agent'),
      },
    });
  } catch (error) {
    console.error('Audit log write failed', error);
  }
}
