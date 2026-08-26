'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDollarSign,
  ClipboardList, CreditCard, FileText, History, Mail, MessageCircle, PackageCheck,
  Phone, RefreshCw, Send, ShieldCheck, UserRound, Wallet, X,
} from 'lucide-react';
import { getCustomerProfile, updateCustomer } from '@/app/actions/merchant';

type ProfileData = any;
type Tab = 'overview' | 'subscriptions' | 'financials' | 'history' | 'followUp';

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/15';
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'نظرة عامة' }, { id: 'subscriptions', label: 'الاشتراكات' },
  { id: 'financials', label: 'المدفوعات والمحفظة' }, { id: 'history', label: 'سجل العميل' },
  { id: 'followUp', label: 'المتابعة والصفقات' },
];

const statusLabel = (value?: string | null) => ({
  active: 'نشط', expired: 'منتهي', canceled: 'ملغي', cancelled: 'ملغي', paid: 'مدفوع', pending: 'بانتظار المراجعة',
  approved: 'معتمد', rejected: 'مرفوض', fulfilled: 'تم التنفيذ', processing_delivery: 'جاري التنفيذ',
  new: 'جديد', open: 'مفتوحة', completed: 'مكتملة', closed: 'مغلقة', resolved: 'تم الحل',
  customer: 'عميل', lead: 'مهتم', qualified: 'مؤهل', inactive: 'غير نشط',
}[value || ''] || value || '—');

const formatDate = (value?: string | Date | null, withTime = false) => value
  ? new Date(value).toLocaleString('ar-EG', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
  : '—';
const formatMoney = (value?: number | null) => `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
const phoneToWhatsApp = (phone?: string | null) => (phone || '').replace(/\D/g, '').replace(/^0/, '20');

function Status({ value }: { value?: string | null }) {
  const lowered = String(value || '').toLowerCase();
  const tone = /active|approved|paid|fulfilled|completed|resolved|won/.test(lowered)
    ? 'bg-emerald-500/10 text-emerald-300'
    : /cancel|reject|expired|lost|overdue/.test(lowered) ? 'bg-rose-500/10 text-rose-300'
      : 'bg-amber-500/10 text-amber-200';
  return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-black ${tone}`}>{statusLabel(value)}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-zinc-700 px-5 py-10 text-center text-sm font-semibold text-zinc-500">{children}</div>;
}

