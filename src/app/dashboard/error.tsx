'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('Dashboard route failed', error);
  }, [error]);

  return (
    <section className="mx-auto max-w-3xl py-12 text-center" dir="rtl">
      <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8">
        <TriangleAlert className="mx-auto h-10 w-10 text-rose-300" />
        <h2 className="mt-4 text-xl font-black text-white">تعذر فتح هذه الصفحة الآن</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-rose-100">لم نفقد أي بيانات. جرّب إعادة المحاولة، أو افتح الحساب والفوترة إذا كنت تريد تجديد اشتراك المنصة أو مراجعة رصيد المحفظة.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={retry} className="inline-flex items-center gap-2 rounded-xl bg-rose-300 px-4 py-2.5 text-sm font-black text-rose-950"><RefreshCw className="h-4 w-4" />إعادة المحاولة</button>
          <Link href="/dashboard/billing" className="rounded-xl border border-rose-300/40 px-4 py-2.5 text-sm font-bold text-rose-100">فتح الحساب والفوترة</Link>
        </div>
      </div>
    </section>
  );
}
