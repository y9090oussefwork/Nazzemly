/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/immutability */
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import {
  changeMerchantPassword,
  requestSaaSRecharge,
  renewSaaSPlan,
  setSaaSAutoRenew,
  getMySaaSPayments,
  getSaaSBillingOverview,
} from '@/app/actions/billing';
import {
  Wallet,
  Clock,
  KeyRound,
  Coins,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  CircleUserRound,
  Building2,
  CreditCard,
  UsersRound,
  ArrowUpRight,
} from 'lucide-react';
import ReferralCenter from './referral-center';

type BillingTab = 'account' | 'wallet' | 'subscription' | 'referral';

export default function BillingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // States
  const [tenant, setTenant] = useState<any>(null);
  const [myPayments, setMyPayments] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState('basic');
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [activeTab, setActiveTab] = useState<BillingTab>('account');
  const [billingNotice, setBillingNotice] = useState('');
  const [billingLoading, setBillingLoading] = useState(true);

  // Forms
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', password: '', confirm: '' });
  const [rechargeForm, setRechargeForm] = useState({ amount: 150, method: 'vodafone_cash' as 'vodafone_cash' | 'instapay', senderIdentifier: '' });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    async function loadUser() {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/login');
      } else {
        setCurrentUser(user);
        await refreshBillingData();
      }
    }
    loadUser();
  }, [mounted, router]);

  const refreshBillingData = async () => {
    setBillingLoading(true);
    setBillingNotice('');
    try {
      const [overviewRes, payRes] = await Promise.all([getSaaSBillingOverview(), getMySaaSPayments()]);
      if (overviewRes.success && overviewRes.tenant) {
        setTenant(overviewRes.tenant);
        if (overviewRes.tenant.saasPlan && overviewRes.tenant.saasPlan !== 'free_trial') {
          setSelectedPlanCode(overviewRes.tenant.saasPlan);
        }
      } else {
        setTenant(null);
        setBillingNotice(overviewRes.error || 'تعذر تحميل حالة الاشتراك. حاول تحديث الصفحة.');
      }

      if (payRes.success) {
        setMyPayments(payRes.requests);
        setPlans(payRes.plans || []);
        if (payRes.plans?.length && !payRes.plans.some((plan: any) => plan.code === selectedPlanCode)) {
          setSelectedPlanCode(payRes.plans[0].code);
        }
      } else if (overviewRes.success) {
        setBillingNotice(payRes.error || 'تعذر تحميل تفاصيل الباقات وطلبات الشحن.');
      }
    } catch (e) {
      console.error('Error fetching billing data:', e);
      setBillingNotice('تعذر الاتصال بخدمة الفوترة الآن. أعد المحاولة بعد لحظات.');
    } finally {
      setBillingLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.password !== passwordForm.confirm) {
      alert('كلمتا المرور غير متطابقتين!');
      return;
    }

    startTransition(async () => {
      const res = await changeMerchantPassword(passwordForm.currentPassword, passwordForm.password);
      if (res.success) {
        alert('تم تغيير كلمة المرور بنجاح!');
        setPasswordForm({ currentPassword: '', password: '', confirm: '' });
      } else {
        alert(res.error || 'فشل تغيير كلمة المرور');
      }
    });
  };

  const handleRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechargeForm.senderIdentifier) {
      alert('برجاء كتابة رقم الهاتف المحول منه أو اسم المستخدم!');
      return;
    }

    startTransition(async () => {
      const res = await requestSaaSRecharge(rechargeForm.amount, rechargeForm.method, rechargeForm.senderIdentifier);
      if (res.success) {
        alert('تم تقديم طلب الشحن للمراجعة بنجاح! سيتم فحص المعاملة وشحن رصيدك خلال دقائق.');
        setRechargeForm({ amount: 150, method: 'vodafone_cash', senderIdentifier: '' });
        await refreshBillingData();
      } else {
        alert(res.error || 'فشل تقديم طلب الشحن');
      }
    });
  };

  const selectedPlan = plans.find((plan) => plan.code === selectedPlanCode) || plans[0];
  const listRenewalAmount = selectedPlan
    ? selectedMonths === 12 && selectedPlan.priceYearly
      ? selectedPlan.priceYearly
      : selectedPlan.priceMonthly * selectedMonths
    : 0;
  const referralDiscount = tenant?.referralOffer?.isEligible
    ? Math.min(listRenewalAmount, Number(tenant.referralOffer.amount || 0))
    : 0;
  const renewalAmount = Math.max(0, listRenewalAmount - referralDiscount);
  const annualSaving = selectedPlan?.priceYearly
    ? Math.max(0, selectedPlan.priceMonthly * 12 - selectedPlan.priceYearly)
    : 0;

  const handleRenewClick = async () => {
    if (!selectedPlan) return;
    const planName = selectedPlan.name || selectedPlan.code;
    if (confirm(`تأكيد ${tenant?.saasStatus === 'active' ? 'تمديد' : 'تفعيل'} الباقة ${planName} لمدة ${selectedMonths} ${selectedMonths === 1 ? 'شهر' : 'شهور'} بقيمة ${renewalAmount.toFixed(2)} EGP؟ سيتم الخصم من رصيدك.`)) {
      startTransition(async () => {
        const res = await renewSaaSPlan({ planCode: selectedPlan.code, months: selectedMonths });
        if (res.success) {
          alert(`تم ${tenant?.saasStatus === 'active' ? 'تمديد' : 'تفعيل'} اشتراكك بنجاح لمدة ${selectedMonths} ${selectedMonths === 1 ? 'شهر' : 'شهور'}.`);
          await refreshBillingData();
        } else {
          alert(res.error || 'فشل تجديد الاشتراك');
        }
      });
    }
  };

  const handleAutoRenewChange = (enabled: boolean) => {
    startTransition(async () => {
      const res = await setSaaSAutoRenew(enabled);
      if (res.success) {
        setTenant((current: any) => current ? { ...current, autoRenew: res.autoRenew } : current);
      } else {
        alert(res.error || 'تعذر تحديث التجديد التلقائي');
      }
    });
  };

  const formatExpiry = (expiryDate: string | null) => {
    if (!expiryDate) return <span className="text-zinc-500 font-bold">لا يوجد تاريخ</span>;
    const end = new Date(expiryDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return <span className="text-red-500 font-bold">منتهي منذ {Math.abs(diff)} يوم</span>;
    if (diff === 0) return <span className="text-amber-500 font-bold">ينتهي اليوم</span>;
    return <span className="text-emerald-500 font-bold">{end.toLocaleDateString('en-GB')} ({diff} يوم متبقي)</span>;
  };

  if (!mounted) return null;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const tabs: Array<{ id: BillingTab; title: string; description: string; icon: typeof CircleUserRound }> = [
    { id: 'account', title: 'حسابي', description: 'ملف التاجر والأمان', icon: CircleUserRound },
    { id: 'wallet', title: 'المحفظة', description: 'الرصيد وطلبات الشحن', icon: Wallet },
    { id: 'subscription', title: 'اشتراك المنصة', description: 'الباقة والتجديد', icon: CreditCard },
    { id: 'referral', title: 'نظام الإحالة', description: 'دعواتك وعمولتك', icon: UsersRound },
  ];
  const roleLabel = currentUser.role === 'owner' ? 'مالك المتجر' : currentUser.role === 'admin' ? 'مدير المتجر' : 'عضو في الفريق';

  return (
    <section className="mx-auto max-w-6xl pb-10" dir="rtl">
      <header className="mb-6 flex flex-col gap-4 border-b border-zinc-800/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">الحساب والفوترة</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">كل ما يخص حساب متجرك، رصيدك، اشتراك المنصة، ومكافآت الإحالة في مكان واحد.</p>
        </div>
        {tenant ? <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-right">
          <p className="text-[11px] font-bold text-zinc-400">رصيد المحفظة</p>
          <p className="mt-1 text-lg font-black tabular-nums text-emerald-400">{Number(tenant.saasBalance || 0).toFixed(2)} EGP</p>
        </div> : null}
      </header>

      {billingNotice ? <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100"><span>{billingNotice}</span><button type="button" onClick={() => void refreshBillingData()} className="rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-black text-amber-100">إعادة المحاولة</button></div> : null}

      <nav aria-label="أقسام الحساب والفوترة" className="mb-7 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/35 p-1.5">
        <div className="flex min-w-max gap-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            const buttonClass = active ? 'bg-emerald-400 text-black shadow-sm' : 'text-white hover:bg-zinc-800/80';
            const descriptionClass = active ? 'text-emerald-950' : 'text-zinc-500';
            return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={active ? 'page' : undefined} className={`flex min-w-40 items-center gap-3 rounded-xl px-4 py-3 text-right transition-colors ${buttonClass}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span><span className="block text-sm font-black">{tab.title}</span><span className={`block pt-0.5 text-[10px] font-bold ${descriptionClass}`}>{tab.description}</span></span>
            </button>;
          })}
        </div>
      </nav>

      {activeTab === 'account' ? <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-3xl border border-zinc-800/80 bg-zinc-900/35 p-6 shadow-xl shadow-black/10">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-800/70 pb-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400"><CircleUserRound className="h-5 w-5" /></div>
              <div><h2 className="font-black text-white">ملف حساب التاجر</h2><p className="mt-1 text-xs font-semibold text-zinc-500">بيانات الدخول والمستوى داخل المتجر</p></div>
            </div>
            <button type="button" onClick={() => router.push('/dashboard/settings?tab=store')} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-black text-zinc-200 transition-colors hover:border-emerald-500/60 hover:text-emerald-300">تعديل بيانات المتجر <ArrowUpRight className="h-3.5 w-3.5" /></button>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4"><dt className="text-[11px] font-bold text-zinc-500">اسم المستخدم</dt><dd className="mt-1.5 font-black text-white" dir="ltr">{currentUser.username}</dd></div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4"><dt className="text-[11px] font-bold text-zinc-500">دورك</dt><dd className="mt-1.5 font-black text-white">{roleLabel}</dd></div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 sm:col-span-2"><dt className="text-[11px] font-bold text-zinc-500">اسم المتجر</dt><dd className="mt-1.5 flex items-center gap-2 font-black text-white"><Building2 className="h-4 w-4 text-emerald-400" />{tenant?.storeName || currentUser.storeName || 'لم يتم تحديد الاسم بعد'}</dd></div>
          </dl>
          <p className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs font-semibold leading-6 text-sky-100">تستطيع تعديل بيانات النشاط ووسائل التواصل وطرق الدفع من صفحة بيانات المتجر.</p>
        </article>

        <article className="rounded-3xl border border-zinc-800/80 bg-zinc-900/35 p-6 shadow-xl shadow-black/10">
          <h2 className="flex items-center gap-2 border-b border-zinc-800/70 pb-4 text-sm font-black text-white"><KeyRound className="h-5 w-5 text-emerald-400" />تغيير كلمة مرور الحساب</h2>
          <form onSubmit={handlePasswordSubmit} className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">كلمة المرور الحالية</span><input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder="الحالية" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-white outline-none transition-colors focus:border-emerald-500" dir="ltr" required /></label>
            <label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">كلمة المرور الجديدة</span><input type="password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} placeholder="الجديدة" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-white outline-none transition-colors focus:border-emerald-500" dir="ltr" required /></label>
            <label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">تأكيد كلمة المرور</span><input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="أعد إدخالها" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-white outline-none transition-colors focus:border-emerald-500" dir="ltr" required /></label>
            <button type="submit" disabled={isPending} className="sm:col-span-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-black text-white transition-colors hover:border-emerald-500/60 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}حفظ كلمة المرور الجديدة</button>
          </form>
        </article>
      </div> : null}

      {activeTab === 'wallet' ? <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <article className="rounded-3xl border border-emerald-500/25 bg-zinc-900/35 p-6">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-500/30 text-emerald-400"><Wallet className="h-5 w-5" /></div><div><h2 className="font-black text-white">محفظة المنصة</h2><p className="mt-1 text-xs font-semibold text-zinc-500">تُستخدم لتجديد اشتراك متجرك</p></div></div>
            <p className="mt-8 text-[11px] font-bold text-zinc-400">الرصيد المتاح الآن</p><p className="mt-1 text-3xl font-black tabular-nums text-emerald-400">{billingLoading ? '—' : `${Number(tenant?.saasBalance || 0).toFixed(2)} EGP`}</p>
            <p className="mt-5 text-xs font-semibold leading-6 text-zinc-400">بعد اعتماد طلب الشحن، يضاف الرصيد إلى المحفظة ويمكنك استعماله في التجديد مباشرةً.</p>
          </article>
          <article className="rounded-3xl border border-zinc-800/80 bg-zinc-900/35 p-6 shadow-xl shadow-black/10">
            <h2 className="flex items-center gap-2 border-b border-zinc-800/70 pb-4 text-sm font-black text-white"><Coins className="h-5 w-5 text-emerald-400" />تقديم طلب شحن للمحفظة</h2>
            <p className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs font-semibold leading-6 text-emerald-50">حوّل المبلغ إلى <span className="font-black">01026040854</span> عبر فودافون كاش أو إلى <span className="font-black">nexus@instapay</span> عبر إنستا باي، ثم أرسل بيانات التحويل هنا لاعتمادها.</p>
            <form onSubmit={handleRechargeSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">المبلغ المحول (EGP)</span><input type="number" min="1" value={rechargeForm.amount} onChange={(e) => setRechargeForm({ ...rechargeForm, amount: Number(e.target.value) })} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500" required /></label>
              <label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">طريقة التحويل</span><select value={rechargeForm.method} onChange={(e) => setRechargeForm({ ...rechargeForm, method: e.target.value as 'vodafone_cash' | 'instapay' })} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"><option value="vodafone_cash">فودافون كاش</option><option value="instapay">إنستا باي</option></select></label>
              <label className="block sm:col-span-2"><span className="mb-2 block text-[11px] font-bold text-zinc-400">رقم الهاتف المحول منه أو اسم مرسل إنستا باي</span><input type="text" value={rechargeForm.senderIdentifier} onChange={(e) => setRechargeForm({ ...rechargeForm, senderIdentifier: e.target.value })} placeholder="اكتب البيانات التي تساعدنا على مطابقة التحويل" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500" required /></label>
              <button type="submit" disabled={isPending} className="sm:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}تقديم طلب الشحن للإدارة</button>
            </form>
          </article>
        </div>
        <article className="rounded-3xl border border-zinc-800/80 bg-zinc-900/35 p-6 shadow-xl shadow-black/10">
          <h2 className="flex items-center gap-2 border-b border-zinc-800/70 pb-4 text-sm font-black text-white"><Clock className="h-5 w-5 text-emerald-400" />سجل طلبات الشحن</h2>
          {myPayments.length === 0 ? <p className="py-10 text-center text-sm font-semibold text-zinc-500">لا توجد طلبات شحن حتى الآن.</p> : <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-800/70"><table className="min-w-[720px] w-full text-right"><thead><tr className="border-b border-zinc-800 bg-zinc-950/50 text-[11px] text-zinc-400"><th className="p-3">التاريخ</th><th className="p-3">المبلغ</th><th className="p-3">الطريقة</th><th className="p-3">المرسل</th><th className="p-3">الحالة</th><th className="p-3">ملاحظات الإدارة</th></tr></thead><tbody>{myPayments.map((p) => <tr key={p.id} className="border-b border-zinc-800/60 text-xs font-semibold text-zinc-300 last:border-0"><td className="p-3 text-zinc-500">{new Date(p.createdAt).toLocaleDateString('en-GB')}</td><td className="p-3 font-black text-emerald-400">{Number(p.amount).toFixed(2)} EGP</td><td className="p-3">{p.method === 'instapay' ? 'إنستا باي' : 'فودافون كاش'}</td><td className="p-3" dir="ltr">{p.senderIdentifier}</td><td className="p-3"><span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${p.status === 'approved' ? 'border-emerald-500/30 text-emerald-400' : p.status === 'rejected' ? 'border-red-500/30 text-red-400' : 'border-amber-500/30 text-amber-400'}`}>{p.status === 'approved' ? 'تم الشحن' : p.status === 'rejected' ? 'مرفوض' : 'بانتظار المراجعة'}</span></td><td className="p-3 text-zinc-400">{p.notes || '—'}</td></tr>)}</tbody></table></div>}
        </article>
      </div> : null}

      {activeTab === 'subscription' ? <div className="mx-auto max-w-3xl">
        {billingLoading ? <div className="h-[560px] animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/40" /> : tenant ? (() => {
          const expiry = tenant.saasExpiry ? new Date(tenant.saasExpiry) : null;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const expiryDay = expiry ? new Date(expiry) : null; expiryDay?.setHours(0, 0, 0, 0);
          const daysRemaining = expiryDay ? Math.ceil((expiryDay.getTime() - today.getTime()) / 86400000) : null;
          const inactive = tenant.saasStatus !== 'active' || (expiry && expiry <= new Date());
          const dueSoon = !inactive && daysRemaining !== null && daysRemaining <= 2;
          const planLabel = tenant.saasPlan === 'free_trial' ? 'فترة تجريبية' : tenant.saasPlan === 'basic' ? 'الباقة الأساسية' : tenant.saasPlan === 'premium' ? 'الباقة الاحترافية' : tenant.saasPlan;
          return <article className="space-y-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/35 p-6 shadow-xl shadow-black/10 sm:p-8">
            <div className="flex flex-col gap-4 border-b border-zinc-800/70 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-black text-white"><CreditCard className="h-5 w-5 text-emerald-400" />اشتراك المنصة</h2><p className="mt-1 text-sm font-semibold text-zinc-500">اختر الباقة والمدة، ثم جدّد من رصيد محفظتك.</p></div><div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left"><p className="text-[10px] font-bold text-zinc-500">رصيدك المتاح</p><p className="mt-1 font-black tabular-nums text-emerald-400">{Number(tenant.saasBalance || 0).toFixed(2)} EGP</p></div></div>
            <div className={`rounded-2xl border p-4 text-sm leading-6 ${inactive ? 'border-red-500/40 bg-red-500/10 text-red-100' : dueSoon ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-50'}`}><div className="flex items-start gap-3">{inactive || dueSoon ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />}<div><p className="font-black text-white">{inactive ? 'اشتراك المتجر منتهي ويحتاج إلى تجديد' : dueSoon ? `ينتهي اشتراكك خلال ${Math.max(daysRemaining || 0, 0)} يوم` : 'اشتراك المتجر نشط'}</p><p className="mt-1 text-xs font-semibold opacity-80">{inactive ? 'جدّد من المحفظة الآن لتعود أدوات متجرك مباشرةً.' : dueSoon ? 'سيحاول التجديد التلقائي قبل الانتهاء بيومين إذا كان الرصيد كافياً.' : 'سننبهك قبل موعد الانتهاء حتى لا تتوقف أدوات متجرك.'}</p></div></div></div>
            <dl className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4"><dt className="text-[11px] font-bold text-zinc-500">الباقة الحالية</dt><dd className="mt-1.5 font-black text-white">{planLabel}</dd></div><div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4"><dt className="text-[11px] font-bold text-zinc-500">تاريخ الانتهاء</dt><dd className="mt-1.5 text-sm">{formatExpiry(tenant.saasExpiry)}</dd></div><div className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4"><dt className="text-[11px] font-bold text-zinc-500">حالة الخدمة</dt><dd className={`mt-1.5 font-black ${inactive ? 'text-red-400' : 'text-emerald-400'}`}>{inactive ? 'منتهي أو معلق' : 'نشط'}</dd></div></dl>
            <div className="grid gap-4 border-t border-zinc-800/70 pt-6 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">اختر الباقة</span><select value={selectedPlanCode} onChange={(event) => setSelectedPlanCode(event.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-emerald-500">{plans.length === 0 ? <option value="basic">الباقة الأساسية</option> : plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} — {Number(plan.priceMonthly).toFixed(2)} EGP / شهر</option>)}</select></label><label className="block"><span className="mb-2 block text-[11px] font-bold text-zinc-400">مدة الاشتراك</span><select value={selectedMonths} onChange={(event) => setSelectedMonths(Number(event.target.value))} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-emerald-500"><option value={1}>شهر واحد</option><option value={3}>3 شهور</option><option value={6}>6 شهور</option><option value={12}>سنة كاملة</option></select></label></div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-950/70 px-4 py-4"><span className="text-sm font-bold text-zinc-400">القيمة المطلوبة</span><span className="text-xl font-black tabular-nums text-emerald-400">{renewalAmount.toFixed(2)} EGP</span>{referralDiscount > 0 ? <span className="basis-full text-xs font-black text-emerald-300">تم تطبيق خصم الإحالة لأول اشتراك مدفوع: −{referralDiscount.toFixed(2)} EGP (بدلاً من {listRenewalAmount.toFixed(2)} EGP).</span> : null}{selectedMonths === 12 && annualSaving > 0 ? <span className="basis-full text-xs font-black text-emerald-400">توفر {annualSaving.toFixed(2)} EGP عند اختيار السنة الكاملة.</span> : null}</div>
            {(tenant.saasBalance || 0) >= renewalAmount && renewalAmount > 0 ? <button type="button" onClick={handleRenewClick} disabled={isPending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{inactive ? 'تفعيل الاشتراك الآن' : 'تجديد الاشتراك الآن'}</button> : <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-center text-xs font-bold leading-6 text-amber-100">الرصيد غير كافٍ لهذه المدة. تحتاج إلى {Math.max(0, renewalAmount - (tenant.saasBalance || 0)).toFixed(2)} EGP إضافية. انتقل إلى تبويب المحفظة لشحن الرصيد.</div>}
            {tenant.autoRenewAvailable !== false ? <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 text-xs text-zinc-300"><input type="checkbox" checked={Boolean(tenant.autoRenew)} onChange={(event) => handleAutoRenewChange(event.target.checked)} disabled={isPending} className="mt-0.5 h-4 w-4 accent-emerald-500" /><span><strong className="text-white">تفعيل التجديد التلقائي</strong><br /><span className="mt-1 block text-[11px] leading-5 text-zinc-500">سيحاول النظام التجديد قبل الانتهاء بيومين من رصيدك. لا يتم الخصم إذا لم يكفِ الرصيد.</span></span></label> : <p className="rounded-2xl border border-sky-500/25 p-3 text-xs leading-6 text-sky-100">سيظهر خيار التجديد التلقائي بعد تطبيق تحديث قاعدة البيانات الأخير على السيرفر.</p>}
          </article>;
        })() : <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 text-center text-sm font-semibold leading-7 text-amber-100">لم نستطع قراءة بيانات اشتراكك حالياً. استخدم زر إعادة المحاولة بالأعلى، وإذا استمرت المشكلة تواصل مع الدعم.</div>}
      </div> : null}

      {activeTab === 'referral' ? <ReferralCenter /> : null}
    </section>
  );
}
