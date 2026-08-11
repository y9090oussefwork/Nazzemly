import Link from 'next/link';
import { getWarrantyWorkspace } from '@/app/actions/warranties';

export default async function WarrantiesPage() {
  const result = await getWarrantyWorkspace();
  return (
    <main className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5"><div><p className="text-sm text-emerald-400">ما بعد البيع</p><h1 className="mt-1 text-2xl font-bold text-white">الضمان والاستبدال</h1><p className="mt-2 text-sm text-zinc-400">سجل موحد للمشاكل، المتابعة، والاستبدالات دون فقدان تاريخ العميل أو بيانات التسليم.</p></div><Link href="/dashboard/orders" className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-black">عرض الطلبات</Link></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["كل الحالات", result.summary.total], ["مفتوحة", result.summary.open], ["عاجلة / عالية", result.summary.priority], ["تم استبدالها", result.summary.replaced]].map(([label, count]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4"><p className="text-xs text-zinc-400">{label}</p><p className="mt-2 text-3xl font-bold text-white">{count}</p></div>)}</section>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60"><div className="border-b border-white/10 px-5 py-4"><h2 className="font-bold text-white">حالات الضمان</h2></div><div className="divide-y divide-white/5">{result.cases.length ? result.cases.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-semibold text-white">{item.number} · {item.customer.name}</p><p className="mt-1 text-sm text-zinc-400">{item.subscription?.service.name ?? item.order?.serviceNameSnapshot ?? 'خدمة'} — {item.problem}</p></div><div className="text-left"><span className="rounded-lg bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200">{item.status}</span><p className="mt-2 text-xs text-zinc-500">{new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(item.openedAt)}</p></div></article>) : <p className="px-5 py-12 text-center text-sm text-zinc-500">لا توجد حالات ضمان حتى الآن.</p>}</div></section>
    </main>
  );
}
