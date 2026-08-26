'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getActiveTenant } from '@/lib/tenant';
import { writeAuditLog } from '@/lib/audit';

export type DataSet = 'customers' | 'services' | 'subscriptions' | 'expenses' | 'recurring_expenses' | 'advertising';

const supportedDataSets: DataSet[] = ['customers', 'services', 'subscriptions', 'expenses', 'recurring_expenses', 'advertising'];
const backupFormat = 'nazzemly-data-backup';

type MerchantBackup = {
  format: typeof backupFormat;
  version: 1;
  createdAt: string;
  data: Partial<Record<DataSet, string>>;
};

type MerchantRestoreBackup = {
  format: typeof backupFormat;
  version: 2;
  createdAt: string;
  productVersion: string;
  scope: 'merchant_operational_data';
  sections: Record<string, unknown[]>;
};

const restoreSectionLabels: Record<string, string> = {
  merchant_profile: 'بيانات المتجر',
  contacts: 'وسائل التواصل',
  payment_methods: 'طرق الدفع',
  bot_configuration: 'إعدادات البوت',
  categories: 'تصنيفات الخدمات',
  services: 'الخدمات والباقات',
  customers: 'العملاء',
  subscriptions: 'الاشتراكات',
  orders: 'الطلبات والتنفيذ',
  account_pool: 'المخزون وبيانات التسليم',
  interests: 'طلبات الاهتمام بالخدمات',
  wallet: 'محافظ العملاء وطلبات الشحن',
  customer_operations: 'المهام والصفقات وسجل العملاء',
  messages: 'القوالب والإشعارات',
  warranties: 'الضمانات والمشكلات',
  financials: 'المصروفات والإعلانات',
  support: 'تذاكر الدعم',
  referral_wallet: 'محفظة الإحالة وطلبات السحب',
};

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const text = content.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, '').trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field.replace(/\r$/, '').trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات');
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1, 5001).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

function parseMerchantBackup(content: string) {
  if (content.length > 40_000_000) throw new Error('حجم ملف النسخة الاحتياطية أكبر من الحد المسموح');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('هذا ليس ملف نسخة احتياطية صالحًا من Nazzemly');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('تنسيق ملف النسخة الاحتياطية غير صحيح');
  const candidate = parsed as Partial<MerchantBackup>;
  if (candidate.format !== backupFormat || candidate.version !== 1 || !candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    throw new Error('ملف النسخة الاحتياطية غير مدعوم أو من إصدار مختلف');
  }
  const entries = supportedDataSets
    .map((dataSet) => ({ dataSet, content: candidate.data?.[dataSet] }))
    .filter((entry): entry is { dataSet: DataSet; content: string } => typeof entry.content === 'string');
  if (!entries.length) throw new Error('لا يحتوي الملف على أي بيانات قابلة للاستيراد');
  return { createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : null, entries };
}

function parseMerchantRestoreBackup(content: string): MerchantRestoreBackup | null {
  if (content.length > 80_000_000) throw new Error('حجم ملف النسخة الاحتياطية أكبر من الحد المسموح');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('هذا ليس ملف نسخة احتياطية صالحًا من Nazzemly'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('تنسيق ملف النسخة الاحتياطية غير صحيح');
  const candidate = parsed as Partial<MerchantRestoreBackup>;
  if (candidate.format !== backupFormat || candidate.version !== 2) return null;
  if (!candidate.sections || typeof candidate.sections !== 'object' || Array.isArray(candidate.sections)) throw new Error('ملف الاسترداد لا يحتوي على أقسام صالحة');
  for (const [section, rows] of Object.entries(candidate.sections)) {
    if (!restoreSectionLabels[section] || !Array.isArray(rows)) throw new Error('ملف الاسترداد يحتوي على قسم غير مدعوم');
  }
  return candidate as MerchantRestoreBackup;
}

function value(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const found = row[key.toLowerCase()];
    if (found != null && found !== '') return found.trim();
  }
  return '';
}

