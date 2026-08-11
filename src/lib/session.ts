import 'server-only';

import { cookies, headers } from 'next/headers';
import { prisma } from './prisma';
import { hashPassword, hashToken, randomToken } from './security';

const SESSION_COOKIE = 'saas_session';
const SESSION_DAYS = 7;

export { hashPassword };

export interface SessionContext {
  sessionId: string;
  userId: string;
  username: string;
  role: string;
  tenantId: string;
  storeName: string;
  permissions: string[];
  tenantStatus: string;
  tenantExpiry: Date | null;
}

interface LoginPayload {
  userId: string;
  username: string;
  role: string;
  tenantId: string;
  storeName: string;
  permissions: string[];
}

export async function login(payload: LoginPayload): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for');

  await prisma.session.create({
    data: {
      tenantId: payload.tenantId,
      userId: payload.userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: forwarded?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip'),
      userAgent: requestHeaders.get('user-agent'),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
    priority: 'high',
  });
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete('session');
}

export async function getSession(): Promise<SessionContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          permissions: true,
          isActive: true,
          tenantId: true,
        },
      },
      tenant: {
        select: {
          id: true,
          storeName: true,
          saasStatus: true,
          saasExpiry: true,
        },
      },
    },
  });

  const now = new Date();
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !session.user.isActive ||
    session.user.tenantId !== session.tenantId
  ) {
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > 15 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    username: session.user.username,
    role: session.user.role,
    tenantId: session.tenant.id,
    storeName: session.tenant.storeName,
    permissions: session.user.permissions,
    tenantStatus: session.tenant.saasStatus,
    tenantExpiry: session.tenant.saasExpiry,
  };
}

export async function requireAuth(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function requireSuperAdmin(): Promise<SessionContext> {
  const session = await requireAuth();
  if (session.role !== 'super_admin') {
    throw new Error('Forbidden: Super Admin access required');
  }
  return session;
}

export async function requirePermission(
  permission: string,
  options: { allowInactiveTenant?: boolean } = {},
): Promise<SessionContext> {
  const session = await requireAuth();

  if (session.role === 'super_admin') return session;

  if (!options.allowInactiveTenant) {
    const expired = session.tenantExpiry ? session.tenantExpiry <= new Date() : false;
    if (session.tenantStatus !== 'active' || expired) {
      throw new Error('TENANT_SUBSCRIPTION_INACTIVE');
    }
  }

  const hasPermission =
    session.role === 'admin' ||
    session.permissions.includes('all') ||
    session.permissions.includes(permission);

  if (!hasPermission) throw new Error('Forbidden: missing permission ' + permission);
  return session;
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
