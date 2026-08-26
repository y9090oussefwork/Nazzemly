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
    const { storeName } = await getActiveTenant('dashboard');
    const data: Partial<Record<DataSet, string>> = {};
    for (const dataSet of supportedDataSets) {
      const result = await exportMerchantCsv(dataSet);
      if (!result.success || !result.content) throw new Error(result.error || `تعذر تجهيز قسم ${dataSet}`);
      data[dataSet] = result.content;
    }
    const archive: MerchantBackup = { format: backupFormat, version: 1, createdAt: new Date().toISOString(), data };
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

export async function importMerchantBackup(input: { content: string }) {
  try {
    const { tenantId, session } = await getActiveTenant('dashboard');
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
