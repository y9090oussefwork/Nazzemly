'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { AtSign, Check, CircleAlert, KeyRound, Loader2, Store, Ticket, UserRound } from 'lucide-react';
import { registerMerchantFromReferral } from '@/app/actions/merchant-registration';
import { AuthShell } from '@/components/public/auth-shell';

const REFERRAL_STORAGE_KEY = 'nazzemly_referral_attribution_v1';
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() || '';
  return /^NZ-[A-Z0-9]{6,24}$/.test(code) ? code : '';
}

export default function ReferralRegistration({ referralCode }: { referralCode: string }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ storeName: '', username: '', password: '', email: '', referralCode });
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const directCode = normalizeReferralCode(referralCode);
    let rememberedCode = '';
    try {
      if (directCode) {
        localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code: directCode, expiresAt: Date.now() + REFERRAL_TTL_MS }));
      } else {
        const raw = localStorage.getItem(REFERRAL_STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved.code === 'string' && Number(saved.expiresAt) > Date.now()) rememberedCode = normalizeReferralCode(saved.code);
        else localStorage.removeItem(REFERRAL_STORAGE_KEY);
      }
    } catch {
      // Storage is only a convenience; server-side code still validates every referral.
    }
    const code = directCode || rememberedCode;
    if (!code) return;
    const timer = window.setTimeout(() => setForm((current) => ({ ...current, referralCode: code })), 0);
    return () => window.clearTimeout(timer);
  }, [referralCode]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const result = await registerMerchantFromReferral(form);
      if (result.success) {
        try { localStorage.removeItem(REFERRAL_STORAGE_KEY); } catch { /* no-op */ }
        setNotice({ type: 'success', text: 'تم إنشاء متجرك التجريبي بنجاح. ابدأ الآن بتسجيل الدخول.' });
      } else setNotice({ type: 'error', text: result.error || 'تعذر إنشاء المتجر. حاول مرة أخرى.' });
    });
  };

  const referralNote = form.referralCode ? <div className="border border-emerald-200/15 bg-emerald-300/8 p-4"><div className="flex items-center gap-2 text-sm font-black text-emerald-100"><Ticket className="size-4" />تم حفظ دعوة صديق</div><p className="mt-2 text-xs font-semibold leading-6 text-emerald-100/70">سيُطبّق رمز الإحالة تلقائيًا عند إنشاء الحساب. خصم أول اشتراك مدفوع، إن كان متاحًا، تحدده إدارة المنصة.</p></div> : null;

  return (
    <AuthShell mode="register" referralNote={referralNote}>
      <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-black tracking-[-0.035em] text-white">أنشئ حساب التاجر</h1><p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">ستحصل على تجربة مجانية لمدة 14 يومًا فورًا.</p></div><Link href="/login" className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-black text-zinc-200 transition hover:border-emerald-300 hover:text-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">لدي حساب</Link></div>

      {notice ? <div role="alert" aria-live="polite" className={`mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm font-bold leading-6 ${notice.type === 'success' ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-50' : 'border-rose-400/35 bg-rose-400/10 text-rose-100'}`}>{notice.type === 'success' ? <Check className="mt-0.5 size-5 shrink-0 text-emerald-300" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-300" />}<span>{notice.text}{notice.type === 'success' ? <Link href="/login" className="mr-2 font-black text-emerald-200 underline decoration-emerald-300 underline-offset-4">تسجيل الدخول</Link> : null}</span></div> : null}

      <form onSubmit={submit} className="mt-7 grid gap-5">
        <label className="text-sm font-black text-zinc-200">اسم النشاط<div className="relative mt-2"><Store className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" /><input required value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} placeholder="مثال: متجر خالد الرقمي" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-12 text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" /></div></label>
        <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-black text-zinc-200">اسم المستخدم<div className="relative mt-2"><UserRound className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" /><input required minLength={3} dir="ltr" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="khaled_store" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-10 text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" /></div></label><label className="text-sm font-black text-zinc-200">كلمة المرور<div className="relative mt-2"><KeyRound className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" /><input required minLength={10} type="password" dir="ltr" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="حروف وأرقام، 10+" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-10 text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" /></div></label></div>
        <label className="text-sm font-black text-zinc-200">البريد الإلكتروني <span className="font-semibold text-zinc-500">اختياري</span><div className="relative mt-2"><AtSign className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" /><input type="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-10 text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" /></div></label>
        <label className="text-sm font-black text-zinc-200">رمز الإحالة <span className="font-semibold text-zinc-500">اختياري</span><div className="relative mt-2"><Ticket className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" /><input dir="ltr" value={form.referralCode} onChange={(event) => setForm({ ...form, referralCode: event.target.value.toUpperCase() })} placeholder="NZ-XXXXXXXX" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-10 font-[family-name:var(--font-geist-mono)] text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20" /></div></label>
        <button disabled={isPending} className="mt-1 inline-flex min-h-13 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-black text-[#062116] transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px">{isPending ? <><Loader2 className="size-4 animate-spin" />جارٍ إنشاء المتجر</> : <><Store className="size-4" />إنشاء المتجر وبدء التجربة</>}</button>
      </form>
      <p className="mt-5 text-center text-xs font-semibold leading-6 text-zinc-500">بإنشاء الحساب، تبدأ التجربة المجانية لمدة 14 يومًا. يمكنك التجديد لاحقًا من محفظة المنصة.</p>
    </AuthShell>
  );
}
