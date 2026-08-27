'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, CheckCircle2, Copy, HandCoins, Landmark, Link2, Loader2, SearchCheck, Send, Users } from 'lucide-react';
import { checkMyReferralCodeAvailability, getMyReferralCenter, redeemReferralBalanceForSaas, requestReferralPayout, updateMyReferralCode } from '@/app/actions/referrals';

const methodLabel: Record<string, string> = { vodafone_cash: 'فودافون كاش', instapay: 'إنستا باي', bank_transfer: 'تحويل بنكي' };

type ReferralItem = {
  id: string;
  commissionRate: number;
  firstMonthDiscountAmount: number;
  firstMonthDiscountAppliedAt: Date | string | null;
  firstPaidAt: Date | string | null;
  referredTenant: { storeName: string };
};

type ReferralWalletEntry = { id: string; amount: number; description: string | null; type: string };

type ReferralCenterData = {
  settings: { enabled: boolean; minimumPayout: number; firstMonthDiscountAmount: number };
  program: {
    code: string;
    link: string;
    registrationPath: string;
    commissionRate: number;
    availableBalance: number;
    pendingBalance: number;
    totalEarned: number;
  };
  referrals: ReferralItem[];
  entries: ReferralWalletEntry[];
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  document.execCommand('copy');
  field.remove();
}

