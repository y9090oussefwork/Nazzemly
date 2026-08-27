'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, KeyRound, Loader2, LogIn, ShieldCheck, User, UserPlus } from 'lucide-react';
import { loginMerchant } from '@/app/actions/auth';
import { AuthShell } from '@/components/public/auth-shell';

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
      setError('اكتب اسم المستخدم وكلمة المرور أولًا.');
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

  return (
    <AuthShell mode="login">
      <div className="flex items-start justify-between gap-5">
        <div><h1 className="text-3xl font-black tracking-[-0.035em] text-white">تسجيل الدخول</h1><p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">اكتب بيانات حسابك للوصول إلى مساحة تشغيل متجرك.</p></div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-emerald-200"><ShieldCheck className="size-5" /></span>
      </div>

      {error ? <div role="alert" aria-live="polite" className="mt-7 flex items-start gap-3 rounded-xl border border-rose-400/35 bg-rose-400/10 p-4 text-sm font-bold leading-6 text-rose-100"><CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-300" /><span>{error}</span></div> : null}

      {isLocalDemo ? <div className="mt-7 rounded-xl border border-emerald-300/20 bg-emerald-300/8 p-4"><p className="text-sm font-black text-emerald-100">بيانات اختبار محلية</p><p className="mt-1 text-xs font-semibold leading-6 text-emerald-100/70">هذه الأزرار تظهر في بيئة التطوير فقط ولن تظهر للتجار في الموقع المنشور.</p><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => fillDemoAccount('owner')} className="min-h-11 rounded-lg border border-emerald-300/25 px-3 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:translate-y-px">حساب المالك</button><button type="button" onClick={() => fillDemoAccount('merchant')} className="min-h-11 rounded-lg border border-emerald-300/25 px-3 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:translate-y-px">حساب تاجر</button></div></div> : null}

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div><label htmlFor="username" className="mb-2 block text-sm font-black text-zinc-200">اسم المستخدم</label><div className="relative"><User className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" /><input id="username" name="username" autoComplete="username" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} disabled={isPending} placeholder="اسم المستخدم" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-12 text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60" /></div></div>
        <div><label htmlFor="password" className="mb-2 block text-sm font-black text-zinc-200">كلمة المرور</label><div className="relative"><KeyRound className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" /><input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isPending} placeholder="كلمة المرور" className="min-h-12 w-full rounded-lg border border-zinc-700 bg-[#07100d] px-4 pr-12 text-sm font-bold text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60" /></div></div>
        <button type="submit" disabled={isPending} className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-5 text-sm font-black text-[#062116] transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px">{isPending ? <><Loader2 className="size-5 animate-spin" />جارٍ تسجيل الدخول</> : <><LogIn className="size-5" />تسجيل الدخول</>}</button>
      </form>

      <div className="mt-8 border-t border-white/10 pt-6"><p className="text-sm font-semibold text-zinc-400">ليس لديك متجر بعد؟</p><Link href="/register" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-black text-white transition hover:border-emerald-300/60 hover:text-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"><UserPlus className="size-4" />أنشئ متجرًا مجانًا لمدة 14 يومًا</Link></div>
    </AuthShell>
  );
}
