'use client';

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCheck, Pencil, RefreshCw, Search, Send, Tag, X } from 'lucide-react';
import { getCustomers, updateCustomer } from '@/app/actions/merchant';
import { bulkUpdateCustomers, sendTelegramBulkMessage } from '@/app/actions/customer-engagement';

type Customer = {
  id: string; name: string; phone: string; email?: string | null; company?: string | null; notes?: string | null;
  stage: string; source?: string | null; tags: string[]; walletBalance: number;
  _count?: { subscriptions: number; tasks: number; deals: number };
};
type BulkMode = 'tag' | 'stage' | 'telegram' | null;

const empty = { name: '', phone: '', email: '', company: '', notes: '', stage: 'customer', source: '', tags: '' };
const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/70';
const stageLabels: Record<string, string> = { lead: 'مهتم', qualified: 'مؤهل', customer: 'عميل', inactive: 'غير نشط' };

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء. حاول مرة أخرى.';
}

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyCustomerId = searchParams.get('customerId');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkMode>(null);
  const [bulkTag, setBulkTag] = useState('');
  const [bulkStage, setBulkStage] = useState('customer');
  const [bulkMessage, setBulkMessage] = useState('مرحبًا {customer_name}، نود مشاركتك آخر التحديثات والعروض المتاحة لدينا.');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(empty);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => { if (legacyCustomerId) router.replace(`/dashboard/customers/${legacyCustomerId}`); }, [legacyCustomerId, router]);
  const refresh = async () => {
    setLoading(true);
    const result = await getCustomers({ search: query, pageSize: 100 });
    if (result.success) setCustomers(result.customers as Customer[]); else setNotice(result.error || 'تعذر جلب العملاء.');
    setLoading(false);
  };
  useEffect(() => { if (!legacyCustomerId) void refresh(); }, [legacyCustomerId]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    customers.forEach((customer) => customer.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')).slice(0, 14);
  }, [customers]);
  const visibleCustomers = useMemo(() => tagFilter ? customers.filter((customer) => customer.tags.includes(tagFilter)) : customers, [customers, tagFilter]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedCount = visibleCustomers.filter((customer) => selectedSet.has(customer.id)).length;

  const toggleCustomer = (customerId: string) => setSelectedIds((ids) => ids.includes(customerId) ? ids.filter((id) => id !== customerId) : [...ids, customerId]);
  const toggleVisible = () => setSelectedIds((ids) => {
    const visibleIds = visibleCustomers.map((customer) => customer.id);
    const allSelected = visibleIds.every((id) => ids.includes(id));
    return allSelected ? ids.filter((id) => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])];
  });
  const begin = (customer: Customer) => {
    setEditing(customer);
    setForm({ name: customer.name, phone: customer.phone, email: customer.email || '', company: customer.company || '', notes: customer.notes || '', stage: customer.stage, source: customer.source || '', tags: customer.tags.join(', ') });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    startTransition(async () => {
      const result = await updateCustomer(editing.id, { ...form, tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean) });
      if (result.success) { setNotice('تم حفظ بيانات العميل وتسجيل التعديل في ملفه.'); setEditing(null); await refresh(); }
      else setNotice(result.error || 'تعذر حفظ البيانات.');
    });
  };
  const runBulk = (action: 'tag' | 'stage' | 'contact') => startTransition(async () => {
    try {
      const result = await bulkUpdateCustomers({
        customerIds: selectedIds,
        ...(action === 'tag' ? { addTags: bulkTag.split(',').map((tag) => tag.trim()).filter(Boolean) } : {}),
        ...(action === 'stage' ? { stage: bulkStage } : {}),
        ...(action === 'contact' ? { markContacted: true } : {}),
      });
      setNotice(`تم تنفيذ الإجراء على ${result.updated} عميل وتسجيله في ملفاتهم.`);
      setSelectedIds([]); setBulkMode(null); setBulkTag('');
      await refresh();
    } catch (error) { setNotice(messageFromError(error)); }
  });
  const sendTelegram = () => startTransition(async () => {
    try {
      const result = await sendTelegramBulkMessage({ customerIds: selectedIds, message: bulkMessage });
      setNotice(`تم إرسال الرسالة إلى ${result.delivered} عميل${result.failed ? `، وتعذر إرسالها إلى ${result.failed}` : ''}${result.skipped ? `، وتخطي ${result.skipped} لعدم ربط تيليجرام` : ''}.`);
      setSelectedIds([]); setBulkMode(null);
      await refresh();
    } catch (error) { setNotice(messageFromError(error)); }
  });

  if (legacyCustomerId) return <main className="grid min-h-64 place-items-center" dir="rtl"><p className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-sm font-bold text-zinc-300">جارٍ فتح ملف العميل…</p></main>;

  return <main className="mx-auto max-w-7xl space-y-6 pb-12" dir="rtl">
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black tracking-tight text-white">العملاء</h1><p className="mt-2 text-sm font-medium text-zinc-400">اعرض شرائح العملاء، نفّذ إجراءً جماعيًا، وافتح ملف كل عميل لمعرفة كل تعاملاته.</p></div><form onSubmit={(event) => { event.preventDefault(); void refresh(); }} className="flex w-full gap-2 sm:w-auto"><label className="relative flex-1 sm:w-80"><Search className="absolute right-3 top-3.5 h-4 w-4 text-zinc-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pr-10`} placeholder="ابحث بالاسم أو الرقم" /></label><button className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400">بحث</button><button type="button" onClick={() => void refresh()} aria-label="تحديث العملاء" className="rounded-xl border border-zinc-700 px-3 text-zinc-300 hover:bg-zinc-800"><RefreshCw className="h-4 w-4" /></button></form></header>

    {notice ? <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="إغلاق"><X className="h-4 w-4" /></button></div> : null}

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-black text-white"><Tag className="h-4 w-4 text-emerald-300" />شرائح العملاء</h2><p className="mt-1 text-xs text-zinc-500">فلتر العملاء بوسم، ثم اختر المجموعة التي تريد العمل عليها.</p></div><button type="button" onClick={toggleVisible} disabled={!visibleCustomers.length} className="rounded-xl border border-zinc-700 px-3.5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-40">{visibleSelectedCount === visibleCustomers.length && visibleCustomers.length ? 'إلغاء اختيار المعروض' : 'اختيار المعروض'} ({visibleCustomers.length})</button></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setTagFilter('')} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${!tagFilter ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-800'}`}>كل العملاء <span className="mr-1 text-zinc-500">{customers.length}</span></button>{tagOptions.map(([tag, count]) => <button key={tag} type="button" onClick={() => setTagFilter(tag)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${tagFilter === tag ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-800'}`}>{tag} <span className="mr-1 text-zinc-500">{count}</span></button>)}</div></section>

    {selectedIds.length ? <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-emerald-100">تم اختيار {selectedIds.length} عميل</p><p className="mt-1 text-xs text-emerald-200/70">ستُسجل كل عملية في سجل العميل تلقائيًا.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setBulkMode('tag')} className="rounded-xl border border-emerald-500/35 px-3 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/10">إضافة وسم</button><button type="button" onClick={() => setBulkMode('stage')} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800">تغيير المرحلة</button><button type="button" disabled={pending} onClick={() => runBulk('contact')} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"><CheckCheck className="ml-1 inline h-4 w-4 text-emerald-300" />تسجيل متابعة</button><button type="button" onClick={() => setBulkMode('telegram')} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-black text-zinc-950 hover:bg-emerald-400"><Send className="ml-1 inline h-4 w-4" />رسالة تيليجرام</button><button type="button" onClick={() => { setSelectedIds([]); setBulkMode(null); }} className="px-2 text-sm font-bold text-zinc-400 hover:text-white">إلغاء</button></div></div>
      {bulkMode === 'tag' ? <div className="mt-4 grid gap-2 border-t border-emerald-500/20 pt-4 sm:grid-cols-[minmax(0,1fr)_auto]"><input value={bulkTag} onChange={(event) => setBulkTag(event.target.value)} className={inputClass} placeholder="مثال: VIP، تجديد قريب" /><button type="button" disabled={pending || !bulkTag.trim()} onClick={() => runBulk('tag')} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">تطبيق الوسم</button></div> : null}
      {bulkMode === 'stage' ? <div className="mt-4 grid gap-2 border-t border-emerald-500/20 pt-4 sm:grid-cols-[minmax(0,1fr)_auto]"><select value={bulkStage} onChange={(event) => setBulkStage(event.target.value)} className={inputClass}><option value="lead">مهتم</option><option value="qualified">مؤهل</option><option value="customer">عميل</option><option value="inactive">غير نشط</option></select><button type="button" disabled={pending} onClick={() => runBulk('stage')} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">حفظ المرحلة</button></div> : null}
      {bulkMode === 'telegram' ? <div className="mt-4 border-t border-emerald-500/20 pt-4"><label className="block text-sm font-bold text-zinc-200">رسالة تيليجرام <span className="font-normal text-zinc-500">(يمكن استخدام {'{customer_name}'})</span></label><textarea value={bulkMessage} onChange={(event) => setBulkMessage(event.target.value)} rows={4} className={`mt-2 ${inputClass}`} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-zinc-500">تصل الرسالة فقط للعملاء الذين ربطوا تيليجرام بالبوت.</p><button type="button" disabled={pending || bulkMessage.trim().length < 3} onClick={sendTelegram} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">إرسال وتسجيل النتيجة</button></div></div> : null}
    </section> : null}

    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-52 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/45" />)}</div> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleCustomers.map((customer) => <article key={customer.id} className={`flex min-h-56 flex-col rounded-2xl border bg-zinc-900/55 p-5 transition-colors ${selectedSet.has(customer.id) ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><input type="checkbox" checked={selectedSet.has(customer.id)} onChange={() => toggleCustomer(customer.id)} aria-label={`اختيار ${customer.name}`} className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" /><Link href={`/dashboard/customers/${customer.id}`} className="flex min-w-0 items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 font-black text-zinc-950">{customer.name.slice(0, 1)}</span><div className="min-w-0"><h2 className="truncate font-black text-white transition-colors hover:text-emerald-300">{customer.name}</h2><p dir="ltr" className="mt-1 text-sm text-zinc-500">{customer.phone}</p></div></Link></div><button onClick={() => begin(customer)} aria-label={`تعديل ${customer.name}`} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><Pencil className="h-4 w-4" /></button></div><p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">{customer.notes || 'لا توجد ملاحظات مسجلة.'}</p><div className="mt-4 flex flex-wrap gap-2 text-xs">{customer.tags.slice(0, 3).map((tag) => <button type="button" onClick={() => setTagFilter(tag)} key={tag} className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-bold text-zinc-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-200">{tag}</button>)}{customer.tags.length > 3 ? <span className="rounded-full bg-zinc-800 px-2.5 py-1 font-bold text-zinc-400">+{customer.tags.length - 3}</span> : null}<span className="rounded-full bg-zinc-800 px-2.5 py-1 font-bold text-zinc-300">{customer._count?.subscriptions || 0} اشتراك</span><span className="rounded-full bg-zinc-800 px-2.5 py-1 font-bold text-zinc-300">{stageLabels[customer.stage] || customer.stage}</span></div><Link href={`/dashboard/customers/${customer.id}`} className="mt-auto inline-flex items-center justify-between border-t border-zinc-800 pt-4 text-sm font-black text-emerald-300 hover:text-emerald-200"><span>فتح ملف العميل</span><ArrowLeft className="h-4 w-4" /></Link></article>)}{!visibleCustomers.length ? <div className="col-span-full rounded-2xl border border-dashed border-zinc-700 px-5 py-14 text-center text-sm font-bold text-zinc-500">لا توجد نتائج ضمن هذا الفلتر.</div> : null}</section>}

    {editing ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(null); }}><form onSubmit={save} role="dialog" aria-modal="true" className="mx-auto my-4 w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/50 sm:my-8 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">تعديل {editing.name}</h2><p className="mt-1 text-sm text-zinc-500">أو افتح ملف العميل لرؤية كل سجل التعاملات.</p></div><button type="button" onClick={() => setEditing(null)} aria-label="إغلاق" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="الاسم" /><input required dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={inputClass} placeholder="الهاتف" /><input dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} placeholder="البريد الإلكتروني" /><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} className={inputClass} placeholder="الشركة" /></div><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className={`mt-3 ${inputClass}`} placeholder="وسوم مفصولة بفاصلة: مهم، تجديد" /><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`mt-3 min-h-32 ${inputClass}`} placeholder="ملاحظات وتفاصيل المتابعة" /><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800">إلغاء</button><button disabled={pending} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">{pending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button></div></form></div> : null}
  </main>;
}
