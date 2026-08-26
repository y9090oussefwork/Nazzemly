'use client';

import { useEffect, useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDashboardAnalytics } from '@/app/actions/dashboard-analytics';

const presets = [
  { key: 'today', label: 'اليوم' }, { key: 'yesterday', label: 'أمس' }, { key: 'last7', label: 'آخر 7 أيام' },
  { key: 'last30', label: 'آخر 30 يومًا' }, { key: 'thisMonth', label: 'هذا الشهر' }, { key: 'lastMonth', label: 'الشهر الماضي' }, { key: 'thisYear', label: 'هذه السنة' },
];

const labels: Record<string, string> = {
  revenue: 'الإيراد', profit: 'صافي الربح', expenses: 'المصروفات', directCosts: 'تكلفة الخدمات والرسوم', orders: 'الطلبات الجديدة', customersCreated: 'عملاء جدد', subscriptionsCreated: 'اشتراكات جديدة', approvedTopups: 'شحنات معتمدة', totalCustomers: 'إجمالي العملاء', activeSubscriptions: 'اشتراكات نشطة', openOrders: 'طلبات تحتاج تنفيذًا', pendingPayments: 'شحن بانتظار الاعتماد', lowStock: 'خطط نفد مخزونها', expiring: 'تجديدات خلال 7 أيام',
};

const currencyMetrics = new Set(['revenue', 'profit', 'expenses', 'directCosts']);

const money = (value: number, currency: string) => `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ${currency}`;
const compactMoney = (value: number) => new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState('thisMonth');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void getDashboardAnalytics(period).then((result) => { if (result.success) setData(result); }).finally(() => setLoading(false));
  }, [period]);

  const chartTotals = useMemo(() => {
    const chart = data?.chart || [];
    return {
      revenue: chart.reduce((total: number, point: any) => total + Number(point.revenue || 0), 0),
      expenses: chart.reduce((total: number, point: any) => total + Number(point.expenses || 0), 0),
      hasActivity: chart.some((point: any) => Number(point.revenue || 0) > 0 || Number(point.expenses || 0) > 0),
    };
  }, [data]);

  return (
    <section className="mt-7 space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-2">
        {presets.map((item) => (
          <button
            key={item.key}
            onClick={() => setPeriod(item.key)}
            className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors duration-150 active:scale-[0.98] ${period === item.key ? 'bg-emerald-500 text-black' : 'text-white hover:bg-zinc-800'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="h-28 rounded-2xl bg-zinc-900" /><div className="h-28 rounded-2xl bg-zinc-900" /><div className="h-28 rounded-2xl bg-zinc-900" /><div className="h-28 rounded-2xl bg-zinc-900" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data.metrics).map(([key, value]) => <Metric key={key} label={labels[key]} value={Number(value)} currency={data.currency} money={currencyMetrics.has(key)} warn={['openOrders', 'pendingPayments', 'lowStock', 'expiring'].includes(key) && Number(value) > 0} />)}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
            <FinancialMovementChart chart={data.chart} currency={data.currency} revenue={chartTotals.revenue} expenses={chartTotals.expenses} profit={Number(data.metrics.profit)} hasActivity={chartTotals.hasActivity} />
            <ServiceLeaderboard items={data.topServices} currency={data.currency} />
          </div>

          <Breakdown title="أكبر بنود المصروفات" items={data.expenseCategories} currency={data.currency} />
        </>
      )}
    </section>
  );
}

