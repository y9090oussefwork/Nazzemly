'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Copy, HandCoins, Landmark, Loader2, Send, Users } from 'lucide-react';
import { getMyReferralCenter, redeemReferralBalanceForSaas, requestReferralPayout } from '@/app/actions/referrals';

const methodLabel: Record<string, string> = { vodafone_cash: 'فودافون كاش', instapay: 'إنستا باي', bank_transfer: 'تحويل بنكي' };

export default function ReferralCenter() {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [amount, setAmount] = useState('');
  const [payout, setPayout] = useState({ amount: '', method: 'vodafone_cash', accountIdentifier: '', note: '' });

  const refresh = async () => {
    const result = await getMyReferralCenter();
    if (result.success) setData(result);
    else setNotice(result.error || 'تعذر تحميل برنامج الإحالة.');
  };

  useEffect(() => { void refresh(); }, []);

  const copy = async () => {
    if (!data?.program?.link) return;
    await navigator.clipboard?.writeText(data.program.link);
    setNotice('تم نسخ رابط الدعوة. أرسله لصديقك ليُنشئ متجره من خلاله.');
  };

  const redeem = () => startTransition(async () => {
    const result = await redeemReferralBalanceForSaas(Number(amount));
    setNotice(result.success ? 'تمت إضافة رصيد الإحالة إلى رصيد المنصة. يمكنك التجديد الآن.' : result.error || 'تعذر استخدام الرصيد.');
    if (result.success) { setAmount(''); await refresh(); }
  });

  const requestPayout = () => startTransition(async () => {
    const result = await requestReferralPayout({ ...payout, amount: Number(payout.amount) });
    setNotice(result.success ? 'تم إرسال طلب السحب للإدارة. يظهر في السجل حتى يتم تحويله.' : result.error || 'تعذر إرسال طلب السحب.');
    if (result.success) { setPayout({ amount: '', method: 'vodafone_cash', accountIdentifier: '', note: '' }); await refresh(); }
  });

  if (!data) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6"><div className="h-24 animate-pulse rounded-xl bg-zinc-800/50" /></div>;
  if (!data.settings?.enabled) return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 text-sm leading-7 text-zinc-300">برنامج الإحالة متوقف مؤقتًا من إدارة المنصة.</section>;

  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-4">
      <div><h3 className="flex items-center gap-2 text-base font-black text-white"><HandCoins className="h-5 w-5 text-emerald-300" />برنامج الإحالة والمحفظة</h3><p className="mt-1 text-xs leading-6 text-zinc-300">ادعُ تاجرًا جديدًا. تحصل على {Number(data.program.commissionRate).toFixed(0)}% من كل تجديد يدفعه، طوال فترة اشتراكه.</p></div>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 text-xs font-black text-emerald-200 transition-colors hover:bg-emerald-500/20"><Copy className="h-4 w-4" />نسخ رابط الدعوة</button>
    </div>
    {notice ? <p role="status" className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-xs font-bold leading-6 text-sky-100">{notice}</p> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-zinc-950/60 p-4"><p className="text-xs text-zinc-300">الرصيد المتاح</p><p className="mt-2 text-xl font-black tabular-nums text-emerald-300">{Number(data.program.availableBalance).toFixed(2)} EGP</p></div>
      <div className="rounded-xl bg-zinc-950/60 p-4"><p className="text-xs text-zinc-300">قيد التحويل</p><p className="mt-2 text-xl font-black tabular-nums text-amber-200">{Number(data.program.pendingBalance).toFixed(2)} EGP</p></div>
      <div className="rounded-xl bg-zinc-950/60 p-4"><p className="text-xs text-zinc-300">إجمالي الأرباح</p><p className="mt-2 text-xl font-black tabular-nums text-white">{Number(data.program.totalEarned).toFixed(2)} EGP</p></div>
    </div>
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/45 p-3"><p className="truncate text-left font-mono text-xs text-zinc-300" dir="ltr">{data.program.link}</p></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); redeem(); }} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><h4 className="flex items-center gap-2 text-sm font-black text-white"><Check className="h-4 w-4 text-emerald-300" />استخدم الأرباح في التجديد</h4><p className="mt-1 text-xs leading-6 text-zinc-300">ينتقل المبلغ فورًا إلى رصيد المنصة، ثم اختر باقتك بالأعلى وجدّد.</p><div className="mt-3 flex gap-2"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" type="number" min="1" step="0.01" placeholder="قيمة الاستخدام" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" /><button disabled={isPending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-zinc-950 disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}استخدام</button></div></form>
      <form onSubmit={(event) => { event.preventDefault(); requestPayout(); }} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><h4 className="flex items-center gap-2 text-sm font-black text-white"><Landmark className="h-4 w-4 text-sky-300" />طلب سحب الأرباح</h4><p className="mt-1 text-xs leading-6 text-zinc-300">الحد الأدنى {Number(data.settings.minimumPayout).toFixed(2)} EGP. تُراجع الإدارة الطلب ثم تحول المبلغ يدويًا.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={payout.amount} onChange={(event) => setPayout({ ...payout, amount: event.target.value })} inputMode="decimal" type="number" min="1" step="0.01" placeholder="المبلغ" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" /><select value={payout.method} onChange={(event) => setPayout({ ...payout, method: event.target.value })} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400">{Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={payout.accountIdentifier} onChange={(event) => setPayout({ ...payout, accountIdentifier: event.target.value })} placeholder="رقم المحفظة أو حساب الاستلام" className="sm:col-span-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" /><button disabled={isPending} className="sm:col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-400/40 px-3 text-xs font-black text-sky-100 transition-colors hover:bg-sky-400/10 disabled:opacity-60"><Send className="h-4 w-4" />إرسال طلب السحب</button></div></form>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h4 className="flex items-center gap-2 text-sm font-black text-white"><Users className="h-4 w-4 text-emerald-300" />الأصدقاء المدعوون ({data.referrals.length})</h4><div className="mt-3 max-h-48 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/40">{data.referrals.length ? data.referrals.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-xs"><div><p className="font-bold text-zinc-100">{item.referredTenant.storeName}</p><p className="mt-1 text-zinc-300">عمولة ثابتة {Number(item.commissionRate).toFixed(0)}%</p></div><span className={item.status === 'active' ? 'text-emerald-300' : 'text-zinc-300'}>{item.status === 'active' ? 'نشط' : item.status}</span></div>) : <p className="p-4 text-xs text-zinc-300">لم ينضم أي تاجر من رابطك بعد.</p>}</div></div><div><h4 className="text-sm font-black text-white">آخر حركة بالمحفظة</h4><div className="mt-3 max-h-48 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/40">{data.entries.length ? data.entries.slice(0, 10).map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-xs"><p className="min-w-0 truncate text-zinc-300">{item.description || item.type}</p><p className={Number(item.amount) >= 0 ? 'shrink-0 font-black text-emerald-300' : 'shrink-0 font-black text-amber-200'}>{Number(item.amount) >= 0 ? '+' : ''}{Number(item.amount).toFixed(2)}</p></div>) : <p className="p-4 text-xs text-zinc-300">ستظهر العمولة هنا عند أول تجديد لصديقك.</p>}</div></div></div>
  </section>;
}
