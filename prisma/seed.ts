import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import crypto from 'node:crypto';
import 'dotenv/config';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Seeding database with rich demo data...');

  // 1. Create Default Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'default_tenant' },
    update: {},
    create: {
      id: 'default_tenant',
      storeName: 'Trust Nexus',
      currency: 'EGP',
      reminderDays: 3,
      notifEmail: 'admin@trustnexus.com',
    },
  });
  console.log('Created Tenant:', tenant.storeName);

  // 1.5 Create System Tenant for Super Admin
  const systemTenant = await prisma.tenant.upsert({
    where: { id: 'system_tenant' },
    update: {},
    create: {
      id: 'system_tenant',
      storeName: 'Trust Nexus SaaS Platform',
      currency: 'EGP',
      reminderDays: 0,
      notifEmail: 'support@trustnexus.com',
    },
  });
  console.log('Created System Tenant:', systemTenant.storeName);

  // 1.6 Create Super Admin User
  const superPassword = hashPassword('super500');
  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {
      password: superPassword,
    },
    create: {
      tenantId: systemTenant.id,
      username: 'superadmin',
      password: superPassword,
      role: 'super_admin',
      permissions: ['all'],
    },
  });
  console.log('Created Super Admin User:', superAdmin.username);

  // 2. Create Default Admin User
  const adminPassword = hashPassword('500500');
  const admin = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {
      password: adminPassword,
    },
    create: {
      tenantId: tenant.id,
      username: 'demo',
      password: adminPassword,
      role: 'admin',
      permissions: ['dashboard', 'customers', 'subscriptions', 'services', 'expenses', 'advertising', 'notifications', 'archive', 'settings'],
    },
  });
  console.log('Created Admin User:', admin.username);

  // 3. Create Bot Settings
  const botSettings = await prisma.botSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      botToken: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ-demo',
      botUsername: '@TrustNexusStoreBot',
      isActive: true,
      welcomeMsg: 'أهلاً بك في متجر Trust Nexus لبيع وتجديد الاشتراكات الرقمية! 📱 شحن رصيد محفظتك تلقائي عبر فودافون كاش وإنستاباي.',
    },
  });
  console.log('Created Bot Settings:', botSettings.botUsername);

  // 4. Create Default Services
  const servicesData = [
    { id: 'srv_chatgpt', name: 'ChatGPT Plus', defaultDuration: 30, defaultSellingPrice: 600.0, defaultCostPrice: 450.0 },
    { id: 'srv_netflix', name: 'Netflix Premium 4K (Shared)', defaultDuration: 30, defaultSellingPrice: 150.0, defaultCostPrice: 100.0 },
    { id: 'srv_spotify', name: 'Spotify Premium 1 Year', defaultDuration: 365, defaultSellingPrice: 400.0, defaultCostPrice: 280.0 },
    { id: 'srv_youtube', name: 'YouTube Premium 6 Months', defaultDuration: 180, defaultSellingPrice: 250.0, defaultCostPrice: 160.0 }
  ];

  for (const s of servicesData) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        tenantId: tenant.id,
        name: s.name,
        defaultDuration: s.defaultDuration,
        defaultSellingPrice: s.defaultSellingPrice,
        defaultCostPrice: s.defaultCostPrice,
      },
    });
    console.log('Created/Updated Service:', s.name);
  }

  // 5. Create Default Customers
  const customersData = [
    { name: 'محمد علي', phone: '01012345678', email: 'mohamed@gmail.com', walletBalance: 450.0 },
    { name: 'أحمد محمود', phone: '01234567890', email: 'ahmed@gmail.com', walletBalance: 50.0 },
    { name: 'سارة خالد', phone: '01145678901', email: 'sara@gmail.com', walletBalance: 800.0 }
  ];

  for (const c of customersData) {
    await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
      update: {
        walletBalance: c.walletBalance,
      },
      create: {
        tenantId: tenant.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        walletBalance: c.walletBalance,
        notes: 'عميل تجريبي نشط',
        createdBy: 'system'
      },
    });
    console.log('Created/Updated Customer:', c.name);
  }

  // Resolve DB IDs for customers
  const mohamed = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id, phone: '01012345678' } });
  const ahmed = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id, phone: '01234567890' } });
  const sara = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id, phone: '01145678901' } });

  // 6. Clean and re-seed related models to avoid duplicate keys during re-run
  await prisma.accountPool.deleteMany({ where: { serviceId: { in: ['srv_chatgpt', 'srv_netflix', 'srv_spotify'] } } });
  await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.walletTransaction.deleteMany({ where: { customer: { tenantId: tenant.id } } });
  await prisma.paymentRequest.deleteMany({ where: { customer: { tenantId: tenant.id } } });
  await prisma.expense.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.adCampaign.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.sMSLog.deleteMany({ where: { tenantId: tenant.id } });

  // 7. Seed Wallet Transactions
  await prisma.walletTransaction.createMany({
    data: [
      { customerId: mohamed.id, amount: 500.0, type: 'deposit', description: 'شحن رصيد ابتدائي عبر محفظة كاش' },
      { customerId: mohamed.id, amount: -50.0, type: 'purchase', description: 'رسوم خدمة تجريبية' },
      { customerId: ahmed.id, amount: 50.0, type: 'deposit', description: 'شحن رصيد كاش' },
      { customerId: sara.id, amount: 1000.0, type: 'deposit', description: 'شحن رصيد إنستاباي' },
      { customerId: sara.id, amount: -200.0, type: 'purchase', description: 'شراء اشتراك Spotify' },
    ]
  });
  console.log('Seeded Wallet Transactions.');

  // 8. Seed Subscriptions (Active, Expiring Soon, Expired)
  const now = new Date();
  
  const subActive = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      customerId: mohamed.id,
      serviceId: 'srv_chatgpt',
      package: 'شخصي كامل',
      startDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      endDate: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000), // 20 days left
      sellingPrice: 600.0,
      costPrice: 450.0,
      status: 'active',
      notes: 'تفعيل فوري لعميل ديمو',
      createdBy: 'system'
    }
  });

  const subExpiring = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      customerId: ahmed.id,
      serviceId: 'srv_spotify',
      package: 'باقة عائلية',
      startDate: new Date(now.getTime() - 363 * 24 * 60 * 60 * 1000), // 363 days ago
      endDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days left (expiring soon)
      sellingPrice: 400.0,
      costPrice: 280.0,
      status: 'expiring_soon',
      notes: 'أوشك على الانتهاء',
      createdBy: 'system'
    }
  });

  const subExpired = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      customerId: sara.id,
      serviceId: 'srv_netflix',
      package: 'شاشة واحدة 4K',
      startDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      endDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // ended 5 days ago
      sellingPrice: 150.0,
      costPrice: 100.0,
      status: 'expired',
      notes: 'منتهي الصلاحية',
      createdBy: 'system'
    }
  });
  console.log('Seeded Subscriptions.');

  // 9. Seed Account Pool
  await prisma.accountPool.createMany({
    data: [
      { serviceId: 'srv_netflix', credentials: 'netflix_premium_acc1@gmail.com:secretPass1', isUsed: true, usedAt: now, subscriptionId: subExpired.id },
      { serviceId: 'srv_netflix', credentials: 'netflix_premium_acc2@gmail.com:secretPass2', isUsed: false },
      { serviceId: 'srv_netflix', credentials: 'netflix_premium_acc3@gmail.com:secretPass3', isUsed: false },
      { serviceId: 'srv_chatgpt', credentials: 'sk-live-chatgpt4-api-key-demo-value-1', isUsed: true, usedAt: now, subscriptionId: subActive.id },
      { serviceId: 'srv_chatgpt', credentials: 'sk-live-chatgpt4-api-key-demo-value-2', isUsed: false },
      { serviceId: 'srv_spotify', credentials: 'spotify_premium_family_invite_link_1', isUsed: true, usedAt: now, subscriptionId: subExpiring.id },
      { serviceId: 'srv_spotify', credentials: 'spotify_premium_family_invite_link_2', isUsed: false },
    ]
  });
  console.log('Seeded Account Pool.');

  // 10. Seed Payment Requests (Pending Queue)
  await prisma.paymentRequest.createMany({
    data: [
      { customerId: mohamed.id, amount: 200, fraction: 0.15, method: 'vodafone_cash', senderIdentifier: '01012345678', status: 'pending', notes: 'في انتظار التحقق من التحويل' },
      { customerId: sara.id, amount: 500, fraction: 0.44, method: 'instapay', senderIdentifier: 'sara@instapay', status: 'pending', notes: 'يرجى مراجعة إيصال إنستاباي' },
      { customerId: ahmed.id, amount: 150, fraction: 0.88, method: 'vodafone_cash', senderIdentifier: '01222233344', status: 'approved', transactionId: 'VF_1002345', notes: 'تم شحن المحفظة بنجاح' }
    ]
  });
  console.log('Seeded Payment Requests.');

  // 11. Seed Expenses
  await prisma.expense.createMany({
    data: [
      { tenantId: tenant.id, category: 'سيرفرات واستضافة', amount: 350.0, date: now, notes: 'استضافة VPS على كونتادو لشهر أغسطس', createdBy: 'system' },
      { tenantId: tenant.id, category: 'حسابات موردين', amount: 800.0, date: now, notes: 'دفعة شراء حسابات Netflix من الموزع الأساسي', createdBy: 'system' },
    ]
  });
  console.log('Seeded Expenses.');

  // 12. Seed Ad Campaigns
  await prisma.adCampaign.createMany({
    data: [
      { tenantId: tenant.id, platform: 'إعلانات فيسبوك', amount: 250.0, date: now, notes: 'حملة ترويجية لخدمة Spotify Premium' },
      { tenantId: tenant.id, platform: 'إعلانات جوجل', amount: 120.0, date: now, notes: 'حملة بحث لكلمة اشتراكات نتفلكس رخيصة' },
    ]
  });
  console.log('Seeded Ad Campaigns.');

  // 13. Seed SMS Logs
  await prisma.sMSLog.createMany({
    data: [
      { tenantId: tenant.id, sender: 'Vodafone', message: 'تم استلام مبلغ 150.88 جنيه من رقم 01222233344. العملية رقم VF_1002345', isMatched: true, matchedId: 'dummy_id', receivedAt: now },
      { tenantId: tenant.id, sender: 'VF-Cash', message: 'تم استلام مبلغ 50.00 جنيه من رقم 01099887766. رصيدك الحالي هو 550.00 جنيه.', isMatched: false, receivedAt: now },
    ]
  });
  console.log('Seeded SMS Logs.');

  console.log('🎉 Seeding finished successfully with full mock data for all tables!');
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error('Error during seeding:', e);
  process.exit(1);
});
