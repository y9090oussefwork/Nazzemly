'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BellRing,
  Boxes,
  Bot,
  BriefcaseBusiness,
  ClipboardList,
  ChevronLeft,
  CircleDollarSign,
  FileSpreadsheet,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  Settings2,
  Sparkles,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { logoutMerchant } from '@/app/actions/auth';
import { getMerchantOnboardingState } from '@/app/actions/merchant-profile';
import DashboardAccessGate from './dashboard-access-gate';

const navGroups = [
  { label: 'التشغيل اليومي', items: [
    { href: '/dashboard', label: 'النظرة العامة', icon: LayoutDashboard },
    { href: '/dashboard/orders', label: 'الطلبات والاشتراكات', icon: ClipboardList },
    { href: '/dashboard?screen=requests', label: 'طلبات الشحن', icon: WalletCards },
    { href: '/dashboard/renewals', label: 'التجديدات', icon: BellRing },
    { href: '/dashboard/warranties', label: 'الضمان والاستبدال', icon: LifeBuoy },
  ] },
  { label: 'العملاء والمبيعات', items: [
    { href: '/dashboard/customers', label: 'العملاء', icon: UsersRound },
    { href: '/dashboard/operations?tab=crm', label: 'الصفقات والمتابعة', icon: BriefcaseBusiness },
    { href: '/dashboard/messages', label: 'قوالب الرسائل', icon: Megaphone },
  ] },
  { label: 'الكتالوج والتنفيذ', items: [
    { href: '/dashboard/services', label: 'الخدمات والمخزون', icon: Boxes },
  ] },
  { label: 'المال والتقارير', items: [
    { href: '/dashboard/expenses', label: 'المصروفات المتكررة', icon: CircleDollarSign },
    { href: '/dashboard/manage?tab=ads', label: 'الإعلانات', icon: Megaphone },
    { href: '/dashboard/billing', label: 'الحساب والفوترة', icon: WalletCards },
  ] },
  { label: 'إدارة المتجر', items: [
    { href: '/dashboard/settings', label: 'بيانات المتجر والدفع', icon: Settings2 },
    { href: '/dashboard/support', label: 'الدعم والمساعدة', icon: LifeBuoy },
  ] },
] as const;

const routeTitles: Record<string, string> = {
  '/dashboard/orders': '\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u062a\u0646\u0641\u064a\u0630',
  '/dashboard': 'لوحة التشغيل',
  '/dashboard/operations': 'المبيعات والتواصل',
  '/dashboard/setup': 'جولة إعداد المتجر',
  '/dashboard/settings': 'بيانات المتجر والتواصل والدفع',
  '/dashboard/billing': 'الحساب والفوترة',
  '/dashboard/expenses': 'المصروفات',
  '/dashboard/manage': 'إدارة المتجر',
  '/dashboard/services': 'الخدمات والمخزون',
  '/dashboard/bot': 'إعداد بوت المتجر',
  '/dashboard/data': 'نقل البيانات',
  '/dashboard/support': 'الدعم والمساعدة',
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    void getMerchantOnboardingState().then((result) => {
      const allowed = pathname === '/dashboard/setup' || pathname === '/dashboard/support';
      if (result.success && !result.completed && !allowed) router.replace('/dashboard/setup');
    });
  }, [pathname, router]);

  const pageTitle = routeTitles[pathname] || 'لوحة التشغيل';

  const isActive = (href: string) => {
    const [targetPath, targetQuery = ''] = href.split('?');
    if (targetPath !== pathname) return false;
    if (!targetQuery) return targetPath === '/dashboard/settings' ? true : !searchParams.toString();
    const expected = new URLSearchParams(targetQuery);
    return [...expected.entries()].every(([key, value]) => searchParams.get(key) === value);
  };

  const closeAndSelect = () => {
    setMobileOpen(false);
  };

  const navigation = (compact = false) => (
    <nav aria-label="القائمة الرئيسية" className={compact ? 'space-y-1' : 'space-y-5'}>
      {navGroups.map((group) => (
        <section key={group.label}>
          {!compact ? <p className="mb-2 px-3 text-[11px] font-black tracking-wide text-zinc-500">{group.label}</p> : null}
          <div className="space-y-1">
            {group.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={closeAndSelect}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors duration-150 active:scale-[0.98] ${isActive(href) ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {compact ? <ChevronLeft className="h-4 w-4 opacity-50" /> : null}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );

  return (
    <div dir="rtl" className="dashboard-shell min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l border-zinc-800 bg-zinc-950 px-4 py-5 md:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-2 pb-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-zinc-950"><BellRing className="h-5 w-5" /></span>
          <span><b className="block text-sm">نظام الإدارة</b><small className="mt-0.5 block text-xs text-zinc-500">تشغيل المتجر ببساطة</small></span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{navigation()}</div>
        <button onClick={() => void logoutMerchant().then(() => router.replace('/login'))} className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-500 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-300 active:scale-[0.98]">
          <LogOut className="h-4 w-4" />تسجيل الخروج
        </button>
      </aside>

      <div className="min-w-0 md:mr-64">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur sm:px-6">
          <div><p className="text-xs font-bold text-emerald-400">مساحة العمل</p><h1 className="mt-0.5 text-lg font-black">{pageTitle}</h1></div>
          <button onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-700 text-zinc-200 transition-colors duration-150 hover:bg-zinc-900 active:scale-[0.98] md:hidden" aria-label="فتح القائمة"><Menu className="h-5 w-5" /></button>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8"><DashboardAccessGate>{children}</DashboardAccessGate></main>
      </div>

      {mobileOpen ? <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
        <button onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/60" aria-label="إغلاق القائمة" />
        <aside className="absolute inset-y-0 right-0 w-[min(88vw,22rem)] border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
          <div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-zinc-950"><BellRing className="h-5 w-5" /></span><b>نظام الإدارة</b></div><button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-900" aria-label="إغلاق"><X className="h-5 w-5" /></button></div>
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto">{navigation(true)}</div>
        </aside>
      </div> : null}
    </div>
  );
}
