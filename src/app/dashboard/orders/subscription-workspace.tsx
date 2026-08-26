'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { CalendarDays, PauseCircle, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { deleteSubscription, extendSubscription, getSubscriptions, renewSubscription } from '@/app/actions/merchant';
import { cancelStandaloneSubscriptionAndRefund } from '@/app/actions/refunds';

type Subscription = {
  id: string;
  orderNo: string;
  status: string;
  package: string | null;
  startDate: string | Date;
  endDate: string | Date;
  sellingPrice: number;
  notes: string | null;
  customer: { id: string; name: string; phone: string | null };
  service: { id: string; name: string };
  servicePlan: { name: string } | null;
};

const inputClass = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/70';
const dayCount = (value: string | Date) => Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
const dateLabel = (value: string | Date) => new Date(value).toLocaleDateString('ar-EG');

export default function SubscriptionWorkspace() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extraDays, setExtraDays] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    setLoading(true);
    const result = await getSubscriptions();
    if (result.success) setItems(result.subscriptions as unknown as Subscription[]);
    else setNotice(result.error || 'تعذر تحميل الاشتراكات.');
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => [item.customer.name, item.customer.phone, item.service.name, item.package || '', item.servicePlan?.name || '', item.orderNo].join(' ').toLowerCase().includes(needle));
  }, [items, query]);
  const selected = items.find((item) => item.id === selectedId) || null;
  const active = items.filter((item) => item.status === 'active').length;
  const expiring = items.filter((item) => item.status === 'active' && dayCount(item.endDate) >= 0 && dayCount(item.endDate) <= 7).length;

  const openDetails = (item: Subscription) => {
    setSelectedId(item.id);
    setExtraDays('');
    setNotes(item.notes || '');
  };

  const closeDetails = () => setSelectedId(null);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetails();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const extend = () => {
    if (!selected) return;
    const days = Number(extraDays);
    if (!Number.isInteger(days) || days < 1) { setNotice('اكتب عدد الأيام التي تريد إضافتها.'); return; }
    startTransition(async () => {
      const result = await extendSubscription(selected.id, { days, notes });
      setNotice(result.success ? `تمت إضافة ${days} يوم وحفظ التعديلات.` : result.error || 'تعذر تعديل الاشتراك.');
      if (result.success) { setExtraDays(''); await refresh(); }
    });
  };

  const saveNotes = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await extendSubscription(selected.id, { notes });
      setNotice(result.success ? 'تم حفظ ملاحظات الاشتراك.' : result.error || 'تعذر حفظ الملاحظات.');
      if (result.success) await refresh();
    });
  };

  const renew = () => {
    if (!selected || !window.confirm(`تجديد ${selected.service.name} بنفس الخطة؟ سيُنشأ سجل تجديد جديد.`)) return;
    const startAt = new Date(Math.max(Date.now(), new Date(selected.endDate).getTime()));
    startTransition(async () => {
      const result = await renewSubscription(selected.id, { startDate: startAt.toISOString().slice(0, 10) });
      setNotice(result.success ? 'تم التجديد وأنشئ اشتراك جديد.' : result.error || 'تعذر تجديد الاشتراك.');
      if (result.success) { setSelectedId(null); await refresh(); }
    });
  };

  const stop = () => {
    if (!selected || !window.confirm('إيقاف الاشتراك بدون رد قيمة؟ يمكنك استخدام زر الاسترداد إن أردت تعويض العميل.')) return;
    startTransition(async () => {
      const result = await deleteSubscription(selected.id);
      setNotice(result.success ? 'تم إيقاف الاشتراك.' : result.error || 'تعذر إيقاف الاشتراك.');
      if (result.success) { setSelectedId(null); await refresh(); }
    });
  };

  const refund = (item: Subscription) => {
    const amountText = window.prompt(`قيمة الاسترداد، الحد الأقصى ${Number(item.sellingPrice).toFixed(2)} EGP:`, String(item.sellingPrice));
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) { setNotice('اكتب قيمة استرداد صحيحة.'); return; }
    const reason = window.prompt('سبب الإلغاء أو الاسترداد:', 'إلغاء بناءً على طلب العميل') || '';
    if (!window.confirm(`سيُلغى الاشتراك وتُعاد ${amount.toFixed(2)} EGP إلى محفظة العميل. هل تريد المتابعة؟`)) return;
    startTransition(async () => {
      const result = await cancelStandaloneSubscriptionAndRefund({ subscriptionId: item.id, amount, reason, sendToCustomer: true });
      setNotice(result.success ? 'تم الإلغاء والاسترداد وإبلاغ العميل عند توفر تيليجرام.' : result.error || 'تعذر تنفيذ الاسترداد.');
      if (result.success) { setSelectedId(null); await refresh(); }
    });
  };

  return <div className="space-y-5">
    {notice ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4"><p className="text-sm text-zinc-400">كل الاشتراكات</p><p className="mt-2 text-3xl font-black">{items.length}</p></div>
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="text-sm text-emerald-200">اشتراكات نشطة</p><p className="mt-2 text-3xl font-black text-emerald-300">{active}</p></div>
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4"><p className="text-sm text-amber-200">تنتهي خلال 7 أيام</p><p className="mt-2 text-3xl font-black text-amber-200">{expiring}</p></div>
    </div>

    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4 lg:flex-row lg:items-center">
      <label className="relative flex-1"><Search className="absolute right-3 top-3.5 h-4 w-4 text-zinc-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pr-10`} placeholder="ابحث باسم العميل أو الخدمة أو رقم الطلب" /></label>
      <div className="flex flex-wrap gap-2"><Link href="/dashboard" className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400">إضافة اشتراك يدوي</Link><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800"><RefreshCw className="h-4 w-4" />تحديث</button></div>
    </div>

    {loading ? <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />)}</div> : <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/55"><table className="w-full min-w-[900px] text-right text-sm"><thead className="border-b border-zinc-800 bg-zinc-950/70 text-zinc-400"><tr><th className="p-4">العميل</th><th className="p-4">الخدمة والباقـة</th><th className="p-4">الانتهاء</th><th className="p-4">القيمة</th><th className="p-4">الحالة</th><th className="p-4">إجراءات</th></tr></thead><tbody>{visible.map((item) => { const days = dayCount(item.endDate); const tone = item.status === 'active' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'canceled' ? 'bg-rose-500/10 text-rose-300' : 'bg-zinc-800 text-zinc-300'; return <tr key={item.id} className={`border-b border-zinc-800/70 last:border-0 ${selectedId === item.id ? 'bg-emerald-500/5' : ''}`}><td className="p-4"><Link prefetch={false} href={`/dashboard/customers/${item.customer.id}`} className="block text-right outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-400"><p className="font-bold text-zinc-100 transition-colors hover:text-emerald-300">{item.customer.name}</p><p className="mt-1 text-xs text-zinc-500" dir="ltr">{item.customer.phone}</p></Link></td><td className="p-4"><Link prefetch={false} href={`/dashboard/services?serviceId=${item.service.id}`} className="block text-right outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-400"><p className="font-bold text-zinc-100 transition-colors hover:text-emerald-300">{item.service.name}</p><p className="mt-1 text-xs text-zinc-400">{item.package || item.servicePlan?.name || 'الخطة الافتراضية'}</p></Link></td><td className="p-4"><p className="text-zinc-200">{dateLabel(item.endDate)}</p><p className={`mt-1 text-xs ${days < 0 ? 'text-rose-300' : days <= 7 ? 'text-amber-200' : 'text-zinc-500'}`}>{days < 0 ? 'منتهي' : `${days} يوم متبقي`}</p></td><td className="p-4 font-black text-emerald-300">{Number(item.sellingPrice).toFixed(2)} EGP</td><td className="p-4"><span className={`rounded-lg px-2.5 py-1 text-xs font-black ${tone}`}>{item.status === 'active' ? 'نشط' : item.status === 'canceled' ? 'ملغي' : item.status}</span></td><td className="p-4"><button type="button" onClick={() => openDetails(item)} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">فتح وإدارة</button></td></tr>; })}</tbody></table>{!visible.length ? <p className="p-12 text-center text-sm text-zinc-500">لا توجد اشتراكات مطابقة للبحث.</p> : null}</div>}

    {selected ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDetails(); }}><section role="dialog" aria-modal="true" aria-labelledby="subscription-management-title" className="mx-auto my-4 w-full max-w-4xl rounded-2xl border border-emerald-500/30 bg-zinc-900 p-5 shadow-2xl shadow-black/50 sm:my-8 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-bold text-emerald-400">إدارة الاشتراك</p><h3 id="subscription-management-title" className="mt-2 text-xl font-black">{selected.service.name} <span className="text-zinc-500">لـ {selected.customer.name}</span></h3><p className="mt-2 text-sm text-zinc-400">رقم الاشتراك: {selected.orderNo}</p></div><button type="button" onClick={closeDetails} className="inline-flex items-center gap-2 self-start rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><X className="h-4 w-4" />إغلاق</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-zinc-950/70 p-4"><p className="text-xs text-zinc-500">بدأ في</p><p className="mt-2 font-bold">{dateLabel(selected.startDate)}</p></div><div className="rounded-xl bg-zinc-950/70 p-4"><p className="text-xs text-zinc-500">ينتهي في</p><p className="mt-2 font-bold">{dateLabel(selected.endDate)}</p></div><div className="rounded-xl bg-zinc-950/70 p-4"><p className="text-xs text-zinc-500">الحالة</p><p className="mt-2 font-bold text-emerald-300">{selected.status === 'active' ? 'نشط' : selected.status}</p></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-zinc-800 p-4"><label className="mb-2 block text-sm font-black">إضافة مدة للاشتراك</label><p className="mb-3 text-xs leading-5 text-zinc-500">تضاف المدة إلى تاريخ النهاية، أو تبدأ من اليوم إذا كان الاشتراك منتهياً.</p><div className="flex gap-2"><input type="number" min="1" value={extraDays} onChange={(event) => setExtraDays(event.target.value)} className={inputClass} placeholder="عدد الأيام" /><button disabled={isPending || selected.status === 'canceled'} onClick={extend} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"><CalendarDays className="h-4 w-4" />حفظ المدة</button></div></div><div className="rounded-xl border border-zinc-800 p-4"><label className="mb-2 block text-sm font-black">ملاحظات داخلية</label><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder="ملاحظة للفريق، لا تظهر للعميل" /><button disabled={isPending} onClick={saveNotes} className="mt-3 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">حفظ الملاحظات</button></div></div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-800 pt-5"><button disabled={isPending || selected.status === 'canceled'} onClick={renew} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/35 px-4 py-3 text-sm font-black text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"><RotateCcw className="h-4 w-4" />تجديد بنفس الخطة</button><button disabled={isPending || selected.status === 'canceled'} onClick={stop} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"><PauseCircle className="h-4 w-4" />إيقاف بدون استرداد</button><button disabled={isPending || selected.status === 'canceled'} onClick={() => refund(selected)} className="rounded-xl border border-rose-500/35 px-4 py-3 text-sm font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">إلغاء واسترداد</button></div>
    </section></div> : null}
  </div>;
}
