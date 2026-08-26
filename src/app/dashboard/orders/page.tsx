/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  KeyRound,
  MessageCircleMore,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  getOrders,
  revealOrderInputValues,
  updateOrderFulfillmentStatus,
} from '@/app/actions/order-fulfillment';
import { cancelOrderAndRefund, compensateOrderCustomer } from '@/app/actions/refunds';
import HelpTip from '@/app/dashboard/help-tip';
import SubscriptionWorkspace from './subscription-workspace';

type OrderRow = Awaited<ReturnType<typeof getOrders>>[number];

const statusLabels: Record<string, string> = {
  new: 'جديد',
  processing_delivery: 'جاري التسليم',
  awaiting_contact: 'بانتظار تواصل الدعم',
  awaiting_customer_data: 'بانتظار بيانات العميل',
  activation_in_progress: 'جاري التفعيل',
  invitation_sent: 'تم إرسال الدعوة',
  fulfilled: 'تم التفعيل',
  cancelled: 'ملغي',
};

const inputClass =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/70';

function statusTone(status: string) {
  if (status === 'fulfilled') return 'bg-emerald-500/10 text-emerald-300';
  if (status === 'cancelled') return 'bg-red-500/10 text-red-300';
  if (status === 'awaiting_customer_data' || status === 'awaiting_contact') return 'bg-amber-500/10 text-amber-200';
  return 'bg-sky-500/10 text-sky-200';
}

function OrderCard({ order, currency, refresh, notify }: {
  order: OrderRow;
  currency: string;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(order.fulfillmentStatus);
  const [message, setMessage] = useState(
    order.statusTemplates.find((item) => item.key === order.fulfillmentStatus)?.message || '',
  );
  const [sendToCustomer, setSendToCustomer] = useState(Boolean(order.customer.tgId));
  const [internalNote, setInternalNote] = useState(order.internalNote || '');
  const [revealedValues, setRevealedValues] = useState<Array<{ key: string; label: string; value: string }>>([]);
  const [financialAmount, setFinancialAmount] = useState(String(order.amount));
  const [financialReason, setFinancialReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'wallet' | 'manual'>('wallet');

  const changeStatus = (value: string) => {
    setSelectedStatus(value);
    const template = order.statusTemplates.find((item) => item.key === value);
    if (template) setMessage(template.message);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateOrderFulfillmentStatus({
        orderId: order.id,
        status: selectedStatus,
        message,
        sendToCustomer,
        internalNote,
      });
      notify(
        result.success
          ? result.sent
            ? 'تم تحديث الحالة وإرسال الرسالة للعميل على تيليجرام.'
            : 'تم تحديث حالة الطلب.'
          : result.error || 'تعذر تحديث الطلب.',
      );
      if (result.success) await refresh();
    });
  };

  const revealValues = () => {
    startTransition(async () => {
      const result = await revealOrderInputValues(order.id);
      if (result.success) setRevealedValues(result.values);
      else notify(result.error || 'تعذر عرض البيانات.');
    });
  };

  const refund = () => {
    if (!window.confirm('سيُلغى الطلب والاشتراك المرتبط به. هل تريد المتابعة؟')) return;
    startTransition(async () => {
      const result = await cancelOrderAndRefund({ orderId: order.id, amount: financialAmount, reason: financialReason, method: refundMethod, sendToCustomer });
      notify(result.success ? (result.sent ? 'تم الإلغاء والاسترداد وإبلاغ العميل.' : 'تم الإلغاء وتسجيل الاسترداد.') : result.error || 'تعذر تنفيذ الاسترداد.');
      if (result.success) await refresh();
    });
  };

  const compensate = () => {
    startTransition(async () => {
      const result = await compensateOrderCustomer({ orderId: order.id, amount: financialAmount, reason: financialReason, sendToCustomer });
      notify(result.success ? (result.sent ? 'تمت إضافة التعويض وإبلاغ العميل.' : 'تمت إضافة التعويض إلى محفظة العميل.') : result.error || 'تعذر إضافة التعويض.');
      if (result.success) await refresh();
    });
  };

  const customerWhatsApp = order.customer.phone.replace(/\D/g, '').replace(/^0/, '20');

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/55">
      <div className="grid gap-5 p-5 xl:grid-cols-[1.3fr_1fr_auto] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link prefetch={false} href={`/dashboard/services?serviceId=${order.service.id}`} className="text-lg font-black transition-colors hover:text-emerald-300 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">{order.service.name}</Link>
            {order.servicePlan?.name ? <span className="text-sm text-zinc-500">{order.servicePlan.name}</span> : null}
            <span className={`rounded-lg px-2.5 py-1 text-xs font-black ${statusTone(order.fulfillmentStatus)}`}>
              {statusLabels[order.fulfillmentStatus] || order.fulfillmentStatus}
            </span>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <span className="font-mono text-zinc-300">{order.orderNo}</span>
            <span>{new Date(order.createdAt).toLocaleString('ar-EG')}</span>
            <span className="font-black text-emerald-300">{order.amount.toLocaleString()} {currency}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-950 text-zinc-400"><UserRound className="h-5 w-5" /></span>
          <div><Link prefetch={false} href={`/dashboard/customers?customerId=${order.customer.id}`} className="block font-bold transition-colors hover:text-emerald-300 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">{order.customer.name}</Link><span className="text-sm text-zinc-500">{order.customer.phone}</span></div>
        </div>
        <a
          href={`https://wa.me/${customerWhatsApp}?text=${encodeURIComponent(`مرحبًا ${order.customer.name}، بخصوص طلبك ${order.orderNo} لخدمة ${order.service.name}`)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 px-3.5 py-2.5 text-sm font-black text-emerald-300 hover:bg-emerald-500/10"
        >
          <MessageCircleMore className="h-4 w-4" />واتساب
        </a>
      </div>

      <details className="group border-t border-zinc-800">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-black text-zinc-300">
          <span>فتح التنفيذ والبيانات وسجل الطلب</span>
          <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-5 border-t border-zinc-800 p-5 xl:grid-cols-2">
          <section className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-black"><KeyRound className="h-4 w-4 text-amber-300" />بيانات التنفيذ</h3>
                {order.inputValues.length ? (
                  <button onClick={revealValues} disabled={isPending} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold hover:bg-zinc-900">
                    <Eye className="h-4 w-4" />عرض البيانات
                  </button>
                ) : null}
              </div>
              {revealedValues.length ? (
                <dl className="mt-4 grid gap-3">
                  {revealedValues.map((item) => (
                    <div key={item.key} className="rounded-lg bg-zinc-900 p-3">
                      <dt className="text-xs text-zinc-500">{item.label}</dt>
                      <dd className="mt-1 break-all font-mono text-sm text-zinc-100">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : order.inputValues.length ? (
                <p className="mt-3 text-sm leading-6 text-zinc-500">العميل أرسل {order.inputValues.length} بيانًا. اضغط “عرض البيانات” لإظهارها وتسجيل عملية الاطلاع في سجل الأمان.</p>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">هذه الخدمة لا تحتاج بيانات من العميل.</p>
              )}

              {order.deliveryAllocations.length ? (
                <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
                  <p className="text-xs font-black text-zinc-500">تم التسليم من المخزون</p>
                  {order.deliveryAllocations.map((allocation) => (
                    <div key={allocation.id} className="flex items-center justify-between rounded-lg bg-emerald-500/5 px-3 py-2 text-sm">
                      <span>{allocation.accountPool.label || allocation.accountPool.credentialHint || 'وحدة تسليم'}</span>
                      <span className="text-emerald-300">{allocation.accountPool.kind}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <h3 className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4 text-emerald-300" />الضمان</h3>
              <p className="mt-3 text-sm text-zinc-400">
                {order.warrantyType === 'none'
                  ? 'بدون ضمان'
                  : order.warrantyEndsAt
                    ? `الضمان حتى ${new Date(order.warrantyEndsAt).toLocaleDateString('ar-EG')}`
                    : 'يبدأ الضمان عند إتمام التفعيل'}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <h3 className="flex items-center gap-2 font-black"><Clock3 className="h-4 w-4 text-sky-300" />سجل الطلب</h3>
              <div className="mt-3 space-y-3">
                {order.events.map((event) => (
                  <div key={event.id} className="border-r-2 border-zinc-800 pr-3 text-sm">
                    <p className="font-bold text-zinc-300">{event.toStatus ? statusLabels[event.toStatus] || event.toStatus : event.type}</p>
                    {event.message ? <p className="mt-1 text-zinc-500">{event.message}</p> : null}
                    <time className="mt-1 block text-xs text-zinc-600">{new Date(event.createdAt).toLocaleString('ar-EG')}</time>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div><h3 className="font-black text-amber-200">الإلغاء والتعويض</h3><p className="mt-1 text-sm leading-6 text-zinc-400">الاسترداد يلغي الطلب والاشتراك. التعويض يضيف رصيداً للعميل من دون إلغاء خدمته.</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-black text-zinc-400">القيمة</span><input type="number" min="0.01" max={order.amount} step="0.01" value={financialAmount} onChange={(event) => setFinancialAmount(event.target.value)} className={inputClass} /></label><label><span className="mb-2 block text-xs font-black text-zinc-400">طريقة الاسترداد</span><select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as 'wallet' | 'manual')} className={inputClass}><option value="wallet">إعادة فورية إلى المحفظة</option><option value="manual">تسجيل رد خارجي يدوي</option></select></label></div>
            <label><span className="mb-2 block text-xs font-black text-zinc-400">السبب أو الملاحظة</span><textarea rows={3} value={financialReason} onChange={(event) => setFinancialReason(event.target.value)} className={inputClass} placeholder="مثال: مشكلة في التفعيل أو إلغاء بطلب العميل" /></label>
            <p className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs leading-5 text-zinc-400">لن يُنفذ الرد الخارجي تلقائياً لأنه لا توجد بوابة دفع؛ يوثق النظام العملية لتتابع التحويل بنفسك. أما المحفظة فتُشحن فوراً ويظهر الرصيد للعميل في البوت.</p>
            <div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={isPending || order.fulfillmentStatus === 'cancelled'} onClick={refund} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white hover:bg-rose-400 disabled:opacity-50">إلغاء الطلب ورد القيمة</button><button type="button" disabled={isPending || order.fulfillmentStatus === 'cancelled'} onClick={compensate} className="rounded-xl border border-amber-400/40 px-4 py-3 text-sm font-black text-amber-200 hover:bg-amber-400/10 disabled:opacity-50">تعويض دون إلغاء</button></div>
          </section>
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div>
              <label className="mb-2 flex items-center gap-1 text-xs font-black text-zinc-400">
                حالة التنفيذ <HelpTip text="اختر المرحلة الحالية. عند اختيار حالة نهائية مثل تم التفعيل، ينشئ النظام الاشتراك ويبدأ مدته تلقائيًا." />
              </label>
              <select value={selectedStatus} onChange={(event) => changeStatus(event.target.value)} className={inputClass}>
                {order.statusTemplates.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 flex items-center gap-1 text-xs font-black text-zinc-400">
                رسالة العميل <HelpTip text="تُملأ تلقائيًا من قالب الحالة، ويمكنك تعديلها لهذا الطلب فقط. المتغيرات المتاحة: {اسم_العميل} و{الخدمة} و{الخطة} و{رقم_الطلب}." />
              </label>
              <textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} />
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-800 p-3">
              <span><b className="block text-sm">إرسال التحديث للعميل</b><small className="text-zinc-500">عبر بوت تيليجرام إذا كان العميل مربوطًا به</small></span>
              <input type="checkbox" checked={sendToCustomer} disabled={!order.customer.tgId} onChange={(event) => setSendToCustomer(event.target.checked)} className="h-4 w-4 accent-emerald-500" />
            </label>
            <div>
              <label className="mb-2 block text-xs font-black text-zinc-400">ملاحظة داخلية للفريق</label>
              <textarea rows={3} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} className={inputClass} placeholder="لا تظهر للعميل" />
            </div>
            <button disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />حفظ الحالة وإرسال التحديث
            </button>
          </form>
        </div>
      </details>
    </article>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const currency = 'EGP';

  const refresh = async () => {
    setLoading(true);
    try {
      setOrders(await getOrders({ status: status || undefined, query: query || undefined, queueOnly: true }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر تحميل الطلبات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [status]);

  const stats = useMemo(() => ({
    all: orders.length,
    waiting: orders.filter((item) => ['awaiting_contact', 'awaiting_customer_data'].includes(item.fulfillmentStatus)).length,
    working: orders.filter((item) => ['activation_in_progress', 'invitation_sent', 'processing_delivery'].includes(item.fulfillmentStatus)).length,
    done: orders.filter((item) => item.fulfillmentStatus === 'fulfilled').length,
  }), [orders]);
  return (
    <section dir="rtl" className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-400"><PackageCheck className="h-4 w-4" />مركز التنفيذ</p>
          <h1 className="mt-2 text-3xl font-black">الطلبات والاشتراكات</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">تابع تنفيذ الطلبات، الاشتراكات النشطة، التجديدات، والإلغاء والاسترداد من مساحة تشغيل واحدة.</p>
        </div>
        <button onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold hover:bg-zinc-900"><RefreshCw className="h-4 w-4" />تحديث</button>
      </header>

      {notice ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['كل الطلبات', stats.all],
          ['تحتاج إجراء', stats.waiting],
          ['جاري تنفيذها', stats.working],
          ['تم تنفيذها', stats.done],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4"><span className="text-sm text-zinc-500">{label}</span><b className="mt-3 block text-3xl">{value}</b></div>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4 lg:grid-cols-[1fr_16rem_auto]">
        <label className="relative"><Search className="absolute right-3 top-3.5 h-4 w-4 text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pr-10`} placeholder="اسم العميل، الهاتف، الخدمة أو رقم الطلب" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
          <option value="">كل الحالات</option>
          {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button onClick={() => void refresh()} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400">بحث</button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />)}</div>
      ) : orders.length ? (
        <div className="space-y-4">{orders.map((order) => <OrderCard key={order.id} order={order} currency={currency} refresh={refresh} notify={setNotice} />)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center"><PackageCheck className="mx-auto h-8 w-8 text-zinc-600" /><h2 className="mt-4 font-black">لا توجد طلبات بهذه الحالة</h2><p className="mt-2 text-sm text-zinc-500">ستظهر طلبات البوت واللوحة هنا فور إنشائها.</p></div>
      )}
      <section id="subscriptions" className="scroll-mt-6 border-t border-zinc-800 pt-8">
        <div className="mb-5">
          <p className="text-sm font-bold text-emerald-400">سجل العملاء النشط</p>
          <h2 className="mt-2 text-2xl font-black">الاشتراكات والتجديد</h2>
          <p className="mt-2 text-sm leading-7 text-zinc-400">راجع الاشتراكات، تابع ما ينتهي قريباً، وجدّد أو ألغِ مع استرداد القيمة عند الحاجة.</p>
        </div>
        <SubscriptionWorkspace />
      </section>    </section>
  );
}