function numberValue(input: string, fallback = 0) {
  const parsed = Number(input.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(input: string, fallback = true) {
  if (!input) return fallback;
  return !['0', 'false', 'no', 'لا', 'off'].includes(input.toLowerCase());
}

function dateValue(input: string, fallback = new Date()) {
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function exportMerchantCsv(dataSet: DataSet) {
  try {
    const { tenantId, storeName } = await getActiveTenant('dashboard');
    let csv = '';
    if (dataSet === 'customers') {
      const rows = await prisma.customer.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
      csv = toCsv(
        ['name', 'phone', 'email', 'company', 'stage', 'source', 'tags', 'address', 'telegram_username', 'wallet_balance', 'notes', 'created_at'],
        rows.map((item) => [item.name, item.phone, item.email, item.company, item.stage, item.source, item.tags.join('|'), item.address, item.tgUsername, item.walletBalance, item.notes, item.createdAt.toISOString()]),
      );
    } else if (dataSet === 'services') {
      const rows = await prisma.service.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        include: { category: true, plans: { orderBy: { durationDays: 'asc' } } },
      });
      const output: unknown[][] = [];
      for (const service of rows) {
        const plans = service.plans.length ? service.plans : [null];
        for (const plan of plans) output.push([
          service.category?.name,
          service.name,
          service.description,
          service.features.join('|'),
          service.defaultDuration,
          service.defaultSellingPrice,
          service.defaultCostPrice,
          service.showInBot,
          service.isActive,
          plan?.name,
          plan?.durationDays,
          plan?.price,
          plan?.costPrice,
          plan?.trackInventory,
          plan?.stockQuantity,
          plan?.showInBot,
          plan?.isActive,
        ]);
      }
      csv = toCsv(['category', 'service_name', 'description', 'features', 'base_duration_days', 'base_price', 'base_cost', 'service_show_in_bot', 'service_active', 'plan_name', 'plan_duration_days', 'plan_price', 'plan_cost', 'track_inventory', 'stock_quantity', 'plan_show_in_bot', 'plan_active'], output);
    } else if (dataSet === 'subscriptions') {
      const rows = await prisma.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        include: { customer: true, service: true, servicePlan: true },
      });
      csv = toCsv(
        ['order_no', 'customer_phone', 'customer_name', 'service_name', 'plan_name', 'start_date', 'end_date', 'price_before_discount', 'discount_type', 'discount_value', 'discount_amount', 'selling_price', 'cost_price', 'status', 'notes'],
        rows.map((item) => [item.orderNo, item.customer.phone, item.customer.name, item.service.name, item.servicePlan?.name || item.package, item.startDate.toISOString(), item.endDate.toISOString(), item.priceBeforeDiscount, item.discountType, item.discountValue, item.discountAmount, item.sellingPrice, item.costPrice, item.status, item.notes]),
      );
    } else if (dataSet === 'expenses') {
      const rows = await prisma.expense.findMany({ where: { tenantId }, orderBy: { date: 'asc' } });
      csv = toCsv(['category', 'amount', 'date', 'notes'], rows.map((item) => [item.category, item.amount, item.date.toISOString(), item.notes]));
    } else if (dataSet === 'recurring_expenses') {
      const rows = await prisma.recurringExpense.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
      csv = toCsv(
        ['category', 'amount', 'frequency', 'interval', 'start_date', 'next_run_at', 'end_date', 'is_active', 'notes'],
        rows.map((item) => [item.category, item.amount, item.frequency, item.interval, item.startDate.toISOString(), item.nextRunAt.toISOString(), item.endDate?.toISOString(), item.isActive, item.notes]),
      );
    } else {
      const rows = await prisma.adCampaign.findMany({ where: { tenantId }, orderBy: { date: 'asc' } });
      csv = toCsv(['platform', 'amount', 'date', 'notes'], rows.map((item) => [item.platform, item.amount, item.date.toISOString(), item.notes]));
    }
    const safeStore = storeName.replace(/[^\p{L}\p{N}_-]+/gu, '-');
    return { success: true, fileName: `${safeStore}-${dataSet}-${new Date().toISOString().slice(0, 10)}.csv`, content: csv };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تصدير البيانات' };
  }
}