export default function ReferralCenter() {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ReferralCenterData | null>(null);
  const [notice, setNotice] = useState('');
  const [amount, setAmount] = useState('');
  const [payout, setPayout] = useState({ amount: '', method: 'vodafone_cash', accountIdentifier: '', note: '' });
  const [customCode, setCustomCode] = useState('');
  const [codeState, setCodeState] = useState<{ kind: 'idle' | 'available' | 'used' | 'invalid'; message: string }>({ kind: 'idle', message: '' });

  const applyData = (result: ReferralCenterData) => {
    setData(result);
    setCustomCode(result.program.code);
    setCodeState({ kind: 'idle', message: '' });
  };

  const refresh = async () => {
    const result = await getMyReferralCenter();
    if (result.success && result.settings && result.program) {
      applyData({ settings: result.settings, program: result.program, referrals: result.referrals, entries: result.entries });
    }
    else setNotice(result.error || 'تعذر تحميل برنامج الإحالة.');
  };

  useEffect(() => {
    let cancelled = false;
    void getMyReferralCenter().then((result) => {
      if (cancelled) return;
      if (result.success && result.settings && result.program) {
        applyData({ settings: result.settings, program: result.program, referrals: result.referrals, entries: result.entries });
      }
      else setNotice(result.error || 'تعذر تحميل برنامج الإحالة.');
    });
    return () => { cancelled = true; };
  }, []);

  const shareLink = data?.program?.link
    ? (data.program.link.startsWith('http') ? data.program.link : `${window.location.origin}${data.program.registrationPath || data.program.link}`)
    : '';
  const copyLink = async () => {
    try {
      await copyText(shareLink);
      setNotice('تم نسخ رابط الإحالة كاملاً. أرسله لصديقك ليبدأ التسجيل والخصم تلقائياً.');
    } catch {
      setNotice('تعذر النسخ تلقائياً. انسخ الرابط الظاهر أدناه.');
    }
  };
  const copyCode = async () => {
    try {
      await copyText(data?.program?.code || '');
      setNotice('تم نسخ رمز الإحالة فقط.');
    } catch {
      setNotice('تعذر النسخ تلقائياً. انسخ الرمز الظاهر أدناه.');
    }
  };

  const checkCode = () => startTransition(async () => {
    const result = await checkMyReferralCodeAvailability(customCode);
    if (!result.success) {
      setCodeState({ kind: 'invalid', message: result.error || 'تحقق من صيغة الكود ثم أعد المحاولة.' });
      return;
    }
    setCustomCode(result.code || customCode);
    setCodeState(result.available
      ? { kind: 'available', message: result.isCurrentCode ? 'هذا هو كودك الحالي.' : 'الكود متاح ويمكنك استخدامه.' }
      : { kind: 'used', message: 'هذا الكود مستخدم بالفعل. اختر كوداً مختلفاً.' });
  });

  const saveCustomCode = () => startTransition(async () => {
    const result = await updateMyReferralCode(customCode);
    if (!result.success) {
      setCodeState({ kind: 'used', message: result.error || 'تعذر حفظ الكود.' });
      return;
    }
    setNotice(`تم حفظ كود الإحالة الجديد: ${result.code}`);
    await refresh();
  });

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

  const signupDiscount = Number(data.settings.firstMonthDiscountAmount || 0);

  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-black text-white"><HandCoins className="h-5 w-5 text-emerald-300" />برنامج الإحالة والمحفظة</h3>
        <p className="mt-1 text-xs leading-6 text-zinc-300">تحصل على {Number(data.program.commissionRate).toFixed(0)}% من كل تجديد مدفوع لصديقك طوال فترة اشتراكه.</p>
        {signupDiscount > 0 ? <p className="mt-1 text-xs font-bold leading-6 text-emerald-200">وصديقك يحصل على خصم {signupDiscount.toFixed(2)} EGP من أول اشتراك مدفوع له.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyLink()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-emerald-950 transition-colors hover:bg-emerald-400"><Link2 className="h-4 w-4" />نسخ رابط الإحالة</button>
        <button type="button" onClick={() => void copyCode()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs font-black text-zinc-100 transition-colors hover:border-emerald-400 hover:text-emerald-200"><Copy className="h-4 w-4" />نسخ الرمز</button>
      </div>
    </div>

    {notice ? <p role="status" className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-xs font-bold leading-6 text-sky-100">{notice}</p> : null}

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-zinc-950/60 p-4"><p className="text-xs text-zinc-300">الرصيد المتاح</p><p className="mt-2 text-xl font-black tabular-nums text-emerald-300">{Number(data.program.availableBalance).toFixed(2)} EGP</p></div>
      <div className="rounded-xl bg-zinc-950/60 p-4"><p className="text-xs text-zinc-300">قيد التحويل</p><p className="mt-2 text-xl font-black tabular-nums text-amber-200">{Number(data.program.pendingBalance).toFixed(2)} EGP</p></div>
      <div className="rounded-xl bg-zinc-950/60 p-4"><p className="text-xs text-zinc-300">إجمالي الأرباح</p><p className="mt-2 text-xl font-black tabular-nums text-white">{Number(data.program.totalEarned).toFixed(2)} EGP</p></div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3"><p className="text-[11px] font-bold text-emerald-200">رمزك</p><p className="mt-1 font-mono text-sm font-black text-white" dir="ltr">{data.program.code}</p></div>
      <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/45 p-3"><p className="mb-1 text-[11px] font-bold text-zinc-400">رابط الإحالة الكامل</p><p className="truncate text-left font-mono text-xs text-zinc-200" dir="ltr">{shareLink}</p></div>
    </div>

    <form onSubmit={(event) => { event.preventDefault(); saveCustomCode(); }} className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-black text-white"><Link2 className="h-4 w-4 text-emerald-300" />اختر كود إحالتك</h4>
          <p className="mt-1 text-xs leading-6 text-zinc-300">اكتب كوداً سهلاً لمشاركته. يجب أن يكون فريداً، وسيتغير رابط الإحالة تلقائياً بعد الحفظ.</p>
        </div>
        <span className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-300" dir="ltr">3–24 · A-Z · 0-9 · - · _</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          value={customCode}
          onChange={(event) => { setCustomCode(event.target.value.toUpperCase().replace(/\s+/g, '')); setCodeState({ kind: 'idle', message: '' }); }}
          onBlur={checkCode}
          maxLength={24}
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="مثال: MARK-2026"
          aria-describedby="referral-code-help"
          className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-base font-bold text-white outline-none focus:border-emerald-400"
          dir="ltr"
        />
        <button type="button" onClick={checkCode} disabled={isPending || !customCode.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs font-black text-zinc-100 transition-colors hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"><SearchCheck className="h-4 w-4" />فحص الكود</button>
        <button disabled={isPending || !customCode.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-black text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}حفظ الكود</button>
      </div>
      <p id="referral-code-help" role="status" className={`mt-2 text-xs font-bold leading-6 ${codeState.kind === 'available' ? 'text-emerald-200' : codeState.kind === 'used' || codeState.kind === 'invalid' ? 'text-rose-200' : 'text-zinc-400'}`}>{codeState.message || 'استخدم الحروف الإنجليزية والأرقام وشرطة - أو _. لا يمكن استخدام كود تاجر آخر.'}</p>
    </form>

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <form onSubmit={(event) => { event.preventDefault(); redeem(); }} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><h4 className="flex items-center gap-2 text-sm font-black text-white"><Check className="h-4 w-4 text-emerald-300" />استخدم الأرباح في التجديد</h4><p className="mt-1 text-xs leading-6 text-zinc-300">ينتقل المبلغ فورًا إلى رصيد المنصة، ثم اختر باقتك في تبويب الاشتراك وجدّد.</p><div className="mt-3 flex gap-2"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" type="number" min="1" step="0.01" placeholder="قيمة الاستخدام" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" /><button disabled={isPending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-zinc-950 disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}استخدام</button></div></form>
      <form onSubmit={(event) => { event.preventDefault(); requestPayout(); }} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><h4 className="flex items-center gap-2 text-sm font-black text-white"><Landmark className="h-4 w-4 text-sky-300" />طلب سحب الأرباح</h4><p className="mt-1 text-xs leading-6 text-zinc-300">الحد الأدنى {Number(data.settings.minimumPayout).toFixed(2)} EGP. تُراجع الإدارة الطلب ثم تحول المبلغ يدويًا.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input value={payout.amount} onChange={(event) => setPayout({ ...payout, amount: event.target.value })} inputMode="decimal" type="number" min="1" step="0.01" placeholder="المبلغ" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" /><select value={payout.method} onChange={(event) => setPayout({ ...payout, method: event.target.value })} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400">{Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={payout.accountIdentifier} onChange={(event) => setPayout({ ...payout, accountIdentifier: event.target.value })} placeholder="رقم المحفظة أو حساب الاستلام" className="sm:col-span-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400" /><button disabled={isPending} className="sm:col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sky-400/40 px-3 text-xs font-black text-sky-100 transition-colors hover:bg-sky-400/10 disabled:opacity-60"><Send className="h-4 w-4" />إرسال طلب السحب</button></div></form>
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h4 className="flex items-center gap-2 text-sm font-black text-white"><Users className="h-4 w-4 text-emerald-300" />التجار المسجلون برابطك ({data.referrals.length})</h4><div className="mt-3 max-h-56 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/40">{data.referrals.length ? data.referrals.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-xs"><div className="min-w-0"><p className="truncate font-bold text-zinc-100">{item.referredTenant.storeName}</p><p className="mt-1 text-zinc-300">{item.firstPaidAt ? 'تم أول دفع — العمولة تُسجل مع كل تجديد' : 'سجّل وينتظر أول اشتراك مدفوع'}</p>{Number(item.firstMonthDiscountAmount) > 0 && !item.firstMonthDiscountAppliedAt ? <p className="mt-1 text-emerald-200">له خصم أول شهر: {Number(item.firstMonthDiscountAmount).toFixed(2)} EGP</p> : null}</div><span className={item.firstPaidAt ? 'shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 font-black text-emerald-200' : 'shrink-0 rounded-lg bg-amber-500/10 px-2 py-1 font-black text-amber-100'}>{item.firstPaidAt ? 'مدفوع' : 'مسجّل'}</span></div>) : <p className="p-4 text-xs text-zinc-300">لم ينضم أي تاجر من رابطك بعد.</p>}</div></div><div><h4 className="text-sm font-black text-white">آخر حركة بالمحفظة</h4><div className="mt-3 max-h-56 divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/40">{data.entries.length ? data.entries.slice(0, 10).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-xs"><p className="min-w-0 truncate text-zinc-300">{item.description || item.type}</p><p className={Number(item.amount) >= 0 ? 'shrink-0 font-black text-emerald-300' : 'shrink-0 font-black text-amber-200'}>{Number(item.amount) >= 0 ? '+' : ''}{Number(item.amount).toFixed(2)}</p></div>) : <p className="p-4 text-xs text-zinc-300">ستظهر العمولة عند دفع اشتراك أول تاجر مدعو، ثم مع كل تجديد مدفوع.</p>}</div></div></div>
  </section>;
}
