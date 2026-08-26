'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, Loader2, Store, Ticket } from 'lucide-react';
import { registerMerchantFromReferral } from '@/app/actions/merchant-registration';

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
      }
      else setNotice({ type: 'error', text: result.error || 'تعذر إنشاء المتجر. حاول مرة أخرى.' });
    });
  };

  return <main dir="rtl" className="min-h-dvh bg-zinc-950 px-4 py-8 text-zinc-100 sm:px-6">
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-5xl overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/35 shadow-2xl shadow-black/30 lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="relative overflow-hidden bg-emerald-400 p-7 text-black sm:p-10">
        <div className="relative z-10 flex h-full flex-col">
          <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm font-black transition-opacity hover:opacity-70"><ArrowRight className="h-4 w-4" />العودة إلى نظّملي</Link>
          <div className="my-auto py-14">
            <div className="mb-7 grid h-12 w-12 place-items-center rounded-2xl bg-zinc-950 text-emerald-300 shadow-lg shadow-emerald-950/25"><Store className="h-6 w-6" /></div>
            <h1 className="max-w-sm text-4xl font-black leading-[1.15] tracking-[-0.035em]">ابدأ تنظيم تجارتك خلال دقائق.</h1>
            <p className="mt-5 max-w-sm text-sm font-bold leading-7 text-emerald-950/80">أنشئ متجرك مجاناً، جرّب جميع أساسيات التشغيل لمدة 14 يوماً، ثم اختر باقتك عندما تكون مستعداً.</p>
            <ul className="mt-8 space-y-3 text-sm font-black">
              {['لا تحتاج إلى بطاقة أو دفع عند التسجيل', 'العملاء والاشتراكات والطلبات في مكان واحد', 'يمكنك إضافة بوت تيليجرام متى أردت'].map((item) => <li key={item} className="flex items-center gap-3"><span className="grid h-5 w-5 place-items-center rounded-full bg-zinc-950 text-emerald-300"><Check className="h-3.5 w-3.5" /></span>{item}</li>)}
            </ul>
          </div>
          {form.referralCode ? <div className="rounded-2xl border border-emerald-950/20 bg-emerald-300/45 p-4"><div className="flex items-center gap-2 text-sm font-black"><Ticket className="h-4 w-4" />تم حفظ دعوة صديق</div><p className="mt-1.5 text-xs font-bold leading-6 text-emerald-950/75">سيُطبّق رمز الإحالة تلقائياً عند إنشاء الحساب. خصم أول اشتراك مدفوع، إن كان متاحاً، تحدده إدارة المنصة.</p></div> : null}
        </div>
        <div aria-hidden className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full border-[28px] border-emerald-300/50" />
      </aside>

      <section className="p-6 sm:p-10">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black tracking-[-0.025em] text-white">أنشئ حساب التاجر</h2><p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">ستحصل على تجربة مجانية لمدة 14 يوماً فوراً.</p></div><Link href="/login" className="shrink-0 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-black text-zinc-200 transition-colors hover:border-emerald-400 hover:text-emerald-300">لدي حساب</Link></div>

        {notice ? <div role="alert" className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm font-bold leading-6 ${notice.type === 'success' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-50' : 'border-rose-500/35 bg-rose-500/10 text-rose-100'}`}>
          {notice.type === 'success' ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />}<span>{notice.text}{notice.type === 'success' ? <Link href="/login" className="mr-2 underline decoration-emerald-300 underline-offset-4">تسجيل الدخول</Link> : null}</span>
        </div> : null}

        <form onSubmit={submit} className="mt-7 grid gap-5">
          <label className="text-sm font-black text-zinc-200">اسم النشاط<input required value={form.storeName} onChange={(event) => setForm({ ...form, storeName: event.target.value })} placeholder="مثال: متجر خالد الرقمي" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400" /></label>
          <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-black text-zinc-200">اسم المستخدم<input required minLength={3} dir="ltr" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="khaled_store" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400" /></label><label className="text-sm font-black text-zinc-200">كلمة المرور<input required minLength={10} type="password" dir="ltr" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="حروف وأرقام، 10+" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400" /></label></div>
          <label className="text-sm font-black text-zinc-200">البريد الإلكتروني <span className="font-semibold text-zinc-500">(اختياري)</span><input type="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400" /></label>
          <label className="text-sm font-black text-zinc-200">رمز الإحالة <span className="font-semibold text-zinc-500">(اختياري)</span><input dir="ltr" value={form.referralCode} onChange={(event) => setForm({ ...form, referralCode: event.target.value.toUpperCase() })} placeholder="NZ-XXXXXXXX" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400" /></label>
          <button disabled={isPending} className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-black transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}إنشاء المتجر وبدء التجربة</button>
        </form>
        <p className="mt-5 text-center text-xs font-semibold leading-6 text-zinc-500">بإنشاء الحساب، تبدأ التجربة المجانية لمدة 14 يوماً. يمكنك التجديد لاحقاً من محفظة المنصة.</p>
      </section>
    </div>
  </main>;
}
