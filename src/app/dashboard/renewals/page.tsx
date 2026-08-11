import Link from 'next/link';
import { getRenewalWorkspace } from '@/app/actions/operations-center';

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(value);
}

export default async function RenewalsPage() {
  const result = await getRenewalWorkspace();
  return (
    <main className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div><p className="text-sm text-emerald-400">التشغيل اليومي</p><h1 className="mt-1 text-2xl font-bold text-white">مركز التجديدات</h1><p className="mt-2 text-sm text-zinc-400">رتّب التواصل مع العملاء قبل انتهاء اشتراكاتهم، وسجّل نتيجة كل متابعة.</p></div>
        <Link href="/dashboard/manage?tab=subscriptions" className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-black">إضافة أو تجديد اشتراك</Link>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["متأخر", result.counts.overdue, 'text-rose-300'], ["اليوم", result.counts.today, 'text-amber-300'], ["خلال أسبوع", result.counts.week, 'text-violet-300'], ["خلال 30 يومًا", result.counts.month, 'text-sky-300'], ["تم التواصل", result.counts.contacted, 'text-emerald-300']].map(([label, count, tone]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4"><p className="text-xs text-zinc-400">{label}</p><p className={`mt-2 text-3xl font-bold ${tone}`}>{count}</p></div>)}
      </section>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60">
        <div className="border-b border-white/10 px-5 py-4"><h2 className="font-bold text-white">قائمة التجديدات القريبة</h2></div>
        <div className="divide-y divide-white/5">
          {result.subscriptions.length ? result.subscriptions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-semibold text-white">{item.customer.name} <span className="text-zinc-500">—</span> {item.service.name}</p><p className="mt-1 text-xs text-zinc-400">{item.servicePlan?.name ?? 'الخطة الأساسية'} · ينتهي {formatDate(item.endDate)} · {Number(item.sellingPrice).toLocaleString('ar-EG')} {result.currency}</p></div><div className="flex items-center gap-2"><span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{item.renewalStatus === 'contacted' ? 'تم التواصل' : 'بانتظار المتابعة'}</span>{item.customer.phone ? <a className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300" href={`https://wa.me/2${item.customer.phone.replace(/^0/, '')}`}>واتساب</a> : null}</div></div>) : <p className="px-5 py-12 text-center text-sm text-zinc-500">لا توجد تجديدات ضمن الفترة الحالية.</p>}
        </div>
      </section>
    </main>
  );
}