function FinancialMovementChart({ chart, currency, revenue, expenses, profit, hasActivity }: { chart: Array<{ key: string; label: string; revenue: number; expenses: number }>; currency: string; revenue: number; expenses: number; profit: number; hasActivity: boolean }) {
  return (
    <section className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-black text-white">حركة الإيرادات والمصروفات</h2>
          <p className="mt-1 text-sm text-zinc-400">بيانات فعلية يومًا بيوم من الطلبات والمصروفات المسجلة.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-emerald-200">إيراد {money(revenue, currency)}</span>
          <span className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-rose-200">مصروفات {money(expenses, currency)}</span>
        </div>
      </div>

      {hasActivity ? <>
        <div className="mt-5 h-[280px] sm:h-[330px]" dir="rtl" aria-label="مخطط حركة الإيرادات والمصروفات">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 5" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={28} tickMargin={12} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} width={58} tickMargin={8} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={compactMoney} />
              <Tooltip content={<FinancialTooltip currency={currency} />} cursor={{ stroke: '#71717a', strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="revenue" name="الإيراد" stroke="#34d399" strokeWidth={2.5} fill="#10b981" fillOpacity={0.14} activeDot={{ r: 5, fill: '#ecfdf5', stroke: '#10b981', strokeWidth: 2 }} />
              <Bar dataKey="expenses" name="المصروفات" fill="#fb7185" fillOpacity={0.9} radius={[5, 5, 0, 0]} maxBarSize={24} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap gap-4"><span className="inline-flex items-center gap-2 text-emerald-200"><i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />الإيراد</span><span className="inline-flex items-center gap-2 text-rose-200"><i aria-hidden className="h-2.5 w-2.5 rounded-sm bg-rose-400" />المصروفات</span></div>
          <span className={`font-bold ${profit >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>صافي الربح للفترة: {money(profit, currency)}</span>
        </div>
      </> : <div className="grid min-h-[280px] place-items-center text-center"><div><p className="font-bold text-zinc-200">لا توجد حركة مالية في الفترة المختارة.</p><p className="mt-2 text-sm text-zinc-500">ستظهر هنا الإيرادات عند إنشاء طلب أو اشتراك، والمصروفات عند تسجيلها.</p></div></div>}
    </section>
  );
}

function FinancialTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div dir="rtl" className="min-w-44 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 shadow-xl shadow-black/40">
      <p className="text-xs font-bold text-zinc-300">{label}</p>
      <div className="mt-2 space-y-1.5">
        {payload.map((item) => <div key={item.name} className="flex items-center justify-between gap-4 text-sm"><span className="inline-flex items-center gap-2 text-zinc-300"><i aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />{item.name}</span><b className="text-zinc-100">{money(Number(item.value || 0), currency)}</b></div>)}
      </div>
    </div>
  );
}

function Metric({ label, value, currency, money, warn }: { label: string; value: number; currency: string; money?: boolean; warn?: boolean }) {
  return <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-xs text-zinc-500">{label}</p><p className={`mt-3 text-2xl font-black ${warn ? 'text-amber-300' : 'text-white'}`}>{value.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}{money ? <span className="mr-1 text-xs text-zinc-500">{currency}</span> : null}</p></article>;
}

function ServiceLeaderboard({ items, currency }: { items: Array<{ name: string; amount: number; sales?: number }>; currency: string }) {
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-black">أفضل الخدمات</h2><p className="mt-1 text-sm text-zinc-500">مرتبة حسب إيراد الفترة المختارة</p></div>
        <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-300">أفضل 5</span>
      </div>
      {items.length ? <ol className="mt-5 space-y-2">{items.map((item, index) => {
        const share = total ? Math.round(Number(item.amount) / total * 100) : 0;
        return (
          <li key={item.name} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-800 text-xs font-black text-emerald-300">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-black leading-5 text-zinc-100">{item.name}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="font-black text-emerald-300">{Number(item.amount).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} {currency}</span>
                  <span className="text-zinc-400">{item.sales || 0} مبيعات · {share}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${share}%` }} />
                </div>
              </div>
            </div>
          </li>
        );
      })}</ol> : <p className="py-10 text-center text-sm text-zinc-500">لا توجد مبيعات خدمات خلال هذه الفترة.</p>}
    </section>
  );
}

function Breakdown({ title, items, currency }: { title: string; items: any[]; currency: string }) {
  const max = items[0]?.amount || 1;
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="font-black">{title}</h2>
      <div className="mt-5 space-y-4">
        {items.length ? items.map((item) => (
          <div key={item.name}>
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate text-zinc-300">{item.name}</span>
              <span className="font-bold text-zinc-100">{Number(item.amount).toLocaleString('ar-EG')} {currency}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.amount / max * 100}%` }} />
            </div>
          </div>
        )) : <p className="py-10 text-center text-sm text-zinc-500">لا توجد بيانات خلال هذه الفترة.</p>}
      </div>
    </section>
  );
}