export async function exportMerchantBackup() {
  try {
    const { tenantId, storeName } = await getActiveTenant('dashboard');
    const [tenant, contacts, paymentMethods, bot, categories, services, customers, subscriptions, interests, orders, accountPool, walletTransactions, paymentRequests, tasks, deals, activities, templates, notifications, warrantyCases, expenses, recurringExpenses, advertising, supportTickets, referralProgram] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { storeName: true, currency: true, timezone: true, locale: true, reminderDays: true, notifEmail: true, logoUrl: true, businessType: true, businessDescription: true, websiteUrl: true, onboardingStep: true, onboardingCompletedAt: true } }),
      prisma.tenantContact.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
      prisma.tenantPaymentMethod.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
      prisma.botSettings.findUnique({ where: { tenantId }, select: { botUsername: true, botName: true, tokenLast4: true, isActive: true, welcomeMsg: true, supportMessage: true, menuConfig: true, channelChatId: true, channelUrl: true, requireChannelJoin: true, autoPostServices: true, autoPostRestocks: true, automations: true, broadcasts: true } }),
      prisma.serviceCategory.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
      prisma.service.findMany({ where: { tenantId }, include: { plans: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
      prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.subscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.serviceInterest.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.order.findMany({ where: { tenantId }, include: { inputValues: true, events: true }, orderBy: { createdAt: 'asc' } }),
      prisma.accountPool.findMany({ where: { tenantId }, include: { allocations: true }, orderBy: { createdAt: 'asc' } }),
      prisma.walletTransaction.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.paymentRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.task.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.deal.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.customerActivity.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.messageTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.notification.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.warrantyCase.findMany({ where: { tenantId }, include: { events: true }, orderBy: { createdAt: 'asc' } }),
      prisma.expense.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.recurringExpense.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.adCampaign.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      prisma.supportTicket.findMany({ where: { tenantId }, include: { messages: true }, orderBy: { createdAt: 'asc' } }),
      prisma.referralProgram.findUnique({ where: { tenantId }, include: { walletEntries: true, payoutRequests: true, attributions: true } }),
    ]);
    const archive: MerchantRestoreBackup = {
      format: backupFormat,
      version: 2,
      createdAt: new Date().toISOString(),
      productVersion: 'nazzemly-restore-v2',
      scope: 'merchant_operational_data',
      sections: {
        merchant_profile: [tenant],
        contacts,
        payment_methods: paymentMethods,
        bot_configuration: bot ? [bot] : [],
        categories,
        services,
        customers,
        subscriptions,
        interests,
        orders,
        account_pool: accountPool,
        wallet: [{ walletTransactions, paymentRequests }],
        customer_operations: [{ tasks, deals, activities }],
        messages: [{ templates, notifications }],
        warranties: warrantyCases,
        financials: [{ expenses, recurringExpenses, advertising }],
        support: supportTickets,
        referral_wallet: referralProgram ? [referralProgram] : [],
      },
    };
    const safeStore = storeName.replace(/[^\p{L}\p{N}_-]+/gu, '-');
    return {
      success: true,
      fileName: `${safeStore}-backup-${new Date().toISOString().slice(0, 10)}.nazzemly.json`,
      content: JSON.stringify(archive),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر تجهيز النسخة الاحتياطية' };
  }
}

export async function importMerchantCsv(input: { dataSet: DataSet; content: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('dashboard');
    if (input.content.length > 8_000_000) throw new Error('حجم الملف أكبر من الحد المسموح');
    const rows = parseCsv(input.content);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    if (input.dataSet === 'customers') {
      for (const row of rows) {
        const name = value(row, 'name', 'الاسم');
        const phone = value(row, 'phone', 'الهاتف');
        if (!name || !phone) { skipped += 1; continue; }
        const existing = await prisma.customer.findUnique({ where: { tenantId_phone: { tenantId, phone } }, select: { id: true } });
        const data = {
          name: name.slice(0, 120),
          email: value(row, 'email', 'البريد') || null,
          company: value(row, 'company', 'الشركة') || null,
          stage: value(row, 'stage', 'المرحلة') || 'lead',
          source: value(row, 'source', 'المصدر') || 'csv_import',
          tags: value(row, 'tags', 'الوسوم').split('|').map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
          address: value(row, 'address', 'العنوان') || null,
          notes: value(row, 'notes', 'ملاحظات') || null,
        };
        if (existing) { await prisma.customer.update({ where: { id: existing.id }, data }); updated += 1; }
        else { await prisma.customer.create({ data: { tenantId, phone, createdBy: session.userId, ...data } }); created += 1; }
      }
    } else if (input.dataSet === 'services') {
      for (const row of rows) {
        const serviceName = value(row, 'service_name', 'service', 'اسم الخدمة');
        if (!serviceName) { skipped += 1; continue; }
        const categoryName = value(row, 'category', 'التصنيف');
        const category = categoryName
          ? await prisma.serviceCategory.upsert({
              where: { tenantId_name: { tenantId, name: categoryName } },
              update: {},
              create: { tenantId, name: categoryName },
            })
          : null;
        const baseDuration = Math.max(1, Math.trunc(numberValue(value(row, 'base_duration_days'), 30)));
        const basePrice = Math.max(0.01, numberValue(value(row, 'base_price', 'price'), 1));
        const existingService = await prisma.service.findUnique({ where: { tenantId_name: { tenantId, name: serviceName } }, select: { id: true } });
        const serviceData = {
          categoryId: category?.id || null,
          description: value(row, 'description', 'الوصف') || null,
          features: value(row, 'features', 'المميزات').split('|').map((item) => item.trim()).filter(Boolean).slice(0, 20),
          defaultDuration: baseDuration,
          defaultSellingPrice: basePrice,
          defaultCostPrice: Math.max(0, numberValue(value(row, 'base_cost'))),
          showInBot: booleanValue(value(row, 'service_show_in_bot'), true),
          isActive: booleanValue(value(row, 'service_active'), true),
        };
        const service = existingService
          ? await prisma.service.update({ where: { id: existingService.id }, data: serviceData })
          : await prisma.service.create({ data: { tenantId, name: serviceName, ...serviceData } });
        if (existingService) updated += 1;
        else created += 1;
        const planName = value(row, 'plan_name', 'اسم المدة');
        if (planName) {
          await prisma.servicePlan.upsert({
            where: { serviceId_name: { serviceId: service.id, name: planName } },
            update: {
              durationDays: Math.max(1, Math.trunc(numberValue(value(row, 'plan_duration_days'), baseDuration))),
              price: Math.max(0.01, numberValue(value(row, 'plan_price'), basePrice)),
              costPrice: Math.max(0, numberValue(value(row, 'plan_cost'))),
              trackInventory: booleanValue(value(row, 'track_inventory'), false),
              stockQuantity: Math.max(0, Math.trunc(numberValue(value(row, 'stock_quantity')))),
              showInBot: booleanValue(value(row, 'plan_show_in_bot'), true),
              isActive: booleanValue(value(row, 'plan_active'), true),
            },
            create: {
              tenantId,
              serviceId: service.id,
              name: planName,
              durationDays: Math.max(1, Math.trunc(numberValue(value(row, 'plan_duration_days'), baseDuration))),
              price: Math.max(0.01, numberValue(value(row, 'plan_price'), basePrice)),
              costPrice: Math.max(0, numberValue(value(row, 'plan_cost'))),
              trackInventory: booleanValue(value(row, 'track_inventory'), false),
              stockQuantity: Math.max(0, Math.trunc(numberValue(value(row, 'stock_quantity')))),
              showInBot: booleanValue(value(row, 'plan_show_in_bot'), true),
              isActive: booleanValue(value(row, 'plan_active'), true),
            },
          });
        }
      }
    } else if (input.dataSet === 'subscriptions') {
      for (const row of rows) {
        const phone = value(row, 'customer_phone', 'phone');
        const serviceName = value(row, 'service_name', 'service');
        const customer = phone ? await prisma.customer.findUnique({ where: { tenantId_phone: { tenantId, phone } } }) : null;
        const service = serviceName ? await prisma.service.findUnique({ where: { tenantId_name: { tenantId, name: serviceName } } }) : null;
        if (!customer || !service) { skipped += 1; continue; }
        const planName = value(row, 'plan_name');
        const plan = planName ? await prisma.servicePlan.findUnique({ where: { serviceId_name: { serviceId: service.id, name: planName } } }) : null;
        const startDate = dateValue(value(row, 'start_date'));
        const defaultEnd = new Date(startDate);
        defaultEnd.setDate(defaultEnd.getDate() + (plan?.durationDays || service.defaultDuration));
        const orderNo = value(row, 'order_no') || null;
        if (orderNo && await prisma.subscription.findFirst({ where: { tenantId, orderNo } })) { skipped += 1; continue; }
        await prisma.subscription.create({ data: {
          tenantId,
          customerId: customer.id,
          serviceId: service.id,
          servicePlanId: plan?.id || null,
          orderNo,
          package: planName || null,
          startDate,
          endDate: dateValue(value(row, 'end_date'), defaultEnd),
          priceBeforeDiscount: Math.max(0, numberValue(value(row, 'price_before_discount'), numberValue(value(row, 'selling_price'), Number(plan?.price || service.defaultSellingPrice)))),
          discountType: ['percentage', 'fixed'].includes(value(row, 'discount_type')) ? value(row, 'discount_type') : null,
          discountValue: Math.max(0, numberValue(value(row, 'discount_value'))),
          discountAmount: Math.max(0, numberValue(value(row, 'discount_amount'))),
          sellingPrice: Math.max(0, numberValue(value(row, 'selling_price'), Number(plan?.price || service.defaultSellingPrice))),
          costPrice: Math.max(0, numberValue(value(row, 'cost_price'), Number(plan?.costPrice || service.defaultCostPrice))),
          status: value(row, 'status') || 'active',
          notes: value(row, 'notes') || 'مستورد من CSV',
          createdBy: session.userId,
        } });
        created += 1;
      }
    } else if (input.dataSet === 'expenses') {
      const data = rows.map((row) => ({ tenantId, category: value(row, 'category', 'التصنيف') || 'عام', amount: Math.max(0, numberValue(value(row, 'amount', 'القيمة'))), date: dateValue(value(row, 'date', 'التاريخ')), notes: value(row, 'notes', 'ملاحظات') || null, createdBy: session.userId })).filter((item) => item.amount > 0);
      const result = await prisma.expense.createMany({ data }); created = result.count; skipped = rows.length - created;
    } else if (input.dataSet === 'recurring_expenses') {
      const allowedFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
      const data = rows.map((row) => {
        const startDate = dateValue(value(row, 'start_date'));
        const frequencyInput = value(row, 'frequency').toLowerCase();
        return {
          tenantId,
          category: value(row, 'category') || 'مصروف متكرر',
          amount: Math.max(0, numberValue(value(row, 'amount'))),
          frequency: allowedFrequencies.includes(frequencyInput) ? frequencyInput : 'monthly',
          interval: Math.max(1, Math.trunc(numberValue(value(row, 'interval'), 1))),
          startDate,
          nextRunAt: dateValue(value(row, 'next_run_at'), startDate),
          endDate: value(row, 'end_date') ? dateValue(value(row, 'end_date')) : null,
          isActive: booleanValue(value(row, 'is_active'), true),
          notes: value(row, 'notes') || null,
          createdBy: session.userId,
        };
      }).filter((item) => item.amount > 0);
      const result = await prisma.recurringExpense.createMany({ data });
      created = result.count;
      skipped = rows.length - created;
    } else {
      const data = rows.map((row) => ({ tenantId, platform: value(row, 'platform', 'المنصة') || 'أخرى', amount: Math.max(0, numberValue(value(row, 'amount', 'القيمة'))), date: dateValue(value(row, 'date', 'التاريخ')), notes: value(row, 'notes', 'ملاحظات') || null })).filter((item) => item.amount > 0);
      const result = await prisma.adCampaign.createMany({ data }); created = result.count; skipped = rows.length - created;
    }

    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'data.csv_imported',
      entityType: input.dataSet,
      metadata: { created, updated, skipped, rows: rows.length },
    });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/services');
    revalidatePath('/dashboard/manage');
    return { success: true, created, updated, skipped, total: rows.length };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'تعذر استيراد البيانات' };
  }
}

type RestoreResult = { dataSet: string; created: number; updated: number; skipped: number; total: number; success: boolean; error?: string };

function restoreRows(archive: MerchantRestoreBackup, key: string) {
  const rows = archive.sections[key];
  return Array.isArray(rows) ? rows as Array<Record<string, any>> : [];
}

function toTenantRow(row: Record<string, any>, tenantId: string, omit: string[] = []) {
  const copy = { ...row };
  delete copy.tenantId;
  for (const key of omit) delete copy[key];
  return { ...copy, tenantId };
}

async function importMerchantRestoreBackup(input: { archive: MerchantRestoreBackup; tenantId: string; userId: string }) {
  const { archive, tenantId, userId } = input;
  const results: RestoreResult[] = [];
  const rows = (key: string) => restoreRows(archive, key);
  const record = (dataSet: string, total: number, created: number) => results.push({ dataSet, total, created, updated: 0, skipped: Math.max(0, total - created), success: true });

  await prisma.$transaction(async (tx) => {
    const profile = rows('merchant_profile')[0];
    if (profile) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...profileData } = profile;
      await tx.tenant.update({ where: { id: tenantId }, data: profileData as any });
      record('merchant_profile', 1, 1);
    }

    const contacts = rows('contacts').map((row) => toTenantRow(row, tenantId));
    if (contacts.length) record('contacts', contacts.length, (await tx.tenantContact.createMany({ data: contacts as any, skipDuplicates: true })).count);
    const paymentMethods = rows('payment_methods').map((row) => toTenantRow(row, tenantId));
    if (paymentMethods.length) record('payment_methods', paymentMethods.length, (await tx.tenantPaymentMethod.createMany({ data: paymentMethods as any, skipDuplicates: true })).count);

    const bot = rows('bot_configuration')[0];
    if (bot) {
      const { automations: sourceAutomations, broadcasts: sourceBroadcasts, ...botData } = bot;
      const settings = await tx.botSettings.upsert({ where: { tenantId }, update: { ...botData, connectionStatus: 'disconnected', isActive: false } as any, create: { tenantId, ...botData, connectionStatus: 'disconnected', isActive: false } as any });
      const automations = Array.isArray(sourceAutomations) ? sourceAutomations.map((row: Record<string, any>) => ({ ...toTenantRow(row, tenantId), botSettingsId: settings.id })) : [];
      if (automations.length) await tx.botAutomation.createMany({ data: automations as any, skipDuplicates: true });
      const broadcasts = Array.isArray(sourceBroadcasts) ? sourceBroadcasts.map((row: Record<string, any>) => ({ ...toTenantRow(row, tenantId), botSettingsId: settings.id })) : [];
      if (broadcasts.length) await tx.botBroadcast.createMany({ data: broadcasts as any, skipDuplicates: true });
      record('bot_configuration', 1, 1);
    }

    const categories = rows('categories').map((row) => toTenantRow(row, tenantId));
    if (categories.length) record('categories', categories.length, (await tx.serviceCategory.createMany({ data: categories as any, skipDuplicates: true })).count);
    const serviceRows = rows('services');
    const services = serviceRows.map(({ plans: _plans, ...row }) => toTenantRow(row, tenantId));
    if (services.length) record('services', services.length, (await tx.service.createMany({ data: services as any, skipDuplicates: true })).count);
    const plans = serviceRows.flatMap((service) => Array.isArray(service.plans) ? service.plans.map((plan: Record<string, any>) => toTenantRow(plan, tenantId)) : []);
    if (plans.length) record('services', plans.length, (await tx.servicePlan.createMany({ data: plans as any, skipDuplicates: true })).count);

    const customers = rows('customers').map((row) => toTenantRow(row, tenantId, ['assignedToId', 'createdBy']));
    if (customers.length) record('customers', customers.length, (await tx.customer.createMany({ data: customers as any, skipDuplicates: true })).count);
    const subscriptions = rows('subscriptions').map((row) => toTenantRow(row, tenantId, ['createdBy']));
    if (subscriptions.length) record('subscriptions', subscriptions.length, (await tx.subscription.createMany({ data: subscriptions as any, skipDuplicates: true })).count);
    const interests = rows('interests').map((row) => toTenantRow(row, tenantId));
    if (interests.length) record('interests', interests.length, (await tx.serviceInterest.createMany({ data: interests as any, skipDuplicates: true })).count);

    const orderRows = rows('orders');
    const orders = orderRows.map(({ inputValues: _inputValues, events: _events, ...row }) => toTenantRow(row, tenantId, ['assignedToId']));
    if (orders.length) record('orders', orders.length, (await tx.order.createMany({ data: orders as any, skipDuplicates: true })).count);
    const inputs = orderRows.flatMap((order) => Array.isArray(order.inputValues) ? order.inputValues.map((row: Record<string, any>) => toTenantRow(row, tenantId)) : []);
    if (inputs.length) record('orders', inputs.length, (await tx.orderInputValue.createMany({ data: inputs as any, skipDuplicates: true })).count);
    const events = orderRows.flatMap((order) => Array.isArray(order.events) ? order.events.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['actorId'])) : []);
    if (events.length) record('orders', events.length, (await tx.orderEvent.createMany({ data: events as any, skipDuplicates: true })).count);

    const accountRows = rows('account_pool');
    const accountPool = accountRows.map(({ allocations: _allocations, ...row }) => toTenantRow(row, tenantId));
    if (accountPool.length) record('account_pool', accountPool.length, (await tx.accountPool.createMany({ data: accountPool as any, skipDuplicates: true })).count);
    const allocations = accountRows.flatMap((account) => Array.isArray(account.allocations) ? account.allocations.map((row: Record<string, any>) => toTenantRow(row, tenantId)) : []);
    if (allocations.length) record('account_pool', allocations.length, (await tx.deliveryAllocation.createMany({ data: allocations as any, skipDuplicates: true })).count);

    const wallet = rows('wallet')[0] || {};
    const walletTransactions = Array.isArray(wallet.walletTransactions) ? wallet.walletTransactions.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['createdById'])) : [];
    if (walletTransactions.length) record('wallet', walletTransactions.length, (await tx.walletTransaction.createMany({ data: walletTransactions as any, skipDuplicates: true })).count);
    const paymentRequests = Array.isArray(wallet.paymentRequests) ? wallet.paymentRequests.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['approvedById'])) : [];
    if (paymentRequests.length) record('wallet', paymentRequests.length, (await tx.paymentRequest.createMany({ data: paymentRequests as any, skipDuplicates: true })).count);

    const operations = rows('customer_operations')[0] || {};
    const tasks = Array.isArray(operations.tasks) ? operations.tasks.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['assignedToId', 'createdById'])) : [];
    if (tasks.length) record('customer_operations', tasks.length, (await tx.task.createMany({ data: tasks as any, skipDuplicates: true })).count);
    const deals = Array.isArray(operations.deals) ? operations.deals.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['ownerId'])) : [];
    if (deals.length) record('customer_operations', deals.length, (await tx.deal.createMany({ data: deals as any, skipDuplicates: true })).count);
    const activities = Array.isArray(operations.activities) ? operations.activities.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['userId'])) : [];
    if (activities.length) record('customer_operations', activities.length, (await tx.customerActivity.createMany({ data: activities as any, skipDuplicates: true })).count);

    const messages = rows('messages')[0] || {};
    const templates = Array.isArray(messages.templates) ? messages.templates.map((row: Record<string, any>) => toTenantRow(row, tenantId)) : [];
    if (templates.length) record('messages', templates.length, (await tx.messageTemplate.createMany({ data: templates as any, skipDuplicates: true })).count);
    const notifications = Array.isArray(messages.notifications) ? messages.notifications.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['userId'])) : [];
    if (notifications.length) record('messages', notifications.length, (await tx.notification.createMany({ data: notifications as any, skipDuplicates: true })).count);

    const warrantyRows = rows('warranties');
    const warrantyCases = warrantyRows.map(({ events: _events, ...row }) => toTenantRow(row, tenantId, ['assignedToId']));
    if (warrantyCases.length) record('warranties', warrantyCases.length, (await tx.warrantyCase.createMany({ data: warrantyCases as any, skipDuplicates: true })).count);
    const warrantyEvents = warrantyRows.flatMap((warranty) => Array.isArray(warranty.events) ? warranty.events.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['actorId'])) : []);
    if (warrantyEvents.length) record('warranties', warrantyEvents.length, (await tx.warrantyEvent.createMany({ data: warrantyEvents as any, skipDuplicates: true })).count);

    const financials = rows('financials')[0] || {};
    const recurringExpenses = Array.isArray(financials.recurringExpenses) ? financials.recurringExpenses.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['createdBy'])) : [];
    if (recurringExpenses.length) record('financials', recurringExpenses.length, (await tx.recurringExpense.createMany({ data: recurringExpenses as any, skipDuplicates: true })).count);
    const expenses = Array.isArray(financials.expenses) ? financials.expenses.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['createdBy'])) : [];
    if (expenses.length) record('financials', expenses.length, (await tx.expense.createMany({ data: expenses as any, skipDuplicates: true })).count);
    const advertising = Array.isArray(financials.advertising) ? financials.advertising.map((row: Record<string, any>) => toTenantRow(row, tenantId)) : [];
    if (advertising.length) record('financials', advertising.length, (await tx.adCampaign.createMany({ data: advertising as any, skipDuplicates: true })).count);

    const tickets = rows('support');
    let ticketsCreated = 0;
    let messagesCreated = 0;
    for (const ticket of tickets) {
      const { messages: sourceMessages, createdById: _createdById, ...ticketData } = ticket;
      try {
        await tx.supportTicket.create({ data: { ...toTenantRow(ticketData, tenantId), createdById: userId } as any });
        ticketsCreated += 1;
        if (Array.isArray(sourceMessages)) {
          const createdMessages = await tx.supportMessage.createMany({ data: sourceMessages.map((row: Record<string, any>) => toTenantRow(row, tenantId, ['authorId'])) as any, skipDuplicates: true });
          messagesCreated += createdMessages.count;
        }
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
      }
    }
    if (tickets.length) record('support', tickets.length + tickets.flatMap((ticket) => Array.isArray(ticket.messages) ? ticket.messages : []).length, ticketsCreated + messagesCreated);

    const referral = rows('referral_wallet')[0];
    if (referral) {
      const { walletEntries: sourceEntries, payoutRequests: sourcePayouts, attributions: _sourceAttributions, tenantId: _tenantId, id: _programId, ...programData } = referral;
      const program = await tx.referralProgram.upsert({
        where: { tenantId },
        update: programData as any,
        create: { ...programData, tenantId } as any,
      });
      const payouts = Array.isArray(sourcePayouts) ? sourcePayouts.map((row: Record<string, any>) => toTenantRow({ ...row, programId: program.id }, tenantId, ['processedById'])) : [];
      if (payouts.length) await tx.referralPayoutRequest.createMany({ data: payouts as any, skipDuplicates: true });
      const entries = Array.isArray(sourceEntries) ? sourceEntries.map((row: Record<string, any>) => toTenantRow({ ...row, programId: program.id }, tenantId, ['attributionId'])) : [];
      if (entries.length) await tx.referralWalletTransaction.createMany({ data: entries as any, skipDuplicates: true });
      record('referral_wallet', 1 + payouts.length + entries.length, 1 + payouts.length + entries.length);
    }
  }, { isolationLevel: 'Serializable', timeout: 30000 });

  return results;
}

