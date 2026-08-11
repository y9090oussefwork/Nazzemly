'use client';

import { ChangeEvent, useState, useTransition } from 'react';
import { Download, FileSpreadsheet, Import, Sheet, Upload } from 'lucide-react';
import { DataSet, exportMerchantCsv, importMerchantCsv } from '@/app/actions/data-transfer';
import HelpTip from '@/app/dashboard/help-tip';

const dataSets: Array<{ id: DataSet; label: string; description: string }> = [
  { id: 'customers', label: 'العملاء', description: 'الأسماء والهواتف والمراحل والوسوم والملاحظات' },
  { id: 'services', label: 'الخدمات والمخزون', description: 'التصنيفات والخدمات والمميزات والمدد والأسعار والمخزون' },
  { id: 'subscriptions', label: 'الاشتراكات', description: 'العميل والخدمة والمدة والتواريخ والأسعار والحالة' },
  { id: 'expenses', label: 'المصروفات', description: 'التصنيف والقيمة والتاريخ والملاحظات' },
  { id: 'recurring_expenses', label: 'المصروفات المتكررة', description: 'القيمة والتكرار والاستحقاق والحالة والملاحظات' },
  { id: 'advertising', label: 'الإعلانات', description: 'المنصة والإنفاق والتاريخ والنتائج المكتوبة' },
];

export default function DataTransferPage() {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<DataSet>('customers');
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState('');

  const download = (dataSet: DataSet) => startTransition(async () => {
    const result = await exportMerchantCsv(dataSet);
    if (!result.success || !result.content || !result.fileName) {
      setNotice(result.error || 'تعذر تصدير الملف.');
      return;
    }
    const url = URL.createObjectURL(new Blob([result.content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`تم تجهيز ملف ${dataSets.find((item) => item.id === dataSet)?.label}.`);
  });

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null);
  const upload = () => startTransition(async () => {
    if (!file) { setNotice('اختر ملف CSV أولاً.'); return; }
    const content = await file.text();
    const result = await importMerchantCsv({ dataSet: selected, content });
    setNotice(result.success
      ? `اكتمل الاستيراد: ${result.created} جديد، ${result.updated} محدث، ${result.skipped} تم تجاوزه.`
      : result.error || 'تعذر استيراد الملف.');
    if (result.success) setFile(null);
  });

  return <section dir="rtl" className="mx-auto max-w-7xl space-y-6">
    <header className="border-b border-zinc-800 pb-6"><p className="text-sm font-bold text-emerald-400">يعمل مع Excel وGoogle Sheets</p><h1 className="mt-2 text-3xl font-black">استيراد وتصدير بيانات المتجر</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">ملفات CSV مجانية وخفيفة؛ افتحها مباشرة في Excel، أو ارفعها إلى Google Sheets، وعدّلها ثم أعد استيرادها.</p></header>
    {notice ? <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm"><span>{notice}</span><button onClick={() => setNotice('')} className="text-zinc-400">إغلاق</button></div> : null}

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-5 flex items-center gap-2"><Download className="h-5 w-5 text-emerald-400" /><h2 className="text-xl font-black">تصدير نسخة من بياناتك</h2><HelpTip text="التصدير لا يغيّر أي بيانات. يمكنك الاحتفاظ بالملفات كنسخة احتياطية أو فتحها في أي برنامج جداول." /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dataSets.map((item) => <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"><FileSpreadsheet className="h-5 w-5 text-emerald-400" /><h3 className="mt-3 font-black">{item.label}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-zinc-500">{item.description}</p><button disabled={isPending} onClick={() => download(item.id)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm font-bold transition-colors duration-150 hover:bg-zinc-900 active:scale-[0.98] disabled:opacity-50"><Download className="h-4 w-4" />تنزيل CSV</button></article>)}</div>
    </section>

    <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="mb-5 flex items-center gap-2"><Upload className="h-5 w-5 text-emerald-400" /><h2 className="text-xl font-black">استيراد ملف إلى النظام</h2><HelpTip text="يحدّث العملاء والخدمات الموجودة عند تطابق الهاتف أو اسم الخدمة، ويضيف البيانات الجديدة. الاشتراكات ذات رقم طلب مكرر يتم تجاوزها لحمايتك من التكرار." /></div>
        <label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">نوع البيانات داخل الملف</span><select value={selected} onChange={(event) => { setSelected(event.target.value as DataSet); setFile(null); }} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm outline-none focus:border-emerald-500/70">{dataSets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="grid min-h-44 cursor-pointer place-items-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-center transition-colors duration-150 hover:border-emerald-500/50"><input accept=".csv,text/csv" type="file" onChange={chooseFile} className="sr-only" /><span><Import className="mx-auto h-8 w-8 text-zinc-500" /><b className="mt-3 block">{file ? file.name : 'اضغط لاختيار ملف CSV'}</b><small className="mt-1 block text-zinc-500">الحد الأقصى 8 ميجابايت و5000 صف لكل مرة</small></span></label>
        <button disabled={isPending || !file} onClick={upload} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-colors duration-150 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"><Upload className="h-4 w-4" />استيراد ومراجعة النتائج</button>
      </div>

      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><Sheet className="h-7 w-7 text-emerald-400" /><h2 className="mt-4 text-xl font-black">الطريقة الأسهل</h2><ol className="mt-4 space-y-3 text-sm leading-7 text-zinc-300"><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">1.</b> نزّل أولاً الملف الحالي لنوع البيانات المطلوب.</li><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">2.</b> افتحه في Excel أو Google Sheets وعدّل الصفوف، مع إبقاء أسماء الأعمدة كما هي.</li><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">3.</b> من Google Sheets اختر: ملف ← تنزيل ← قيم مفصولة بفواصل CSV.</li><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">4.</b> اختر نفس نوع البيانات هنا وارفع الملف.</li></ol><p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-6 text-amber-200">ابدأ بملف صغير للتجربة. النظام لا يحذف البيانات القديمة عند الاستيراد.</p></aside>
    </section>
  </section>;
}
