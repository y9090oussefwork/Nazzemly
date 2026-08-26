'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, CircleAlert, KeyRound, Loader2, LogIn, PackageCheck, ShieldCheck, User, UserPlus } from 'lucide-react';
import { loginMerchant } from '@/app/actions/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isLocalDemo = process.env.NODE_ENV !== 'production';

  const fillDemoAccount = (account: 'owner' | 'merchant') => {
    setUsername(account === 'owner' ? 'test_owner' : 'test_merchant');
    setPassword(account === 'owner' ? 'TestOwner!2026' : 'TestMerchant!2026');
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!username || !password) {
      setError('اكتب اسم المستخدم وكلمة المرور أولاً.');
      return;
    }

    startTransition(async () => {
      const result = await loginMerchant(username, password);
      if (result.success) {
        router.push(result.role === 'super_admin' ? '/admin' : '/dashboard');
        return;
      }
      setError(result.error || 'تعذر تسجيل الدخول الآن. تأكد من البيانات ثم حاول مرة أخرى.');
    });
  };

  return <main dir="rtl" className="min-h-dvh bg-[#07100d] px-4 py-5 text-zinc-100 sm:px-6 sm:py-8">
    <div aria-hidden className="pointer-events-none fixed -right-32 top-8 h-80 w-80 rounded-full border border-emerald-400/10" />
    <div aria-hidden className="pointer-events-none fixed -bottom-28 -left-20 h-96 w-96 rounded-full bg-emerald-400/5 blur-3xl" />

    <div className="relative mx-auto grid min-h-[calc(100dvh-2.5rem)] max-w-5xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0a1511] shadow-[0_30px_90px_rgba(0,0,0,0.4)] lg:grid-cols-[0.92fr_1.08fr] sm:min-h-[calc(100dvh-4rem)]">
      <section className="relative overflow-hidden border-b border-zinc-800 bg-[#0e211a] p-6 sm:p-10 lg:border-b-0 lg:border-l lg:border-zinc-800">
        <div aria-hidden className="absolute -left-28 -top-20 h-72 w-72 rounded-full border-[24px] border-emerald-400/10" />
        <div aria-hidden className="absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative flex h-full flex-col">
          <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm font-black text-zinc-200 transition-colors hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
            <ArrowRight className="h-4 w-4" />
            العودة إلى الموقع
          </Link>

          <div className="my-auto py-10 lg:py-16">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-black shadow-[0_14px_35px_rgba(52,211,153,0.16)]">
              <PackageCheck className="h-6 w-6" />
            </div>
            <h1 className="mt-7 text-4xl font-black leading-[1.15] tracking-[-0.035em] text-white sm:text-5xl">مرحباً بعودتك.</h1>
            <p className="mt-4 max-w-sm text-sm font-semibold leading-7 text-zinc-300">سجّل الدخول للمتابعة من حيث توقفت: العملاء والطلبات والاشتراكات في مكان واحد.</p>

            <div className="mt-9 space-y-4 border-t border-emerald-400/15 pt-6 text-sm font-bold text-zinc-200">
              {[
                'تابع الطلبات التي تحتاج تنفيذ الآن.',
                'راجع التجديدات والمخزون قبل أن تتأثر المبيعات.',
                'أدر فريقك وبوتك وبيانات متجرك من لوحة واحدة.',
              ].map((item) => <p key={item} className="flex items-start gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-200"><Check className="h-3.5 w-3.5" /></span>{item}</p>)}
            </div>
          </div>

          <p className="text-xs font-bold text-emerald-100/70">Nazzemly | نظّملي</p>
        </div>
      </section>

      <section className="flex items-center p-6 sm:p-10">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="text-3xl font-black tracking-[-0.03em] text-white">تسجيل الدخول</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">اكتب بيانات حسابك للوصول إلى لوحة التحكم.</p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-200"><ShieldCheck className="h-5 w-5" /></span>
          </div>

          {error ? <div role="alert" aria-live="polite" className="mt-7 flex items-start gap-3 rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm font-bold leading-6 text-rose-100"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" /><span>{error}</span></div> : null}

          {isLocalDemo ? <div className="mt-7 rounded-2xl border border-emerald-400/20 bg-[#102018] p-4"><p className="text-sm font-black text-emerald-100">بيانات اختبار محلية</p><p className="mt-1 text-xs font-semibold leading-6 text-emerald-100/75">هذه الأزرار تظهر في بيئة التطوير فقط ولن تظهر للتجار في الموقع المنشور.</p><div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={() => fillDemoAccount('owner')} className="min-h-11 rounded-xl border border-emerald-400/25 px-3 text-xs font-black text-emerald-100 transition-colors hover:bg-emerald-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-[0.98]">حساب المالك</button><button type="button" onClick={() => fillDemoAccount('merchant')} className="min-h-11 rounded-xl border border-emerald-400/25 px-3 text-xs font-black text-emerald-100 transition-colors hover:bg-emerald-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-[0.98]">حساب تاجر</button></div></div> : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-black text-zinc-200">اسم المستخدم</label>
              <div className="relative"><User className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" /><input id="username" name="username" autoComplete="username" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} disabled={isPending} placeholder="اسم المستخدم" className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 pr-12 text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60" /></div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-black text-zinc-200">كلمة المرور</label>
              <div className="relative"><KeyRound className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" /><input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isPending} placeholder="كلمة المرور" className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 pr-12 text-sm font-bold text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60" /></div>
            </div>

            <button type="submit" disabled={isPending} className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-black text-black transition-colors hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.99]">{isPending ? <><Loader2 className="h-5 w-5 animate-spin" />جارٍ تسجيل الدخول</> : <><LogIn className="h-5 w-5" />تسجيل الدخول</>}</button>
          </form>

          <div className="mt-8 border-t border-zinc-800 pt-6"><p className="text-sm font-semibold text-zinc-400">ليس لديك متجر بعد؟</p><Link href="/register" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-black text-white transition-colors hover:border-emerald-400/60 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"><UserPlus className="h-4 w-4" />أنشئ متجرًا مجانًا لمدة 14 يومًا</Link></div>
        </div>
      </section>
    </div>
  </main>;
}