export async function importMerchantBackup(input: { content: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('dashboard');
    const restoreArchive = parseMerchantRestoreBackup(input.content);
    if (restoreArchive) {
      const results = await importMerchantRestoreBackup({ archive: restoreArchive, tenantId, userId: session.userId });
      const created = results.reduce((sum, result) => sum + result.created, 0);
      const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
      await writeAuditLog({ tenantId, userId: session.userId, action: 'data.restore_backup_imported', entityType: 'merchant_restore_backup', metadata: { created, skipped, sections: results.map(({ dataSet, total }) => ({ dataSet, total })), backupCreatedAt: restoreArchive.createdAt } });
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/settings');
      return { success: true, created, updated: 0, skipped, results };
    }
    const archive = parseMerchantBackup(input.content);
    const results: Array<{ dataSet: DataSet; created: number; updated: number; skipped: number; total: number; success: boolean; error?: string }> = [];

    for (const entry of archive.entries) {
      const rows = parseCsv(entry.content);
      if (!rows.length) {
        results.push({ dataSet: entry.dataSet, created: 0, updated: 0, skipped: 0, total: 0, success: true });
        continue;
      }
      const result = await importMerchantCsv(entry);
      results.push({
        dataSet: entry.dataSet,
        created: result.success ? result.created ?? 0 : 0,
        updated: result.success ? result.updated ?? 0 : 0,
        skipped: result.success ? result.skipped ?? 0 : 0,
        total: result.success ? result.total ?? rows.length : rows.length,
        success: result.success,
        ...(result.success ? {} : { error: result.error || 'تعذر استيراد هذا القسم' }),
      });
    }

    const created = results.reduce((sum, result) => sum + result.created, 0);
    const updated = results.reduce((sum, result) => sum + result.updated, 0);
    const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
    const failed = results.filter((result) => !result.success);
    await writeAuditLog({
      tenantId,
      userId: session.userId,
      action: 'data.full_backup_imported',
      entityType: 'merchant_backup',
      metadata: { created, updated, skipped, sections: results.map(({ dataSet, success, total }) => ({ dataSet, success, total })), backupCreatedAt: archive.createdAt },
    });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/settings');
    return { success: failed.length === 0, created, updated, skipped, results, error: failed.length ? 'تم استيراد بعض الأقسام وتعذر استيراد أقسام أخرى.' : undefined };
  } catch (error) {
    return { success: false, created: 0, updated: 0, skipped: 0, results: [], error: error instanceof Error ? error.message : 'تعذر استيراد النسخة الاحتياطية' };
  }
}
