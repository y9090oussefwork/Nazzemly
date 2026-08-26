'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { CreditCard, Loader2, LockKeyhole } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';

// عندما ينتهي اشتراك التاجر، تظل قناتا التجديد والدعم فقط متاحتين.
// الإعدادات والتجديدات تخص تشغيل المتجر، لذلك تُقفل مع بقية أدوات التشغيل.
const ACCOUNT_ROUTES = new Set([
  '/dashboard/billing',
  '/dashboard/support',
]);

export default function DashboardAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<'checking' | 'allowed' | 'inactive'>('checking');

  useEffect(() => {
    let live = true;
    void getCurrentUser().then((user) => {
      if (!live) return;
      const expired = user?.tenantExpiry ? new Date(user.tenantExpiry) <= new Date() : false;
      const inactive = Boolean(user && (user.tenantStatus !== 'active' || expired));
      setState(inactive && !ACCOUNT_ROUTES.has(pathname) ? 'inactive' : 'allowed');
    }).catch(() => {
      if (live) setState('allowed');
    });
    return () => { live = false; };
  }, [pathname]);

  if (state === 'checking') {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-400" /></div>;
  }

  if (state === 'inactive') {
    return (
      <section className="mx-auto max-w-3xl py-10 text-center" dir="rtl">
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8">
          <LockKeyhole className="mx-auto h-10 w-10 text-amber-300" />
          <h2 className="mt-4 text-xl font-black text-white">اشتراك المنصة يحتاج إلى تجديد</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-amber-100">تبقى بيانات متجرك محفوظة، لكن أدوات التشغيل متوقفة مؤقتاً حتى يتم التجديد. افتح الحساب والفوترة لتشاهد رصيد المحفظة وتختار الباقة والمدة ثم تجدّد فوراً.</p>
          <Link href="/dashboard/billing" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-amber-950"><CreditCard className="h-4 w-4" />فتح التجديد والمحفظة</Link>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