export default function CustomerProfile({ customerId }: { customerId: string }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', notes: '', stage: 'customer', source: '', tags: '' });

  const refresh = async () => {
    setLoading(true);
    const result = await getCustomerProfile(customerId);
    if (result.success) {
      const profile = result as ProfileData;
      setData(profile);
      setForm({
        name: profile.customer.name || '', phone: profile.customer.phone || '', email: profile.customer.email || '',
        company: profile.customer.company || '', notes: profile.customer.notes || '', stage: profile.customer.stage || 'customer',
        source: profile.customer.source || '', tags: (profile.customer.tags || []).join(', '),
      });
      setNotice('');
    } else setNotice(result.error || 'تعذر تحميل ملف العميل.');
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, [customerId]);

  const summary = useMemo(() => {
    if (!data) return { activeSubscriptions: 0, pendingOrders: 0, totalOrders: 0, openWarranties: 0 };
    return {
      activeSubscriptions: data.subscriptions.filter((item: any) => item.status === 'active' && new Date(item.endDate) >= new Date()).length,
      pendingOrders: data.orders.filter((item: any) => !['fulfilled', 'cancelled'].includes(item.fulfillmentStatus)).length,
      totalOrders: data.orders.length,
      openWarranties: data.warrantyCases.filter((item: any) => !['closed', 'resolved'].includes(item.status)).length,
    };
  }, [data]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateCustomer(customerId, { ...form, tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean) });
      if (result.success) { setEditing(false); setNotice('تم حفظ بيانات العميل وملاحظاته.'); await refresh(); }
      else setNotice(result.error || 'تعذر حفظ بيانات العميل.');
    });
  };

  if (loading) return <main className="mx-auto max-w-7xl space-y-5" dir="rtl"><div className="h-10 w-44 animate-pulse rounded-lg bg-zinc-800" />{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/45" />)}</main>;
  if (!data) return <main className="mx-auto max-w-3xl space-y-5" dir="rtl"><Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-emerald-300"><ArrowRight className="h-4 w-4" />العودة إلى العملاء</Link><div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-7 text-center"><p className="font-black text-rose-200">{notice || 'تعذر فتح ملف العميل.'}</p><button onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-400/30 px-4 py-2.5 text-sm font-black text-rose-100 hover:bg-rose-500/10"><RefreshCw className="h-4 w-4" />إعادة المحاولة</button></div></main>;

  const { customer } = data;
  const whatsapp = phoneToWhatsApp(customer.phone);
  const customFields = customer.customFields && typeof customer.customFields === 'object' && !Array.isArray(customer.customFields) ? Object.entries(customer.customFields) : [];

  return <main className="mx-auto max-w-7xl space-y-6 pb-12" dir="rtl">
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><Link href="/dashboard/customers" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition-colors hover:text-emerald-300"><ArrowRight className="h-4 w-4" />كل العملاء</Link><h1 className="text-3xl font-black tracking-tight text-white">ملف العميل</h1><p className="mt-2 text-sm font-medium text-zinc-400">كل بيانات العميل واشتراكاته ومدفوعاته وسجل تعاملاته في مكان واحد.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-colors hover:bg-emerald-400"><UserRound className="h-4 w-4" />تعديل البيانات</button><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-800"><RefreshCw className="h-4 w-4" />تحديث</button></div>
    </header>

    {notice ? <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="إغلاق التنبيه" className="text-emerald-200 hover:text-white"><X className="h-4 w-4" /></button></div> : null}

    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/55">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-7">
        <div className="flex items-start gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-xl font-black text-zinc-950">{customer.name?.trim().slice(0, 1) || 'ع'}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-2xl font-black text-white">{customer.name}</h2><Status value={customer.stage} /></div><p className="mt-1 text-sm font-semibold text-zinc-400">{customer.company || 'عميل فردي'} · أضيف في {formatDate(customer.createdAt)}</p><div className="mt-4 flex flex-wrap gap-2">{(customer.tags || []).map((tag: string) => <span key={tag} className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-bold text-zinc-300">{tag}</span>)}{!(customer.tags || []).length ? <span className="text-xs text-zinc-600">لا توجد وسوم للعميل.</span> : null}</div></div></div>
        <div className="flex flex-wrap gap-2">{customer.phone ? <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3.5 py-2.5 text-sm font-bold text-zinc-200 hover:bg-zinc-800"><Phone className="h-4 w-4 text-emerald-300" />اتصال</a> : null}{whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 px-3.5 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/10"><MessageCircle className="h-4 w-4" />واتساب</a> : null}{customer.tgUsername ? <a href={`https://t.me/${String(customer.tgUsername).replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-sky-500/35 px-3.5 py-2.5 text-sm font-bold text-sky-200 hover:bg-sky-500/10"><Send className="h-4 w-4" />تيليجرام</a> : null}</div>
      </div>
      <div className="grid border-t border-zinc-800 sm:grid-cols-2 xl:grid-cols-4"><div className="p-4"><p className="text-xs font-bold text-zinc-500">رصيد المحفظة</p><p className="mt-2 text-xl font-black text-emerald-300">{formatMoney(customer.walletBalance)}</p></div><div className="border-t border-zinc-800 p-4 sm:border-r sm:border-t-0"><p className="text-xs font-bold text-zinc-500">اشتراكات نشطة</p><p className="mt-2 text-xl font-black">{summary.activeSubscriptions}</p></div><div className="border-t border-zinc-800 p-4 xl:border-r xl:border-t-0"><p className="text-xs font-bold text-zinc-500">طلبات تحت المتابعة</p><p className="mt-2 text-xl font-black text-amber-200">{summary.pendingOrders}</p></div><div className="border-t border-zinc-800 p-4 sm:border-r xl:border-r"><p className="text-xs font-bold text-zinc-500">بلاغات الضمان المفتوحة</p><p className="mt-2 text-xl font-black text-rose-200">{summary.openWarranties}</p></div></div>
    </section>

    <nav aria-label="أقسام ملف العميل" className="flex gap-2 overflow-x-auto border-b border-zinc-800 pb-3">{tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-black transition-colors ${activeTab === tab.id ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}`}>{tab.label}</button>)}</nav>

    {activeTab === 'overview' ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.72fr)]"><section className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5"><h2 className="text-lg font-black">بيانات العميل</h2><div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2"><Detail icon={Phone} label="رقم الهاتف" value={customer.phone} ltr /><Detail icon={Mail} label="البريد الإلكتروني" value={customer.email} ltr /><Detail icon={BriefcaseBusiness} label="الشركة أو النشاط" value={customer.company} /><Detail icon={UserRound} label="مسؤول المتابعة" value={customer.assignedTo?.fullName || customer.assignedTo?.username} /><Detail icon={Send} label="حساب تيليجرام" value={customer.tgUsername ? `@${String(customer.tgUsername).replace(/^@/, '')}` : null} /><Detail icon={CalendarDays} label="آخر تواصل" value={formatDate(customer.lastContactAt, true)} /><Detail icon={History} label="آخر تحديث" value={formatDate(customer.updatedAt, true)} /><Detail icon={CheckCircle2} label="موافقة التواصل" value={customer.consentAt ? formatDate(customer.consentAt) : 'لم تُسجل'} /></div>{customer.address ? <div className="mt-6 border-t border-zinc-800 pt-5"><p className="text-xs font-bold text-zinc-500">العنوان</p><p className="mt-2 text-sm font-semibold text-zinc-200">{customer.address}</p></div> : null}{customFields.length ? <div className="mt-6 border-t border-zinc-800 pt-5"><p className="text-xs font-bold text-zinc-500">بيانات إضافية</p><dl className="mt-3 grid gap-3 sm:grid-cols-2">{customFields.map(([key, value]) => <div key={key} className="rounded-xl bg-zinc-950/70 px-3 py-3"><dt className="text-xs text-zinc-500">{key}</dt><dd className="mt-1 break-words text-sm font-bold text-zinc-200">{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl></div> : null}</section><section className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5"><h2 className="text-lg font-black">ملاحظات الفريق</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{customer.notes || 'لا توجد ملاحظات مسجلة عن العميل حتى الآن.'}</p><div className="mt-6 border-t border-zinc-800 pt-5"><h3 className="font-black">آخر الحركات</h3><div className="mt-3 space-y-3">{data.timeline.slice(0, 5).map((item: any) => <TimelineRow key={item.id} item={item} compact />)}{!data.timeline.length ? <p className="text-sm text-zinc-500">لا توجد حركات مسجلة بعد.</p> : null}</div><button onClick={() => setActiveTab('history')} className="mt-4 text-sm font-black text-emerald-300 hover:text-emerald-200">عرض سجل العميل كاملًا</button></div></section></div> : null}

    {activeTab === 'subscriptions' ? <section className="rounded-2xl border border-zinc-800 bg-zinc-900/55"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-5"><div><h2 className="text-lg font-black">اشتراكات العميل</h2><p className="mt-1 text-sm text-zinc-500">{data.subscriptions.length} اشتراك مسجل لهذا العميل.</p></div><Link href="/dashboard/orders" className="rounded-xl border border-zinc-700 px-3.5 py-2.5 text-sm font-bold text-zinc-200 hover:bg-zinc-800">إدارة الطلبات والاشتراكات</Link></div><div className="divide-y divide-zinc-800">{data.subscriptions.map((item: any) => <div key={item.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"><div><Link href={`/dashboard/services?serviceId=${item.service.id}`} className="font-black text-white hover:text-emerald-300">{item.service.name}</Link><p className="mt-1 text-sm text-zinc-400">{item.package || item.servicePlan?.name || 'الخطة الافتراضية'} · من {formatDate(item.startDate)} إلى {formatDate(item.endDate)}</p>{item.notes ? <p className="mt-2 text-xs text-zinc-500">{item.notes}</p> : null}</div><div className="text-right md:text-center"><p className="font-black text-emerald-300">{formatMoney(item.sellingPrice)}</p><p className="mt-1 text-xs text-zinc-500">التجديد: {statusLabel(item.renewalStatus)}</p></div><Status value={item.status} /></div>)}{!data.subscriptions.length ? <div className="p-5"><Empty>لا توجد اشتراكات لهذا العميل حتى الآن.</Empty></div> : null}</div></section> : null}

    {activeTab === 'financials' ? <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-zinc-800 bg-zinc-900/55"><div className="flex items-center justify-between border-b border-zinc-800 p-5"><div><h2 className="flex items-center gap-2 text-lg font-black"><Wallet className="h-5 w-5 text-emerald-300" />محفظة العميل</h2><p className="mt-1 text-sm text-zinc-500">الرصيد الحالي: <span className="font-black text-emerald-300">{formatMoney(customer.walletBalance)}</span></p></div></div><div className="divide-y divide-zinc-800">{data.walletTransactions.map((item: any) => <div key={item.id} className="flex items-start justify-between gap-4 p-4"><div><p className="font-bold text-zinc-100">{item.description || `حركة محفظة: ${item.type}`}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(item.createdAt, true)}{item.createdBy?.fullName ? ` · بواسطة ${item.createdBy.fullName}` : ''}</p></div><div className="text-left"><p className={`font-black ${item.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{item.amount >= 0 ? '+' : ''}{formatMoney(item.amount)}</p>{item.balanceAfter !== null ? <p className="mt-1 text-xs text-zinc-500">الرصيد: {formatMoney(item.balanceAfter)}</p> : null}</div></div>)}{!data.walletTransactions.length ? <div className="p-5"><Empty>لا توجد حركات محفظة للعميل.</Empty></div> : null}</div></section><section className="rounded-2xl border border-zinc-800 bg-zinc-900/55"><div className="border-b border-zinc-800 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><CreditCard className="h-5 w-5 text-sky-300" />طلبات الشحن والدفع</h2><p className="mt-1 text-sm text-zinc-500">سجل التحويلات والطلبات التي قدمها العميل.</p></div><div className="divide-y divide-zinc-800">{data.paymentRequests.map((item: any) => <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{item.paymentMethod?.label || item.method}</p><Status value={item.status} /></div><p className="mt-1 text-xs text-zinc-500">{formatDate(item.createdAt, true)}{item.transactionId ? ` · رقم العملية: ${item.transactionId}` : ''}</p>{item.notes ? <p className="mt-2 text-sm text-zinc-400">{item.notes}</p> : null}{item.screenshotUrl ? <a href={item.screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-sky-300 hover:text-sky-200">عرض إيصال التحويل</a> : null}</div><p className="text-left font-black text-emerald-300">{formatMoney(item.reportedAmount ?? item.amount)}</p></div>)}{!data.paymentRequests.length ? <div className="p-5"><Empty>لا توجد طلبات شحن أو دفع لهذا العميل.</Empty></div> : null}</div></section></div> : null}

    {activeTab === 'history' ? <section className="rounded-2xl border border-zinc-800 bg-zinc-900/55"><div className="border-b border-zinc-800 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><History className="h-5 w-5 text-violet-300" />سجل العميل الكامل</h2><p className="mt-1 text-sm text-zinc-500">تحديثات البيانات والطلبات والمحفظة والشحن والضمان مرتبة من الأحدث للأقدم.</p></div><div className="p-5">{data.timeline.length ? <div className="space-y-1">{data.timeline.map((item: any) => <TimelineRow key={item.id} item={item} />)}</div> : <Empty>لا توجد أحداث مسجلة لهذا العميل حتى الآن.</Empty>}</div></section> : null}

    {activeTab === 'followUp' ? <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-zinc-800 bg-zinc-900/55"><div className="border-b border-zinc-800 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><ClipboardList className="h-5 w-5 text-amber-200" />المهام والمتابعة</h2></div><div className="divide-y divide-zinc-800">{data.tasks.map((item: any) => <div key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">{item.title}</p><Status value={item.status} /></div>{item.description ? <p className="mt-2 text-sm text-zinc-400">{item.description}</p> : null}<p className="mt-2 text-xs text-zinc-500">{item.dueAt ? `موعدها: ${formatDate(item.dueAt, true)}` : 'بدون موعد محدد'}{item.assignedTo?.fullName ? ` · ${item.assignedTo.fullName}` : ''}</p></div>)}{!data.tasks.length ? <div className="p-5"><Empty>لا توجد مهام متابعة مسجلة لهذا العميل.</Empty></div> : null}</div></section><section className="rounded-2xl border border-zinc-800 bg-zinc-900/55"><div className="border-b border-zinc-800 p-5"><h2 className="flex items-center gap-2 text-lg font-black"><BriefcaseBusiness className="h-5 w-5 text-sky-300" />الصفقات وبلاغات الضمان</h2></div><div className="divide-y divide-zinc-800">{data.deals.map((item: any) => <div key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">{item.title}</p><Status value={item.stage} /></div><p className="mt-2 text-sm font-black text-emerald-300">{formatMoney(item.value)} <span className="font-medium text-zinc-500">· احتمالية {item.probability}%</span></p>{item.notes ? <p className="mt-2 text-sm text-zinc-400">{item.notes}</p> : null}</div>)}{data.warrantyCases.map((item: any) => <div key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black"><ShieldCheck className="ml-1 inline h-4 w-4 text-rose-300" />بلاغ {item.number}</p><Status value={item.status} /></div><p className="mt-2 text-sm text-zinc-400">{item.problem}</p>{item.resolution ? <p className="mt-2 text-sm text-emerald-200">الحل: {item.resolution}</p> : null}</div>)}{!data.deals.length && !data.warrantyCases.length ? <div className="p-5"><Empty>لا توجد صفقات أو بلاغات ضمان للعميل.</Empty></div> : null}</div></section></div> : null}

    {editing ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(false); }}><form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="customer-edit-title" className="mx-auto my-4 w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/50 sm:my-8 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="customer-edit-title" className="text-xl font-black">تعديل بيانات العميل</h2><p className="mt-1 text-sm text-zinc-500">سيظهر هذا التعديل في ملف العميل والبحث والمتابعة.</p></div><button type="button" onClick={() => setEditing(false)} aria-label="إغلاق" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="اسم العميل" /><input required dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={inputClass} placeholder="رقم الهاتف" /><input dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} placeholder="البريد الإلكتروني" /><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} className={inputClass} placeholder="الشركة أو النشاط" /><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} className={inputClass}><option value="lead">مهتم</option><option value="qualified">مؤهل</option><option value="customer">عميل</option><option value="inactive">غير نشط</option></select><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className={inputClass} placeholder="مصدر العميل" /></div><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/70" placeholder="وسوم مفصولة بفاصلة: مهم، تجديد" /><textarea rows={5} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm font-semibold text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/70" placeholder="ملاحظات وتفاصيل المتابعة" /><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800">إلغاء</button><button disabled={pending} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">{pending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</button></div></form></div> : null}
  </main>;
}

function Detail({ icon: Icon, label, value, ltr = false }: { icon: typeof Phone; label: string; value?: string | null; ltr?: boolean }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" /><div className="min-w-0"><p className="text-xs font-bold text-zinc-500">{label}</p><p dir={ltr ? 'ltr' : undefined} className="mt-1 break-words text-sm font-bold text-zinc-200">{value || 'غير مسجل'}</p></div></div>;
}

function TimelineRow({ item, compact = false }: { item: any; compact?: boolean }) {
  const icon = item.type === 'wallet' ? <CircleDollarSign className="h-4 w-4 text-emerald-300" /> : item.type === 'payment' ? <CreditCard className="h-4 w-4 text-sky-300" /> : item.type === 'warranty' ? <ShieldCheck className="h-4 w-4 text-rose-300" /> : item.type === 'order' ? <PackageCheck className="h-4 w-4 text-amber-200" /> : <History className="h-4 w-4 text-violet-300" />;
  return <article className={`flex gap-3 ${compact ? 'py-2.5' : 'border-b border-zinc-800 py-4 last:border-0'}`}><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-zinc-950">{icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-bold text-zinc-100">{item.title}</p><time className="shrink-0 text-xs text-zinc-500">{formatDate(item.createdAt, true)}</time></div>{item.details ? <p className="mt-1 text-sm leading-6 text-zinc-400">{item.details}</p> : null}{item.actor?.fullName || item.actor?.username ? <p className="mt-1 text-xs text-zinc-500">بواسطة {item.actor.fullName || item.actor.username}</p> : null}</div></article>;
}
