'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { hashPassword } from '@/lib/security';
import { cleanText, normalizeUsername, optionalEmail, optionalText, oneOf } from '@/lib/validation';
import { revokeAllUserSessions } from '@/lib/session';
import { writeAuditLog } from '@/lib/audit';

import { TEAM_PERMISSIONS } from '@/lib/team-permissions';

function checkedPermissions(input: string[]) {
  const allowed = new Set<string>(TEAM_PERMISSIONS);
  return Array.from(new Set(input.filter((item) => allowed.has(item))));
}

const SIMPLE_ROLE_PERMISSIONS = {
  sales: ['dashboard', 'customers', 'customers.write', 'deals', 'services', 'subscriptions'],
  support: ['dashboard', 'customers', 'customers.write', 'tasks', 'payments'],
} as const;

function roleAndPermissions(roleInput: string, permissionsInput: string[]) {
  const role = oneOf(roleInput, ['user', 'manager', 'sales', 'support'] as const, 'الدور');
  return {
    role,
    permissions: role === 'sales' || role === 'support'
      ? [...SIMPLE_ROLE_PERMISSIONS[role]]
      : checkedPermissions(permissionsInput),
  };
}

export async function getTeamMembers() {
  try {
    const { tenantId } = await getActiveTenant('team');
    const members = await prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        _count: {
          select: {
            assignedCustomers: true,
            assignedTasks: true,
            ownedDeals: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return { success: true, members, permissionOptions: TEAM_PERMISSIONS };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تحميل الفريق',
      members: [],
      permissionOptions: TEAM_PERMISSIONS,
    };
  }
}

export async function createTeamMember(input: {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
  role?: string;
  permissions: string[];
}) {
  try {
    const { tenantId, session } = await getActiveTenant('team');
    const username = normalizeUsername(input.username);
    const password = cleanText(input.password, 'كلمة المرور', 10, 200);
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error('كلمة المرور يجب أن تحتوي على حروف وأرقام');
    }
    const fullName = optionalText(input.fullName, 100);
    const email = optionalEmail(input.email);
    const { role, permissions } = roleAndPermissions(input.role ?? 'user', input.permissions);

    const [tenant, count, existing] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { maxUsers: true },
      }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.user.findUnique({ where: { username }, select: { id: true } }),
    ]);
    if (!tenant) throw new Error('المتجر غير موجود');
    if (count >= tenant.maxUsers) throw new Error('تم الوصول إلى الحد الأقصى لأعضاء الفريق في الباقة');
    if (existing) throw new Error('اسم المستخدم مستخدم بالفعل');

    const user = await prisma.user.create({
      data: {
        tenantId,
        username,
        password: await hashPassword(password),
        fullName,
        email,
        role,
        permissions,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
      },
    });
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'team.member_created',
      entityType: 'User',
      entityId: user.id,
      metadata: { username, role, permissions },
    });
    revalidatePath('/dashboard');
    return { success: true, member: user };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إضافة عضو الفريق' };
  }
}

export async function updateTeamMember(input: {
  id: string;
  fullName?: string;
  email?: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}) {
  try {
    const { tenantId, session } = await getActiveTenant('team');
    const id = cleanText(input.id, 'عضو الفريق', 5, 100);
    if (id === session.userId && !input.isActive) throw new Error('لا يمكنك تعطيل حسابك الحالي');
    const { role, permissions } = roleAndPermissions(input.role, input.permissions);
    const member = await prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true, role: true },
    });
    if (!member) throw new Error('عضو الفريق غير موجود');
    if (member.role === 'admin') throw new Error('لا يمكن تعديل مالك المتجر من هذه الشاشة');

    const updated = await prisma.user.update({
      where: { id: member.id },
      data: {
        fullName: optionalText(input.fullName, 100),
        email: optionalEmail(input.email),
        role,
        permissions,
        isActive: Boolean(input.isActive),
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        isActive: true,
      },
    });
    if (!updated.isActive) await revokeAllUserSessions(updated.id);
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'team.member_updated',
      entityType: 'User',
      entityId: updated.id,
      metadata: { role, permissions, isActive: updated.isActive },
    });
    revalidatePath('/dashboard');
    return { success: true, member: updated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحديث عضو الفريق' };
  }
}

export async function resetTeamMemberPassword(memberIdInput: string, passwordInput: string) {
  try {
    const { tenantId, session } = await getActiveTenant('team');
    const memberId = cleanText(memberIdInput, 'عضو الفريق', 5, 100);
    const password = cleanText(passwordInput, 'كلمة المرور الجديدة', 10, 200);
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error('كلمة المرور يجب أن تحتوي على حروف وأرقام');
    }
    const member = await prisma.user.findFirst({
      where: { id: memberId, tenantId },
      select: { id: true, username: true },
    });
    if (!member) throw new Error('عضو الفريق غير موجود');

    await prisma.user.update({
      where: { id: member.id },
      data: { password: await hashPassword(password), failedLoginAttempts: 0, lockedUntil: null },
    });
    await revokeAllUserSessions(member.id);
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'team.password_reset',
      entityType: 'User',
      entityId: member.id,
      metadata: { username: member.username },
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر إعادة تعيين كلمة المرور' };
  }
}

export async function getTenantAuditLogs() {
  try {
    const { tenantId } = await getActiveTenant('audit');
    const logs = await prisma.auditLog.findMany({
      where: { tenantId },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { username: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return { success: true, logs };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تحميل سجل التدقيق', logs: [] };
  }
}
