'use server';

import { prisma } from '@/lib/prisma';
import { hashPassword, login, logout, getSession } from '@/lib/session';

export async function loginMerchant(usernameInput: string, passwordInput: string) {
  try {
    const username = usernameInput.trim().toLowerCase();
    
    // 1. Find user in the database
    const user = await prisma.user.findUnique({
      where: { username },
      include: { tenant: true },
    });

    if (!user) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // 2. Hash and compare password
    const hashedPassword = hashPassword(passwordInput);
    if (user.password !== hashedPassword) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // 3. Write session cookie
    await login({
      userId: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      storeName: user.tenant.storeName,
      permissions: user.permissions,
    });

    return { success: true, storeName: user.tenant.storeName, role: user.role };
  } catch (e: any) {
    console.error('Login action failed:', e);
    return { success: false, error: 'حدث خطأ في السيرفر أثناء تسجيل الدخول' };
  }
}

export async function logoutMerchant() {
  await logout();
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
  };
}
