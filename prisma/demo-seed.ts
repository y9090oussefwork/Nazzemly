import 'dotenv/config';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed is disabled in production.');
}

const scrypt = promisify(crypto.scrypt);
async function passwordHash(value: string) {
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(value, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const ownerPassword = await passwordHash('TestOwner!2026');
    const merchantPassword = await passwordHash('TestMerchant!2026');
    const platform = await prisma.tenant.upsert({
      where: { id: 'system_tenant' },
      update: { saasStatus: 'active', storeName: 'منصة الاختبار' },
      create: { id: 'system_tenant', slug: 'platform', storeName: 'منصة الاختبار', currency: 'EGP', saasStatus: 'active', maxUsers: 10, maxCustomers: 10 },
    });
    await prisma.user.upsert({
      where: { username: 'test_owner' },
      update: { tenantId: platform.id, password: ownerPassword, role: 'super_admin', permissions: ['all'], isActive: true, failedLoginAttempts: 0, lockedUntil: null },
      create: { tenantId: platform.id, username: 'test_owner', fullName: 'مالك المنصة التجريبي', password: ownerPassword, role: 'super_admin', permissions: ['all'], isActive: true },
    });

    const tenant = await prisma.tenant.upsert({
      where: { slug: 'demo-store' },
      update: { storeName: 'متجر التجربة', businessType: 'إدارة وبيع الاشتراكات الرقمية', businessDescription: 'متجر تجريبي لاختبار إدارة العملاء والاشتراكات والبوت.', onboardingStep: 4, onboardingCompletedAt: new Date(), saasStatus: 'active', maxUsers: 10, maxCustomers: 1000 },
      create: { slug: 'demo-store', storeName: 'متجر التجربة', businessType: 'إدارة وبيع الاشتراكات الرقمية', businessDescription: 'متجر تجريبي لاختبار إدارة العملاء والاشتراكات والبوت.', onboardingStep: 4, onboardingCompletedAt: new Date(), currency: 'EGP', timezone: 'Africa/Cairo', saasPlan: 'premium', saasStatus: 'active', maxUsers: 10, maxCustomers: 1000 },
    });
    const merchant = await prisma.user.upsert({
      where: { username: 'test_merchant' },
      update: { tenantId: tenant.id, password: merchantPassword, fullName: 'تاجر تجريبي', role: 'admin', permissions: ['all'], isActive: true, failedLoginAttempts: 0, lockedUntil: null },
      create: { tenantId: tenant.id, username: 'test_merchant', fullName: 'تاجر تجريبي', password: merchantPassword, role: 'admin', permissions: ['all'], isActive: true },
    });

    if (await prisma.tenantContact.count({ where: { tenantId: tenant.id } }) === 0) {
      await prisma.tenantContact.createMany({
        data: [
          { tenantId: tenant.id, type: 'whatsapp', label: 'دعم واتساب التجريبي', value: '201000000000', url: 'https://wa.me/201000000000', isPrimary: true, showInBot: true, sortOrder: 0 },
          { tenantId: tenant.id, type: 'telegram', label: 'دعم تيليجرام التجريبي', value: '@test_merchant_support', url: 'https://t.me/test_merchant_support', isPrimary: true, showInBot: true, sortOrder: 1 },
        ],
      });
    }
    if (await prisma.tenantPaymentMethod.count({ where: { tenantId: tenant.id } }) === 0) {
      await prisma.tenantPaymentMethod.createMany({
        data: [
          { tenantId: tenant.id, type: 'wallet', label: 'محفظة كاش تجريبية', accountIdentifier: '01000000000', instructions: 'بيانات اختبار فقط — لا تُحوّل أموالًا حقيقية.', isActive: true, showInBot: true, sortOrder: 0 },
          { tenantId: tenant.id, type: 'instapay', label: 'InstaPay تجريبي', accountIdentifier: 'demo@instapay', instructions: 'بيانات اختبار فقط — لا تُحوّل أموالًا حقيقية.', isActive: true, showInBot: true, sortOrder: 1 },
        ],
      });
    }
    await prisma.botSettings.upsert({
      where: { tenantId: tenant.id },
      update: { menuConfig: { rechargeAmounts: [50, 100, 200, 500] } },
      create: { tenantId: tenant.id, botName: 'بوت متجر التجربة', menuConfig: { rechargeAmounts: [50, 100, 200, 500] } },
    });

    const monthly = await prisma.service.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'اشتراك شهري' } },
      update: { defaultDuration: 30, defaultSellingPrice: 150, defaultCostPrice: 80, isActive: true },
      create: { tenantId: tenant.id, name: 'اشتراك شهري', description: 'خدمة تجريبية تتجدد كل شهر.', defaultDuration: 30, defaultSellingPrice: 150, defaultCostPrice: 80 },
    });
    const annual = await prisma.service.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'اشتراك سنوي' } },
      update: { defaultDuration: 365, defaultSellingPrice: 1200, defaultCostPrice: 650, isActive: true },
      create: { tenantId: tenant.id, name: 'اشتراك سنوي', description: 'خدمة تجريبية لمدة عام.', defaultDuration: 365, defaultSellingPrice: 1200, defaultCostPrice: 650 },
    });
    const chatGptCategory = await prisma.serviceCategory.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'ChatGPT' } },
      update: { description: 'كل باقات ChatGPT في قسم واحد منظم.', isActive: true, showInBot: true },
      create: { tenantId: tenant.id, name: 'ChatGPT', description: 'كل باقات ChatGPT في قسم واحد منظم.', sortOrder: 1, showInBot: true },
    });
    const chatGptPlus = await prisma.service.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'ChatGPT Plus' } },
      update: {
        categoryId: chatGptCategory.id,
        description: 'اشتراك ChatGPT Plus مع خيارات مدة متعددة وتوفير أكبر للمدد الأطول.',
        features: ['أولوية الوصول للنماذج', 'رفع وتحليل الملفات', 'إنشاء الصور', 'سرعة أعلى وقت الضغط'],
        defaultDuration: 30,
        defaultSellingPrice: 100,
        defaultCostPrice: 65,
        showInBot: true,
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        categoryId: chatGptCategory.id,
        name: 'ChatGPT Plus',
        description: 'اشتراك ChatGPT Plus مع خيارات مدة متعددة وتوفير أكبر للمدد الأطول.',
        features: ['أولوية الوصول للنماذج', 'رفع وتحليل الملفات', 'إنشاء الصور', 'سرعة أعلى وقت الضغط'],
        defaultDuration: 30,
        defaultSellingPrice: 100,
        defaultCostPrice: 65,
        showInBot: true,
      },
    });
    const chatGptPlans = [
      { name: 'شهر واحد', durationDays: 30, price: 100, costPrice: 65, stockQuantity: 10, sortOrder: 1 },
      { name: 'شهران', durationDays: 60, price: 190, costPrice: 125, stockQuantity: 6, sortOrder: 2 },
      { name: '3 شهور', durationDays: 90, price: 250, costPrice: 180, stockQuantity: 0, sortOrder: 3 },
      { name: '6 شهور', durationDays: 180, price: 500, costPrice: 350, stockQuantity: 4, sortOrder: 4 },
      { name: 'سنة', durationDays: 360, price: 900, costPrice: 650, stockQuantity: 2, sortOrder: 5 },
    ];
    for (const plan of chatGptPlans) {
      await prisma.servicePlan.upsert({
        where: { serviceId_name: { serviceId: chatGptPlus.id, name: plan.name } },
        update: { ...plan, tenantId: tenant.id, trackInventory: true, showInBot: true, isActive: true },
        create: { ...plan, tenantId: tenant.id, serviceId: chatGptPlus.id, trackInventory: true, showInBot: true, isActive: true },
      });
    }
    const customers = await Promise.all([
      ['أحمد علي', '01000000001', 'شركة النور'],
      ['سارة محمود', '01000000002', 'مكتب النجاح'],
      ['محمد خالد', '01000000003', 'متجر المستقبل'],
    ].map(async ([name, phone, company]) => prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone } },
      update: { name, company, stage: 'customer', lastContactAt: new Date() },
      create: { tenantId: tenant.id, name, phone, company, stage: 'customer', source: 'demo_seed', createdBy: merchant.id, lastContactAt: new Date() },
    })));
    const now = new Date();
    const expiry = new Date(now); expiry.setDate(expiry.getDate() + 3);
    const annualExpiry = new Date(now); annualExpiry.setDate(annualExpiry.getDate() + 200);
    await prisma.subscription.upsert({
      where: { tenantId_orderNo: { tenantId: tenant.id, orderNo: 'DEMO-SUB-001' } },
      update: { customerId: customers[0].id, serviceId: monthly.id, startDate: now, endDate: expiry, sellingPrice: 150, costPrice: 80, status: 'active' },
      create: { tenantId: tenant.id, customerId: customers[0].id, serviceId: monthly.id, orderNo: 'DEMO-SUB-001', startDate: now, endDate: expiry, sellingPrice: 150, costPrice: 80, status: 'active', createdBy: merchant.id },
    });
    await prisma.subscription.upsert({
      where: { tenantId_orderNo: { tenantId: tenant.id, orderNo: 'DEMO-SUB-002' } },
      update: { customerId: customers[1].id, serviceId: annual.id, startDate: now, endDate: annualExpiry, sellingPrice: 1200, costPrice: 650, status: 'active' },
      create: { tenantId: tenant.id, customerId: customers[1].id, serviceId: annual.id, orderNo: 'DEMO-SUB-002', startDate: now, endDate: annualExpiry, sellingPrice: 1200, costPrice: 650, status: 'active', createdBy: merchant.id },
    });
    await prisma.paymentRequest.upsert({
      where: { tenantId_transactionId: { tenantId: tenant.id, transactionId: 'DEMO-TRANSFER-001' } },
      update: { customerId: customers[2].id, amount: 100, fraction: 0.37, method: 'instapay', status: 'pending', senderIdentifier: '01000000003', notes: 'طلب تجريبي بانتظار الاعتماد' },
      create: { tenantId: tenant.id, customerId: customers[2].id, amount: 100, fraction: 0.37, method: 'instapay', status: 'pending', senderIdentifier: '01000000003', transactionId: 'DEMO-TRANSFER-001', notes: 'طلب تجريبي بانتظار الاعتماد', expiresAt: new Date(Date.now() + 86_400_000) },
    });
    console.log('Demo accounts and sample data are ready.');
  } finally { await prisma.$disconnect(); await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });