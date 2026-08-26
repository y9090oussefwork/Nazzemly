'use client';

import { ChangeEvent, useState, useTransition } from 'react';
import { CheckCircle2, Download, FileArchive, FileCheck2, FileUp, ShieldCheck, Upload, X } from 'lucide-react';
import { exportMerchantBackup, importMerchantBackup } from '@/app/actions/data-transfer';
import HelpTip from '@/app/dashboard/help-tip';

type BackupPreview = { createdAt: string | null; sections: Array<{ id: string; label: string; rows: number }> };
type ImportResult = { dataSet: string; created: number; updated: number; skipped: number; total: number; success: boolean; error?: string };

const legacySectionLabels: Record<string, string> = {
  customers: 'العملاء',
  services: 'الخدمات والمخزون',
  subscriptions: 'الاشتراكات',
  expenses: 'المصروفات',
  recurring_expenses: 'المصروفات المتكررة',
  advertising: 'الإعلانات',
};

const restoreSectionLabels: Record<string, string> = {
  merchant_profile: 'بيانات المتجر', contacts: 'وسائل التواصل', payment_methods: 'طرق الدفع', bot_configuration: 'إعدادات البوت', categories: 'تصنيفات الخدمات', services: 'الخدمات والباقات', customers: 'العملاء', subscriptions: 'الاشتراكات', interests: 'طلبات الاهتمام بالخدمات', orders: 'الطلبات والتنفيذ', account_pool: 'المخزون والتسليم', wallet: 'محافظ العملاء وطلبات الشحن', customer_operations: 'المهام والصفقات وسجل العملاء', messages: 'القوالب والإشعارات', warranties: 'الضمانات والمشكلات', financials: 'البيانات المالية', support: 'تذاكر الدعم',
};

function previewBackup(content: string): BackupPreview {
  const archive = JSON.parse(content) as { format?: string; version?: number; createdAt?: string; data?: Record<string, unknown>; sections?: Record<string, unknown> };
  if (archive.format !== 'nazzemly-data-backup' || !archive.version) {
    throw new Error('اختر ملف نسخة احتياطية تم تنزيله من Nazzemly.');
  }
  const sections = archive.version === 2 && archive.sections && typeof archive.sections === 'object'
    ? Object.entries(restoreSectionLabels).flatMap(([id, label]) => {
        const items = archive.sections?.[id];
        return Array.isArray(items) ? [{ id, label, rows: items.length }] : [];
      })
    : archive.version === 1 && archive.data && typeof archive.data === 'object'
      ? Object.entries(legacySectionLabels).flatMap(([id, label]) => {
          const csv = archive.data?.[id];
          if (typeof csv !== 'string') return [];
          const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
          return [{ id, label, rows: Math.max(0, lines.length - 1) }];
        })
      : [];
  if (!sections.length) throw new Error('لا يحتوي الملف على أقسام بيانات قابلة للاستيراد.');
  return { createdAt: typeof archive.createdAt === 'string' ? archive.createdAt : null, sections };
}

function formatDate(value: string | null) {
  if (!value) return 'غير معروف';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'غير معروف' : date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DataTransferPage() {
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [lastResult, setLastResult] = useState<ImportResult[] | null>(null);

  const download = () => startTransition(async () => {
    const result = await exportMerchantBackup();
    if (!result.success || !result.content || !result.fileName) {
      setNotice(result.error || 'تعذر تجهيز النسخة الاحتياطية.');
      return;
    }
    const url = URL.createObjectURL(new Blob([result.content], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice('تم تنزيل ملف النسخة الاحتياطية الشامل. احتفظ به في مكان آمن.');
  });

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setNotice('');
    setLastResult(null);
    if (!selectedFile) { setFile(null); setPreview(null); return; }
    try {
      const content = await selectedFile.text();
      setPreview(previewBackup(content));
      setFile(selectedFile);
    } catch (error) {
      setFile(null);
      setPreview(null);
      setNotice(error instanceof Error ? error.message : 'تعذر قراءة الملف.');
      event.target.value = '';
    }
  };

  const importFile = () => startTransition(async () => {
    if (!file) return;
    const result = await importMerchantBackup({ content: await file.text() });
    setLastResult(result.results as ImportResult[]);
    setNotice(result.success
      ? `اكتمل الاستيراد بأمان: ${result.created} جديد، ${result.updated} محدث، ${result.skipped} تم تجاوزه.`
      : result.error || 'تعذر إكمال الاستيراد. راجع نتيجة كل قسم بالأسفل.');
    if (result.success) { setFile(null); setPreview(null); }
  });

  return <section dir="rtl" className="mx-auto max-w-5xl space-y-6 pb-12">
    <header className="border-b border-zinc-800 pb-6">
      <h1 className="text-3xl font-black text-white">مركز البيانات</h1>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-300">نزّل نسخة استرداد واحدة لسجل متجرك التشغيلي، أو استوردها من مكان واحد. لا يحذف الاستيراد أي بيانات موجودة.</p>
    </header>

    {notice ? <div role="status" className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="إغلاق الرسالة" className="shrink-0 text-emerald-200 hover:text-white"><X className="h-4 w-4" /></button></div> : null}

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300"><FileArchive className="h-5 w-5" /></span>
        <h2 className="mt-5 text-xl font-black text-white">تصدير نسخة الاسترداد</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-300">ملف واحد يشمل هوية المتجر، العملاء، الخدمات، الطلبات، المخزون، المحافظ، السجل المالي والدعم.</p>
        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-6 text-zinc-300"><ShieldCheck className="ml-1 inline h-4 w-4 text-emerald-300" />لا يشمل كلمات المرور أو رمز البوت السري. بعد الاسترداد أدخل رمز البوت من الإعدادات لتفعيله مجددًا.</div>
        <button type="button" disabled={isPending} onClick={download} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"><Download className="h-4 w-4" />{isPending ? 'جارٍ تجهيز الملف…' : 'تنزيل نسخة الاسترداد'}</button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/10 text-sky-300"><FileUp className="h-5 w-5" /></span>
        <h2 className="mt-5 text-xl font-black text-white">استيراد نسخة الاسترداد</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-300">ارفع ملف Nazzemly نفسه. تظهر معاينة للأقسام قبل بدء الاستيراد، والنسخ القديمة مدعومة أيضًا.</p>
        <label className="mt-5 grid min-h-28 cursor-pointer place-items-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 p-4 text-center transition-colors hover:border-emerald-500/50 focus-within:border-emerald-500/70"><input accept=".json,application/json" type="file" onChange={chooseFile} className="sr-only" /><span><Upload className="mx-auto h-6 w-6 text-zinc-400" /><b className="mt-2 block text-sm text-zinc-200">{file ? file.name : 'اختر ملف النسخة الاحتياطية'}</b><small className="mt-1 block text-xs text-zinc-500">صيغة Nazzemly JSON، حتى 40 ميجابايت</small></span></label>
      </div>
    </section>

    {preview ? <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-black text-white"><FileCheck2 className="h-5 w-5 text-sky-300" />معاينة قبل الاستيراد</h2><p className="mt-1 text-sm text-sky-100/75">تاريخ إنشاء الملف: {formatDate(preview.createdAt)}</p></div><button type="button" disabled={isPending} onClick={importFile} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"><Upload className="h-4 w-4" />{isPending ? 'جارٍ الاستيراد…' : 'بدء الاسترداد الآمن'}</button></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{preview.sections.map((section) => <div key={section.id} className="rounded-xl border border-sky-500/15 bg-zinc-950/50 px-3 py-3"><p className="text-sm font-bold text-zinc-100">{section.label}</p><p className="mt-1 text-xs text-zinc-300">{section.rows.toLocaleString('ar-EG')} سجل</p></div>)}</div><p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs leading-6 text-amber-100">أفضل استخدام للاسترداد هو متجر جديد أو فارغ. لا يحذف النظام أي بيانات قائمة، ويتجاوز السجلات المطابقة بدل تكرارها.<HelpTip text="لأمان الحسابات لا يعاد استيراد كلمات المرور أو رمز بوت تيليجرام السري؛ تُدخل هذه المعلومات بعد الاسترداد من الإعدادات." /></p></section> : null}

    {lastResult ? <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="text-lg font-black text-white">نتيجة الاستيراد</h2><div className="mt-4 divide-y divide-zinc-800">{lastResult.map((result) => <div key={result.dataSet} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-bold text-zinc-100">{restoreSectionLabels[result.dataSet] || legacySectionLabels[result.dataSet] || result.dataSet}</p><p className={`mt-1 text-xs ${result.success ? 'text-zinc-400' : 'text-rose-200'}`}>{result.success ? `${result.created} جديد · ${result.updated} محدث · ${result.skipped} تم تجاوزه` : result.error || 'تعذر الاستيراد'}</p></div>{result.success ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <X className="h-5 w-5 text-rose-300" />}</div>)}</div></section> : null}
  </section>;
}
