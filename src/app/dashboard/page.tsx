/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react-hooks/purity, @next/next/no-img-element */
'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardCheck, FileImage, ImageOff, LoaderCircle, MessageCircle, Plus, RefreshCw, RotateCcw, X,
} from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { addCustomer, addSubscription, getCustomers, getDashboardStats, getServices, getSubscriptions } from '@/app/actions/merchant';
import { approvePayment, getPendingPayments, rejectPayment } from '@/app/actions/payments';
import { getCRMWorkspace } from '@/app/actions/crm';
import AnalyticsDashboard from './analytics-dashboard';
import HomeSearch from './home-search';

type Screen = 'today' | 'customers' | 'requests';
type Modal = 'customer' | 'subscription' | null;
type DiscountType = 'none' | 'percentage' | 'fixed';

const todayDate = () => new Date().toISOString().slice(0, 10);
const initialSubscriptionForm = () => ({
  customerId: '', serviceId: '', servicePlanId: '', startDate: todayDate(),
  discountType: 'none' as DiscountType, discountValue: '',
});

const prefetchedReceiptIds = new Set<string>();

function DashboardWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [screen, setScreen] = useState<Screen>('today');
  const [modal, setModal] = useState<Modal>(null);
  const [receiptPayment, setReceiptPayment] = useState<any | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [receiptAttempt, setReceiptAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [stats, setStats] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);

  const receiptUrl = (paymentId: string, attempt = 0) =>
    `/api/payment-receipts/${paymentId}${attempt ? `?retry=${attempt}` : ''}`;

  const prefetchReceipt = (payment: any) => {
    if (!payment?.id || prefetchedReceiptIds.has(payment.id)) return;
    prefetchedReceiptIds.add(payment.id);
    const image = new window.Image();
    image.src = receiptUrl(payment.id);
    image.decode().catch(() => prefetchedReceiptIds.delete(payment.id));
  };

  const openReceipt = (payment: any) => {
    setReceiptStatus('loading');
    setReceiptAttempt(0);
    setReceiptPayment(payment);
  };

  const retryReceipt = () => {
    setReceiptStatus('loading');
    setReceiptAttempt((current) => current + 1);
  };
  const [payments, setPayments] = useState<any[]>([]);
  const [workspace, setWorkspace] = useState<any>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', company: '', notes: '' });
  const [subscriptionForm, setSubscriptionForm] = useState(initialSubscriptionForm);

  useEffect(() => {
    const requested = searchParams.get('screen');
    if (requested && ['today', 'customers', 'requests'].includes(requested)) setScreen(requested as Screen);
  }, [searchParams]);

  const refresh = async () => {
    setLoading(true);
    const results = await Promise.all([
      getCurrentUser(), getDashboardStats(), getCustomers({ pageSize: 100 }), getServices(),
      getSubscriptions(), getPendingPayments(), getCRMWorkspace(),
    ]);
    if (!results[0]) {
      router.replace('/login');
      return;
    }
    if (results[1].success) setStats(results[1].stats);
    if (results[2].success) setCustomers(results[2].customers);
    if (results[3].success) setServices(results[3].services);
    if (results[4].success) setSubscriptions(results[4].subscriptions);
    if (results[5].success) setPayments(results[5].requests);
    if (results[6].success) setWorkspace(results[6]);
    const failed = results.slice(1).find((result: any) => !result.success) as any;
    setNotice(failed?.error || '');
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const expiring = useMemo(() => subscriptions.filter((item) => {
    const days = Math.ceil((new Date(item.endDate).getTime() - new Date(todayDate()).getTime()) / 86_400_000);
    return days >= 0 && days <= 7 && item.status === 'active';
  }), [subscriptions]);
  const unattended = useMemo(() => customers.filter((item) => {
    if (!item.lastContactAt) return true;
    return Date.now() - new Date(item.lastContactAt).getTime() > 3 * 86_400_000;
  }), [customers]);
  const openTasks = useMemo(() => (workspace?.tasks || []).filter((item: any) => item.status !== 'done' && item.status !== 'cancelled'), [workspace]);
  const visibleCustomers = useMemo(() => customers.filter((item) => {
    const keyword = search.trim().toLowerCase();
    return !keyword || item.name.toLowerCase().includes(keyword) || item.phone.includes(keyword) || item.company?.toLowerCase().includes(keyword);
  }), [customers, search]);
  const selectedService = useMemo(
    () => services.find((item) => item.id === subscriptionForm.serviceId),
    [services, subscriptionForm.serviceId],
  );
  const selectedPlan = useMemo(
    () => selectedService?.plans?.find((item: any) => item.id === subscriptionForm.servicePlanId),
    [selectedService, subscriptionForm.servicePlanId],
  );
  const basePrice = Number(selectedPlan?.price || selectedService?.defaultSellingPrice || 0);
  const discountValue = Math.max(0, Number(subscriptionForm.discountValue || 0));
  const discountAmount = subscriptionForm.discountType === 'percentage'
    ? Math.min(basePrice, basePrice * Math.min(100, discountValue) / 100)
    : subscriptionForm.discountType === 'fixed' ? Math.min(basePrice, discountValue) : 0;
  const finalPrice = Math.max(0, basePrice - discountAmount);
  const selectedPlanUnavailable = Boolean(selectedPlan?.trackInventory && selectedPlan.stockQuantity <= 0);

  const submitCustomer = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addCustomer({ ...customerForm, stage: 'customer' });
      if (result.success) {
        setNotice('تمت إضافة العميل.');
        setCustomerForm({ name: '', phone: '', company: '', notes: '' });
        setModal(null);
        await refresh();
      } else setNotice(result.error || 'تعذر إضافة العميل.');
    });
  };

  const submitSubscription = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await addSubscription({
        customerId: subscriptionForm.customerId,
        serviceId: subscriptionForm.serviceId,
        servicePlanId: subscriptionForm.servicePlanId || undefined,
        startDate: subscriptionForm.startDate,
        discountType: subscriptionForm.discountType,
        discountValue,
      });
      if (result.success) {
        setNotice('تمت إضافة الاشتراك بالسعر والمدة المحفوظين.');
        setModal(null);
        await refresh();
      } else setNotice(result.error || 'تعذر إضافة الاشتراك.');
    });
  };

  const approve = (payment: any) => {
    startTransition(async () => {
      const result = await approvePayment(payment.id, payment.transactionId || undefined);
      setNotice(result.success ? 'تم اعتماد الطلب وشحن الرصيد.' : result.error || 'تعذر اعتماد الطلب.');
      if (result.success) await refresh();
    });
  };

  const reject = (payment: any) => {
    const reason = prompt('اكتب سبب الرفض لإرساله للعميل:');
    if (reason === null) return;
    startTransition(async () => {
      const result = await rejectPayment(payment.id, reason);
      setNotice(result.success ? 'تم رفض الطلب وإبلاغ العميل.' : result.error || 'تعذر رفض الطلب.');
      if (result.success) await refresh();
    });
  };

  const openCustomerWhatsApp = (customer: any) => {
    const rawPhone = String(customer.phone || '').replace(/\D/g, '');
    const phone = rawPhone.startsWith('0') ? `20${rawPhone.slice(1)}` : rawPhone;
    if (phone.length < 7) return setNotice('رقم العميل غير صالح لواتساب.');
    const greeting = new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
    const message = prompt('اكتب رسالتك، أو استخدم النص الجاهز:', `${greeting} ${customer.name}، نتمنى أن تكون بخير. كيف يمكننا مساعدتك اليوم؟`);
    if (message?.trim()) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`, '_blank', 'noopener,noreferrer');
  };

  const startSubscription = (customerId = '') => {
    const service = services[0];
    const plan = service?.plans?.find((item: any) => !item.trackInventory || item.stockQuantity > 0) || service?.plans?.[0];
    setSubscriptionForm({
      customerId: customerId || customers[0]?.id || '',
      serviceId: service?.id || '',
      servicePlanId: plan?.id || '',
      startDate: todayDate(),
      discountType: 'none',
      discountValue: '',
    });
    setModal('subscription');
  };

  const formatMoney = (value: number) => `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${stats?.currency || 'EGP'}`;

  if (loading) return <div className="mx-auto max-w-6xl animate-pulse space-y-5" dir="rtl"><div className="h-16 rounded-2xl bg-zinc-900" /><div className="h-44 rounded-2xl bg-zinc-900" /><div className="h-72 rounded-2xl bg-zinc-900" /></div>;

  return (
    <section dir="rtl" className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setModal('customer')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-transform duration-150 active:scale-[0.98]"><Plus className="h-4 w-4" />عميل جديد</button>
        <button onClick={() => startSubscription()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-100 transition-colors duration-150 hover:border-zinc-500 active:scale-[0.98]"><Plus className="h-4 w-4" />اشتراك جديد</button>
        <button onClick={() => router.push('/dashboard/setup')} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2.5 text-sm font-bold text-zinc-400 transition-colors duration-150 hover:bg-zinc-900 hover:text-zinc-100 active:scale-[0.98]"><RefreshCw className="h-4 w-4" />إعداد المتجر</button>
      </div>
      {notice ? <div role="status" className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${notice === 'TENANT_SUBSCRIPTION_INACTIVE' ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
        <span>{notice === 'TENANT_SUBSCRIPTION_INACTIVE' ? 'اشتراك متجرك منتهي أو غير نشط. يمكنك التجديد الآن من رصيد المحفظة.' : notice}</span>
        <div className="flex items-center gap-3">
          {notice === 'TENANT_SUBSCRIPTION_INACTIVE' && <button onClick={() => router.push('/dashboard/billing')} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-zinc-950">فتح التجديد</button>}
          <button onClick={() => setNotice('')} aria-label="إغلاق الرسالة"><X className="h-4 w-4" /></button>
        </div>
      </div> : null}
      <HomeSearch />

      {screen === 'today' ? <section className="mt-7 space-y-7">
        <AnalyticsDashboard />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="العملاء" value={stats?.totalCustomers || 0} />
          <Metric label="اشتراكات نشطة" value={stats?.activeSubs || 0} />
          <Metric label="طلبات بانتظارك" value={payments.length} emphasis={payments.length > 0} />
          <Metric label="مهام مفتوحة" value={openTasks.length} />
        </div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">ما يحتاج انتباهك اليوم</h2><p className="mt-1 text-sm text-zinc-500">رتّب يومك من أهم إجراء إلى الأقل.</p></div><button onClick={() => setScreen('requests')} className="text-sm font-bold text-emerald-400 transition-colors duration-150 hover:text-emerald-300">مراجعة الطلبات</button></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <Attention title="طلبات شحن معلقة" count={payments.length} description={payments.length ? 'اعتمد الطلب بعد مراجعة التحويل.' : 'لا توجد طلبات بانتظار الاعتماد.'} action={() => setScreen('requests')} />
            <Attention title="اشتراكات قريبة" count={expiring.length} description={expiring.length ? 'تواصل مع العملاء قبل انتهاء الاشتراك.' : 'لا توجد اشتراكات تنتهي خلال 7 أيام.'} action={() => setScreen('customers')} />
            <Attention title="عملاء بلا متابعة" count={unattended.length} description={unattended.length ? 'أرسل رسالة سريعة أو أضف مهمة متابعة.' : 'كل العملاء لديهم متابعة حديثة.'} action={() => setScreen('customers')} />
          </div>
        </section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"><h2 className="text-lg font-black">آخر المهام</h2>{openTasks.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{openTasks.slice(0, 6).map((task: any) => <div key={task.id} className="rounded-xl bg-zinc-950 px-4 py-3"><p className="font-bold">{task.title}</p><p className="mt-1 text-sm text-zinc-500">{task.customer?.name || 'مهمة عامة'}{task.dueAt ? ` | ${new Date(task.dueAt).toLocaleDateString('ar-EG')}` : ''}</p></div>)}</div> : <Empty text="لا توجد مهام مفتوحة. استخدم قسم الصفقات والفريق لإضافة مهام للفريق." />}</section>
      </section> : null}

      {screen === 'customers' ? <section className="mt-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-black">العملاء</h2><p className="mt-1 text-sm text-zinc-500">إضافة، متابعة، رسالة، أو اشتراك من مكان واحد.</p></div><label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-400">بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-emerald-400 sm:w-72" placeholder="اسم أو رقم هاتف" /></label></div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">{visibleCustomers.map((customer) => <article key={customer.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{customer.name}</h3><p className="mt-1 text-sm text-zinc-500" dir="ltr">{customer.phone}</p>{customer.company ? <p className="mt-1 text-sm text-zinc-400">{customer.company}</p> : null}</div><span className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{customer._count?.subscriptions || 0} اشتراك</span></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => openCustomerWhatsApp(customer)} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 px-3 py-2 text-sm font-bold text-emerald-400 transition-colors duration-150 hover:bg-emerald-500/10 active:scale-[0.98]"><MessageCircle className="h-4 w-4" />رسالة</button><button onClick={() => startSubscription(customer.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold transition-colors duration-150 hover:bg-zinc-800 active:scale-[0.98]"><Plus className="h-4 w-4" />اشتراك</button></div></article>)}</div>
        {!visibleCustomers.length ? <Empty text="لا يوجد عملاء مطابقون. أضف أول عميل لتبدأ." action="إضافة عميل" onAction={() => setModal('customer')} /> : null}
      </section> : null}

      {screen === 'requests' ? <section className="mt-7">
        <div><h2 className="text-xl font-black">طلبات الشحن</h2><p className="mt-1 text-sm text-zinc-500">راجع بيانات التحويل وصورة الإيصال ثم اعتمد الطلب يدويًا.</p></div>
        <div className="mt-5 space-y-3">{payments.map((payment) => {
          const expectedAmount = payment.amount + payment.fraction;
          const methodLabel = payment.paymentMethod?.label || (payment.method === 'instapay' ? 'InstaPay' : payment.method === 'wallet' ? 'محفظة إلكترونية' : payment.method);
          return <article key={payment.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{payment.customer.name}</h3><span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">بانتظار المراجعة</span></div>
                <p className="mt-2 text-sm text-zinc-400">{methodLabel} | المطلوب: <span className="font-bold text-emerald-400">{formatMoney(expectedAmount)}</span></p>
                {payment.reportedAmount ? <p className={`mt-1 text-sm ${Math.abs(payment.reportedAmount - expectedAmount) < 0.01 ? 'text-emerald-300' : 'text-amber-300'}`}>المبلغ الذي سجله العميل: {formatMoney(payment.reportedAmount)}</p> : null}
                <p className="mt-1 text-sm text-zinc-500">التحويل من: {payment.senderIdentifier || 'غير مسجل'} | رقم العملية: {payment.transactionId || 'غير مسجل'}</p>
                {!payment.screenshotUrl ? <p className="mt-1 text-xs text-zinc-600">أكد العميل التحويل بدون إرفاق صورة.</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {payment.screenshotUrl ? <button onPointerEnter={() => prefetchReceipt(payment)} onFocus={() => prefetchReceipt(payment)} onClick={() => openReceipt(payment)} className="inline-flex items-center gap-2 rounded-xl border border-sky-500/30 px-4 py-2.5 text-sm font-bold text-sky-300 transition-colors duration-150 hover:bg-sky-500/10 active:scale-[0.98]"><FileImage className="h-4 w-4" />عرض الإيصال</button> : null}
                <button disabled={isPending} onClick={() => approve(payment)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-transform duration-150 disabled:opacity-50 active:scale-[0.98]"><ClipboardCheck className="h-4 w-4" />اعتماد وشحن الرصيد</button>
                <button disabled={isPending} onClick={() => reject(payment)} className="rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-bold text-red-300 transition-colors duration-150 hover:bg-red-500/10 disabled:opacity-50 active:scale-[0.98]">رفض</button>
              </div>
            </div>
          </article>;
        })}</div>
        {!payments.length ? <Empty text="لا توجد طلبات شحن معلقة الآن." /> : null}
      </section> : null}

      {modal ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-zinc-950/80 p-4"><form onSubmit={modal === 'customer' ? submitCustomer : submitSubscription} className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{modal === 'customer' ? 'عميل جديد' : 'اشتراك جديد'}</h2><button type="button" onClick={() => setModal(null)} aria-label="إغلاق"><X className="h-5 w-5 text-zinc-400" /></button></div>{modal === 'customer' ? <div className="mt-5 space-y-4"><Field label="اسم العميل"><input required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} className={inputClass} /></Field><Field label="رقم الهاتف"><input required value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} className={inputClass} dir="ltr" /></Field><Field label="الشركة (اختياري)"><input value={customerForm.company} onChange={(event) => setCustomerForm({ ...customerForm, company: event.target.value })} className={inputClass} /></Field><Field label="ملاحظات (اختياري)"><textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} className={`${inputClass} min-h-24`} /></Field></div> : <div className="mt-5 space-y-4"><Field label="العميل"><select required value={subscriptionForm.customerId} onChange={(event) => setSubscriptionForm({ ...subscriptionForm, customerId: event.target.value })} className={inputClass}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="الخدمة"><select required value={subscriptionForm.serviceId} onChange={(event) => { const service = services.find((item) => item.id === event.target.value); const plan = service?.plans?.find((item: any) => !item.trackInventory || item.stockQuantity > 0) || service?.plans?.[0]; setSubscriptionForm({ ...subscriptionForm, serviceId: event.target.value, servicePlanId: plan?.id || '' }); }} className={inputClass}>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field><Field label="الباقة والمدة"><select required={Boolean(selectedService?.plans?.length)} value={subscriptionForm.servicePlanId} onChange={(event) => setSubscriptionForm({ ...subscriptionForm, servicePlanId: event.target.value })} className={inputClass}>{selectedService?.plans?.length ? selectedService.plans.map((plan: any) => <option key={plan.id} value={plan.id} disabled={plan.trackInventory && plan.stockQuantity <= 0}>{plan.name} | {plan.durationDays} يوم | {formatMoney(plan.price)}{plan.trackInventory ? ` | متاح ${plan.stockQuantity}` : ''}</option>) : <option value="">الخطة الافتراضية للخدمة</option>}</select></Field><Field label="تاريخ البداية"><input required type="date" value={subscriptionForm.startDate} onChange={(event) => setSubscriptionForm({ ...subscriptionForm, startDate: event.target.value })} className={inputClass} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="الخصم (اختياري)"><select value={subscriptionForm.discountType} onChange={(event) => setSubscriptionForm({ ...subscriptionForm, discountType: event.target.value as DiscountType, discountValue: event.target.value === 'none' ? '' : subscriptionForm.discountValue })} className={inputClass}><option value="none">بدون خصم</option><option value="percentage">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></Field>{subscriptionForm.discountType !== 'none' ? <Field label={subscriptionForm.discountType === 'percentage' ? 'نسبة الخصم %' : 'قيمة الخصم'}><input required type="number" min="0" max={subscriptionForm.discountType === 'percentage' ? 100 : basePrice} step="0.01" value={subscriptionForm.discountValue} onChange={(event) => setSubscriptionForm({ ...subscriptionForm, discountValue: event.target.value })} className={inputClass} /></Field> : null}</div><div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex justify-between text-sm text-zinc-400"><span>سعر الباقة</span><span>{formatMoney(basePrice)}</span></div>{discountAmount > 0 ? <div className="mt-2 flex justify-between text-sm text-amber-300"><span>الخصم</span><span>{formatMoney(discountAmount)}</span></div> : null}<div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 font-black"><span>المطلوب من العميل</span><span className="text-emerald-400">{formatMoney(finalPrice)}</span></div>{selectedPlan?.durationDays ? <p className="mt-2 text-xs text-zinc-500">المدة {selectedPlan.durationDays} يوم وتاريخ الانتهاء يُحسب تلقائيًا.</p> : null}{selectedPlanUnavailable ? <p className="mt-2 text-xs font-bold text-red-300">هذه الباقة غير متاحة حاليًا بسبب نفاد المخزون.</p> : null}</div>{!services.length ? <p className="text-sm text-amber-300">أضف خدمة وباقة أولًا من قسم الخدمات.</p> : null}</div>}<button disabled={isPending || (modal === 'subscription' && (!services.length || !customers.length || selectedPlanUnavailable))} className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-transform duration-150 disabled:opacity-50 active:scale-[0.98]">{isPending ? 'جارٍ الحفظ...' : 'حفظ'}</button></form></div> : null}

      {receiptPayment ? <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/90 p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="receipt-title" className="text-xl font-black">إيصال {receiptPayment.customer.name}</h2><p className="mt-1 text-sm text-zinc-500">راجع الصورة ورقم العملية قبل الاعتماد.</p></div>
            <button onClick={() => setReceiptPayment(null)} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition-colors duration-150 hover:bg-zinc-800 hover:text-white active:scale-[0.97]" aria-label="إغلاق"><X className="h-5 w-5" /></button>
          </div>
          <div aria-busy={receiptStatus === 'loading'} className="relative mt-4 flex min-h-80 max-h-[65vh] items-center justify-center overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            {receiptStatus === 'loading' ? <div role="status" aria-live="polite" className="absolute inset-0 z-10 grid place-items-center bg-zinc-950/95">
              <div className="text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-sky-300" /><p className="mt-3 text-sm font-bold text-zinc-200">جارٍ تحميل الإيصال...</p><p className="mt-1 text-xs text-zinc-500">سيظهر خلال لحظات</p></div>
            </div> : null}
            {receiptStatus === 'error' ? <div role="alert" className="z-10 max-w-sm text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-red-300"><ImageOff className="h-6 w-6" /></span>
              <p className="mt-3 font-black text-zinc-100">تعذر تحميل الإيصال</p><p className="mt-1 text-sm leading-6 text-zinc-500">تحقق من اتصال الإنترنت ثم حاول مرة أخرى.</p>
              <button onClick={retryReceipt} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-black text-zinc-950 transition-transform duration-150 active:scale-[0.97]"><RotateCcw className="h-4 w-4" />إعادة المحاولة</button>
            </div> : null}
            <img key={`${receiptPayment.id}-${receiptAttempt}`} src={receiptUrl(receiptPayment.id, receiptAttempt)} alt={`إيصال دفع ${receiptPayment.customer.name}`} loading="eager" decoding="async" fetchPriority="high" onLoad={() => setReceiptStatus('loaded')} onError={() => setReceiptStatus('error')} className={`max-h-[60vh] max-w-full rounded-lg object-contain transition-opacity duration-200 ${receiptStatus === 'loaded' ? 'opacity-100' : 'pointer-events-none absolute opacity-0'}`} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-zinc-400">المبلغ: <span className="font-bold text-emerald-400">{formatMoney(receiptPayment.amount + receiptPayment.fraction)}</span> | العملية: {receiptPayment.transactionId || 'غير مسجل'}</p><a href={receiptUrl(receiptPayment.id)} target="_blank" rel="noreferrer" className="font-bold text-sky-300 transition-colors duration-150 hover:text-sky-200">فتح بالحجم الكامل</a></div>
        </div>
      </div> : null}
    </section>
  );
}

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors duration-150 focus:border-emerald-400';
function Metric({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) { return <div className={`rounded-2xl border p-4 ${emphasis ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900/50'}`}><p className="text-sm text-zinc-500">{label}</p><p className={`mt-2 text-3xl font-black ${emphasis ? 'text-emerald-400' : 'text-zinc-100'}`}>{value}</p></div>; }
function Attention({ title, count, description, action }: { title: string; count: number; description: string; action: () => void }) { return <button onClick={action} className="rounded-xl bg-zinc-950 p-4 text-right transition-colors duration-150 hover:bg-zinc-800 active:scale-[0.98]"><p className="font-bold">{title}</p><p className="mt-2 text-2xl font-black text-emerald-400">{count}</p><p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p></button>; }
function Empty({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) { return <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 p-8 text-center"><p className="text-sm text-zinc-500">{text}</p>{action && onAction ? <button onClick={onAction} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition-transform duration-150 active:scale-[0.98]"><Plus className="h-4 w-4" />{action}</button> : null}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">{label}</span>{children}</label>; }
export default function DashboardPage() {
  return <Suspense fallback={<div className="mx-auto max-w-6xl animate-pulse space-y-5"><div className="h-16 rounded-2xl bg-zinc-900" /><div className="h-44 rounded-2xl bg-zinc-900" /></div>}><DashboardWorkspace /></Suspense>;
}
