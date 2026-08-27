'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SiteBrand } from './site-brand';

const navigation = [
  { href: '#features', label: 'المزايا' },
  { href: '#workflow', label: 'كيف يعمل' },
  { href: '#pricing', label: 'الباقات' },
  { href: '#storefront', label: 'موقع التاجر' },
  { href: '#referral', label: 'الإحالة' },
];

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="relative z-30 border-b border-white/8 bg-[#07110e]/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <SiteBrand />
        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-7 text-sm font-bold text-zinc-300 lg:flex">
          {navigation.map((item) => <a key={item.href} href={item.href} className="transition-colors hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">{item.label}</a>)}
        </nav>
        <div className="hidden items-center gap-4 sm:flex">
          <Link href="/login" className="text-sm font-extrabold text-zinc-200 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">تسجيل الدخول</Link>
          <Link href="/register" className="inline-flex min-h-10 items-center rounded-lg bg-emerald-400 px-4 text-sm font-black text-[#062116] transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 active:translate-y-px">ابدأ مجانًا</Link>
        </div>
        <button type="button" aria-label={isMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} className="grid size-10 place-items-center rounded-lg border border-white/10 text-zinc-100 transition hover:border-emerald-300/60 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 sm:hidden">
          {isMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {isMenuOpen ? (
        <div className="absolute inset-x-0 top-full border-b border-white/10 bg-[#0a1712] px-5 pb-5 pt-3 shadow-[0_24px_48px_rgba(0,0,0,0.32)] sm:hidden">
          <nav aria-label="التنقل على الهاتف" className="grid gap-1">
            {navigation.map((item) => <a key={item.href} href={item.href} onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-extrabold text-zinc-200 transition hover:bg-emerald-400/10 hover:text-emerald-200">{item.label}</a>)}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <Link href="/login" onClick={() => setIsMenuOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-3 text-sm font-black text-white">دخول</Link>
            <Link href="/register" onClick={() => setIsMenuOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-400 px-3 text-sm font-black text-[#062116]">ابدأ مجانًا</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
