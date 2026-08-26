'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function RenewalsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('Renewals page failed', error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl py-12" dir="rtl">
      <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
        <h1 className="mt-4 text-xl font-black text-white">تعذر تحميل مركز التجديدات</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-amber-100">حدث خطأ مؤقت أثناء تحميل البيانات. جرّب إعادة المحاولة، وإذا كان اشتراك المنصة منتهياً يمكنك فتح صفحة الحساب والفوترة لتجديده.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={retry} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-black text-zinc-950"><RefreshCw className="h-4 w-4" />إعادة المحاولة</button>
          <Link href="/dashboard/billing" className="rounded-xl border border-amber-300/40 px-4 py-2.5 text-sm font-bold text-amber-100">فتح الحساب والفوترة</Link>
        </div>
      </section>
    </main>
  );
}
