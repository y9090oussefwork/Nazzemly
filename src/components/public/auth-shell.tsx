import type { ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { SiteBrand } from './site-brand';

type AuthShellProps = {
  children: ReactNode;
  mode: 'login' | 'register';
  referralNote?: ReactNode;
};

const sellingPoints = [
  'متابعة كل عميل واشتراك من مكان واحد.',
  'طلبات وتنفيذ واضحان دون رسائل متفرقة.',
  'تنبيهات وتجديدات قبل أن تؤثر على المبيعات.',
];

export function AuthShell({ children, mode, referralNote }: AuthShellProps) {
  const isLogin = mode === 'login';
  const title = isLogin ? 'رجوعك للعمل يجب أن يكون بسيطًا.' : 'ابدأ تشغيل متجرك بطريقة مرتبة.';
  const body = isLogin
    ? 'ادخل إلى مساحة تشغيل خدماتك الرقمية وواصل من آخر خطوة وصلت إليها.'
    : 'أنشئ متجرك التجريبي، ثم ابدأ بتجهيز خدماتك وعملائك بالترتيب الذي يناسبك.';

  return (
    <main dir="rtl" className="public-shell min-h-dvh bg-[#07110e] px-4 py-4 text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b1612] shadow-[0_28px_70px_rgba(0,0,0,0.28)] lg:grid-cols-[0.9fr_1.1fr] sm:min-h-[calc(100dvh-4rem)]">
        <aside className="relative overflow-hidden border-b border-white/10 bg-[#0c2119] p-6 sm:p-9 lg:border-b-0 lg:border-l lg:border-white/10 lg:p-12">
          <span aria-hidden className="absolute -left-24 top-14 size-72 rounded-full border border-emerald-300/15" />
          <span aria-hidden className="absolute -bottom-20 right-12 size-64 rounded-full bg-emerald-400/8 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-4">
              <SiteBrand />
              <Link href="/" className="inline-flex items-center gap-2 text-xs font-extrabold text-emerald-100 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"><ArrowRight className="size-4" />الموقع</Link>
            </div>
            <div className="my-auto py-12 lg:py-16">
              <p className="max-w-md text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-4xl">{title}</p>
              <p className="mt-5 max-w-md text-sm font-semibold leading-7 text-emerald-50/80">{body}</p>
              <div className="mt-9 grid gap-4 border-t border-emerald-200/15 pt-6 text-sm font-bold text-emerald-50/90">
                {sellingPoints.map((item) => <p key={item} className="flex items-start gap-3"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-300/15 text-emerald-200"><Check className="size-3.5" strokeWidth={2.5} /></span>{item}</p>)}
              </div>
            </div>
            {referralNote}
            <p className="mt-7 text-xs font-bold text-emerald-100/60">منصة تشغيل للتجارة الرقمية</p>
          </div>
        </aside>
        <section className="flex items-center bg-[#0b1612] p-6 sm:p-9 lg:p-12">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}
