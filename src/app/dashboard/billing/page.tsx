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
} from 'lucide-react';

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
  const renewalAmount = selectedPlan
    ? selectedMonths === 12 && selectedPlan.priceYearly
      ? selectedPlan.priceYearly
      : selectedPlan.priceMonthly * selectedMonths
    : 0;
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

  return (
    <section className="mx-auto max-w-6xl" dir="rtl">
      
      <div className="mb-6">
        <p className="text-sm font-bold text-emerald-400">إدارة المتجر</p>
        <h2 className="mt-1 text-xl font-black text-white">الحساب والفوترة</h2>
      </div>
      {billingNotice ? <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"><span>{billingNotice}</span><button onClick={() => void refreshBillingData()} className="rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-black text-amber-100">إعادة المحاولة</button></div> : null}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        
        {/* Left Column: Account Plan Summary & Renew */}
        <div className="space-y-8 lg:col-span-1">
          
          {/* Plan Status Card */}
          {billingLoading ? <div className="h-80 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/40" /> : tenant ? (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl space-y-5 text-right">
              <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-zinc-800/50 pb-3">
                <Wallet className="w-5 h-5 text-emerald-400" />
                <span>اشتراك المتجر الحالي</span>
              </h3>

              {(() => {
                const expiry = tenant.saasExpiry ? new Date(tenant.saasExpiry) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const expiryDay = expiry ? new Date(expiry) : null;
                expiryDay?.setHours(0, 0, 0, 0);
                const daysRemaining = expiryDay ? Math.ceil((expiryDay.getTime() - today.getTime()) / 86400000) : null;
                const inactive = tenant.saasStatus !== 'active' || (expiry && expiry <= new Date());
                const dueSoon = !inactive && daysRemaining !== null && daysRemaining <= 2;
                return (
                  <>
                    <div className={`rounded-2xl border p-4 text-xs leading-6 ${inactive ? 'border-red-500/40 bg-red-500/10 text-red-100' : dueSoon ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-50'}`}>
                      <div className="flex items-start gap-2">
                        {inactive || dueSoon ? <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-300" /> : <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />}
                        <div>
                          <p className="font-black text-white">{inactive ? 'اشتراك المتجر منتهي ويحتاج إلى تجديد' : dueSoon ? `ينتهي اشتراكك خلال ${Math.max(daysRemaining || 0, 0)} يوم` : 'اشتراك المتجر نشط'}</p>
                          <p className="text-[11px] opacity-80">{inactive ? 'يمكنك التجديد الآن من رصيد المحفظة، وستعود خدمات المتجر فوراً بعد نجاح العملية.' : dueSoon ? 'لديك وقت كافٍ للتجديد. سيحاول النظام التجديد تلقائياً إذا كان الخيار مفعلاً والرصيد كافياً.' : 'تظهر لك هنا حالة الاشتراك والتنبيه قبل موعد الانتهاء بوضوح.'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-bold">باقة المتجر:</span>
                  <span className="text-white font-black text-sm uppercase">
                    {tenant.saasPlan === 'free_trial' && 'فترة تجريبية (Trial)'}
                    {tenant.saasPlan === 'basic' && 'الباقة الأساسية'}
                    {tenant.saasPlan === 'premium' && 'الباقة الاحترافية'}
                    {!['free_trial', 'basic', 'premium'].includes(tenant.saasPlan) && tenant.saasPlan}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-bold">صلاحية المتجر:</span>
                  <span>{formatExpiry(tenant.saasExpiry)}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-bold">حالة الخدمة:</span>
                  <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-lg ${tenant.saasStatus === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {tenant.saasStatus === 'active' ? 'نشط (مفتوح)' : 'معلق أو منتهي'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs border-t border-zinc-800/50 pt-3">
                  <span className="text-zinc-500 font-bold">رصيدك في المنصة:</span>
                  <span className="text-emerald-400 font-black text-base">{(tenant.saasBalance || 0).toFixed(2)} EGP</span>
                </div>
                    </div>

                    <div className="space-y-3 border-t border-zinc-800/50 pt-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-[11px] font-bold text-zinc-300">
                          <span>اختر الباقة</span>
                          <select value={selectedPlanCode} onChange={(event) => setSelectedPlanCode(event.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500">
                            {plans.length === 0 && <option value="basic">الباقة الأساسية</option>}
                            {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} — {Number(plan.priceMonthly).toFixed(2)} EGP / شهر</option>)}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-[11px] font-bold text-zinc-300">
                          <span>مدة الاشتراك</span>
                          <select value={selectedMonths} onChange={(event) => setSelectedMonths(Number(event.target.value))} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500">
                            <option value={1}>شهر واحد</option>
                            <option value={3}>3 شهور</option>
                            <option value={6}>6 شهور</option>
                            <option value={12}>سنة كاملة</option>
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-zinc-950/70 px-3 py-3 text-xs">
                        <span className="text-zinc-400">القيمة المطلوبة</span>
                        <span className="font-black text-emerald-400">{renewalAmount.toFixed(2)} EGP</span>
                      </div>
                      {selectedMonths === 12 && annualSaving > 0 && <p className="text-[11px] font-bold text-emerald-400">وفر {annualSaving.toFixed(2)} EGP عند اختيار السنة الكاملة.</p>}
                    </div>

              {(tenant.saasBalance || 0) >= renewalAmount && renewalAmount > 0 ? (
                <button
                  onClick={handleRenewClick}
                  disabled={isPending}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-500/10 cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{inactive ? 'تفعيل الاشتراك الآن' : 'تجديد الاشتراك الآن'}</span>
                </button>
              ) : (
                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-[11px] text-amber-200 font-bold text-center leading-relaxed">
                  الرصيد غير كافٍ لهذه المدة. تحتاج إلى {(renewalAmount - (tenant.saasBalance || 0)).toFixed(2)} EGP إضافية، ويمكنك شحن المحفظة من النموذج أدناه.
                </div>
              )}

                    {tenant.autoRenewAvailable !== false ? <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-300">
                      <input type="checkbox" checked={Boolean(tenant.autoRenew)} onChange={(event) => handleAutoRenewChange(event.target.checked)} disabled={isPending} className="mt-0.5 h-4 w-4 accent-emerald-500" />
                      <span><strong className="text-white">تفعيل التجديد التلقائي</strong><br /><span className="text-[11px] text-zinc-500">سيحاول النظام التجديد قبل الانتهاء بيومين من رصيدك. لن يتم الخصم إذا لم يكفِ الرصيد، وستظهر لك رسالة واضحة.</span></span>
                    </label> : <p className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-3 text-xs leading-6 text-sky-100">تم تحميل بيانات الحساب بنجاح. سيظهر خيار التجديد التلقائي بعد تطبيق تحديث قاعدة البيانات الأخير على السيرفر.</p>}
                  </>
                );
              })()}
            </div>
          ) : <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6 text-center text-sm leading-7 text-amber-100">لم نستطع قراءة بيانات اشتراكك حالياً. استخدم زر إعادة المحاولة بالأعلى، وإذا استمرت المشكلة تواصل مع الدعم.</div>}

          {/* Change Password Form */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl text-right">
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-zinc-800/50 pb-3 mb-4">
              <KeyRound className="w-5 h-5 text-emerald-400" />
              <span>تغيير كلمة مرور الحساب</span>
            </h3>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">كلمة المرور الحالية</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="أدخل كلمة المرور الحالية"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 text-left"
                  dir="ltr"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                  placeholder="أدخل الباسوورد الجديد"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">تأكيد كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  placeholder="أعد إدخال الباسوورد للتأكيد"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 text-left"
                  dir="ltr"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold text-xs rounded-2xl cursor-pointer transition-colors"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>حفظ الباسوورد الجديد</span>
              </button>
            </form>
          </div>

        </div>

        {/* Right Column: Recharge request & recharge history */}
        <div className="space-y-8 lg:col-span-2">
          
          {/* Recharge Store Form */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-8 shadow-xl text-right space-y-6">
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-zinc-800/50 pb-3">
              <Coins className="w-5 h-5 text-emerald-400" />
              <span>تقديم طلب شحن رصيد المتجر في المنصة</span>
            </h3>
            
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-2xl text-xs text-emerald-50 leading-relaxed">
              💡 **خطوات شحن المحفظة وتفعيل المتاجر:**
              <ul className="list-disc list-inside mt-2 space-y-1 text-zinc-400">
                <li>قم بتحويل مبلغ الاشتراك إلى محفظة فودافون كاش للمنصة: <code className="text-white bg-zinc-950 px-1 py-0.5 rounded font-mono">01026040854</code>.</li>
                <li>أو تحويل بنكي فوري عبر حساب إنستا باي للمنصة: <code className="text-white bg-zinc-950 px-1 py-0.5 rounded font-mono">nexus@instapay</code>.</li>
                <li>بعد إتمام التحويل المالي، املأ النموذج أدناه بدقة ليقوم المشرف بتأكيد المعاملة وشحن رصيدك فوراً!</li>
              </ul>
            </div>

            <form onSubmit={handleRechargeSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">قيمة المبلغ المحول (EGP)</label>
                <input
                  type="number"
                  value={rechargeForm.amount}
                  onChange={(e) => setRechargeForm({ ...rechargeForm, amount: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">طريقة الدفع والتحويل</label>
                <select
                  value={rechargeForm.method}
                  onChange={(e) => setRechargeForm({ ...rechargeForm, method: e.target.value as 'vodafone_cash' | 'instapay' })}
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none cursor-pointer"
                >
                  <option value="vodafone_cash">فودافون كاش (Vodafone Cash)</option>
                  <option value="instapay">إنستا باي (InstaPay)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">رقم الهاتف المحول منه / أو اسم مرسل إنستاباي</label>
                <input
                  type="text"
                  value={rechargeForm.senderIdentifier}
                  onChange={(e) => setRechargeForm({ ...rechargeForm, senderIdentifier: e.target.value })}
                  placeholder="أدخل رقم المحفظة المحول منها للتأكيد"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-500/10 cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>تقديم طلب شحن المحفظة للإدارة</span>
                </button>
              </div>
            </form>
          </div>

          {/* Recharge Requests history */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl text-right">
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-zinc-800/50 pb-3 mb-4">
              <Clock className="w-5 h-5 text-emerald-400" />
              <span>تاريخ طلبات الشحن السابقة</span>
            </h3>

            {myPayments.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs font-bold">
                📭 لم تقم بتقديم أي طلبات شحن بعد.
              </div>
            ) : (
              <div className="bg-zinc-950/40 border border-zinc-800/40 rounded-2xl overflow-hidden">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/40 border-b border-zinc-800">
                      <th className="p-3 text-[10px] font-bold text-zinc-400">التاريخ</th>
                      <th className="p-3 text-[10px] font-bold text-zinc-400">المبلغ</th>
                      <th className="p-3 text-[10px] font-bold text-zinc-400">الطريقة</th>
                      <th className="p-3 text-[10px] font-bold text-zinc-400">المرسل</th>
                      <th className="p-3 text-[10px] font-bold text-zinc-400">الحالة</th>
                      <th className="p-3 text-[10px] font-bold text-zinc-400">ملاحظات المشرف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myPayments.map((p) => (
                      <tr key={p.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 text-xs text-zinc-300">
                        <td className="p-3 text-[10px] text-zinc-500">{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
                        <td className="p-3 text-emerald-400 font-bold">{p.amount.toFixed(2)} EGP</td>
                        <td className="p-3">{p.method === 'instapay' ? 'إنستا باي' : 'فودافون كاش'}</td>
                        <td className="p-3 font-semibold">{p.senderIdentifier}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[8px] font-extrabold rounded-lg ${p.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : p.status === 'rejected' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {p.status === 'approved' && 'تم الشحن'}
                            {p.status === 'rejected' && 'مرفوض'}
                            {p.status === 'pending' && 'معلق'}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-zinc-400">{p.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

    </section>
  );
}
