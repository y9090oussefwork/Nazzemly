/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { getPlatformAuditLogs, getPlans, savePlan } from '@/app/actions/superadmin';

export default function OwnerOperationsPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [plans, setPlans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    code: '', name: '', priceMonthly: '', priceYearly: '',
    maxUsers: '3', maxCustomers: '500', maxMessages: '5000', features: '',
  });

  const refresh = async () => {
    const [user, planResult, auditResult] = await Promise.all([getCurrentUser(), getPlans(), getPlatformAuditLogs()]);
    if (!user || user.role !== 'super_admin') {
      router.replace('/login');
      return;
    }
    if (planResult.success) setPlans(planResult.plans);
    if (auditResult.success) setLogs(auditResult.logs);
    const error = !planResult.success ? planResult.error : !auditResult.success ? auditResult.error : '';
    if (error) setNotice(error || '');
  };

  useEffect(() => { void refresh(); }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await savePlan({
        code: form.code,
        name: form.name,
        priceMonthly: Number(form.priceMonthly),
        priceYearly: form.priceYearly ? Number(form.priceYearly) : null,
        maxUsers: Number(form.maxUsers),
        maxCustomers: Number(form.maxCustomers),
        maxMessages: Number(form.maxMessages),
        features: form.features.split(',').map((item) => item.trim()).filter(Boolean),
      });
      setNotice(result.success ? 'تم حفظ الباقة.' : result.error || 'تعذر حفظ الباقة.');
      if (result.success) {
        setForm({ code: '', name: '', priceMonthly: '', priceYearly: '', maxUsers: '3', maxCustomers: '500', maxMessages: '5000', features: '' });
        await refresh();
      }
    });
  };

  return (
    <main dir="rtl" className="min-h-screen bg-zinc-950 p-5 text-zinc-100 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div><p className="text-sm text-emerald-400">مالك المنصة</p><h1 className="text-3xl font-black">الباقات والحوكمة</h1></div>
          <Link href="/admin" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold hover:bg-zinc-900">العودة للوحة المالك</Link>
        </header>
        {notice && <p className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">{notice}</p>}
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2">
            <h2 className="mb-4 text-xl font-black">الباقات المنشورة</h2>
            <div className="space-y-3">{plans.map((plan) => <article key={plan.id} className="rounded-xl border border-zinc-800 p-4"><div className="flex items-center justify-between"><div><p className="font-bold">{plan.name} <span className="text-xs text-zinc-500">({plan.code})</span></p><p className="text-sm text-zinc-400">{plan.priceMonthly} EGP شهرياً · {plan.maxUsers} مستخدمين · {plan.maxCustomers} عميل</p></div><span className={plan.isActive ? 'text-emerald-400' : 'text-red-400'}>{plan.isActive ? 'نشطة' : 'موقوفة'}</span></div><p className="mt-2 text-xs text-zinc-500">{plan.features.join('، ')}</p></article>)}</div>
          </div>
          <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-4 text-lg font-black">باقة جديدة</h2>
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="رمز الباقة: pro" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم الباقة" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input required type="number" min="1" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} placeholder="السعر الشهري" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input type="number" min="1" value={form.priceYearly} onChange={(e) => setForm({ ...form, priceYearly: e.target.value })} placeholder="السعر السنوي (اختياري)" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <div className="grid grid-cols-3 gap-2"><input type="number" min="1" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} placeholder="مستخدمون" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" /><input type="number" min="1" value={form.maxCustomers} onChange={(e) => setForm({ ...form, maxCustomers: e.target.value })} placeholder="عملاء" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" /><input type="number" min="0" value={form.maxMessages} onChange={(e) => setForm({ ...form, maxMessages: e.target.value })} placeholder="رسائل" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" /></div>
            <textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder="المزايا مفصولة بفاصلة" className="mb-3 min-h-24 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">حفظ الباقة</button>
          </form>
        </section>
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-xl font-black">سجل التدقيق على مستوى المنصة</h2>
          <div className="space-y-2">{logs.map((log) => <article key={log.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3 text-sm"><div><p className="font-bold">{log.action}</p><p className="text-zinc-500">{log.tenant?.storeName || 'المنصة'} · {log.user?.username || 'النظام'} · {new Date(log.createdAt).toLocaleString('ar-EG')}</p></div><span className="text-xs text-zinc-500">{log.entityType}</span></article>)}</div>
        </section>
      </div>
    </main>
  );
}
