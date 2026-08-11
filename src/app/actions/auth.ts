'use server';

import { prisma } from '@/lib/prisma';
import { getSession, login, logout } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/security';
import { normalizeUsername } from '@/lib/validation';
import { writeAuditLog } from '@/lib/audit';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function loginMerchant(usernameInput: string, passwordInput: string) {
  try {
    const username = normalizeUsername(usernameInput);
    if (typeof passwordInput !== 'string' || passwordInput.length > 200) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        tenant: {
          select: { id: true, storeName: true, saasStatus: true, saasExpiry: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return { success: false, error: 'تم إيقاف الدخول مؤقتاً. حاول مرة أخرى بعد 15 دقيقة' };
    }

    const verification = await verifyPassword(passwordInput, user.password);
    if (!verification.valid) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts >= MAX_LOGIN_ATTEMPTS ? 0 : attempts,
          lockedUntil:
            attempts >= MAX_LOGIN_ATTEMPTS
              ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
              : null,
        },
      });
      await writeAuditLog({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
      });
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(verification.needsRehash ? { password: await hashPassword(passwordInput) } : {}),
      },
    });

    await login({
      userId: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      storeName: user.tenant.storeName,
      permissions: user.permissions,
    });

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
    });

    return {
      success: true,
      storeName: user.tenant.storeName,
      role: user.role,
      tenantStatus: user.tenant.saasStatus,
    };
  } catch (error) {
    console.error('Login action failed', error);
    return { success: false, error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' };
  }
}

export async function logoutMerchant() {
  const session = await getSession();
  await logout();
  if (session) {
    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'auth.logout',
      entityType: 'User',
      entityId: session.userId,
    });
  }
  return { success: true };
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return {
    userId: session.userId,
    username: session.username,
    role: session.role,
    tenantId: session.tenantId,
    storeName: session.storeName,
    permissions: session.permissions,
    tenantStatus: session.tenantStatus,
    tenantExpiry: session.tenantExpiry,
  };
}
