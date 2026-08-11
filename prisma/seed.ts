import { promisify } from 'node:util';
import crypto from 'node:crypto';
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);

async function secureHash(password: string) {
  if (password.length < 10) throw new Error('Seed password must be at least 10 characters');
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return ['scrypt', salt.toString('base64url'), derived.toString('base64url')].join('$');
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const plans = [
      {
        code: 'basic',
        name: 'الأساسية',
        priceMonthly: 150,
        priceYearly: 1500,
        maxUsers: 3,
        maxCustomers: 500,
        maxMessages: 5000,
        features: ['crm', 'tasks', 'telegram_bot', 'payments', 'reports'],
      },
      {
        code: 'premium',
        name: 'الاحترافية',
        priceMonthly: 300,
        priceYearly: 3000,
        maxUsers: 15,
        maxCustomers: 5000,
        maxMessages: 50000,
        features: ['crm', 'tasks', 'deals', 'telegram_bot', 'automations', 'broadcasts', 'payments', 'reports', 'audit'],
      },
    ];

    for (const plan of plans) {
      await prisma.plan.upsert({
        where: { code: plan.code },
        update: {
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          maxUsers: plan.maxUsers,
          maxCustomers: plan.maxCustomers,
          maxMessages: plan.maxMessages,
          features: plan.features,
        },
        create: plan,
      });
    }

    const username = process.env.SEED_SUPERADMIN_USERNAME?.trim().toLowerCase();
    const password = process.env.SEED_SUPERADMIN_PASSWORD;
    if (username || password) {
      if (!username || !password) {
        throw new Error('Set both SEED_SUPERADMIN_USERNAME and SEED_SUPERADMIN_PASSWORD');
      }
      const systemTenant = await prisma.tenant.upsert({
        where: { id: 'system_tenant' },
        update: {},
        create: {
          id: 'system_tenant',
          slug: 'platform',
          storeName: 'Nazzemly — نظّملي',
          currency: 'EGP',
          saasStatus: 'active',
          maxUsers: 10,
          maxCustomers: 1,
        },
      });
      const existing = await prisma.user.findUnique({ where: { username } });
      if (!existing) {
        await prisma.user.create({
          data: {
            tenantId: systemTenant.id,
            username,
            password: await secureHash(password),
            role: 'super_admin',
            permissions: ['all'],
            isActive: true,
          },
        });
        console.log('Created the configured super admin account.');
      } else {
        console.log('Super admin username already exists; password was not overwritten.');
      }
    } else {
      console.log('No super admin credentials supplied; only plans were synchronized.');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
