'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import {
  changeMerchantPassword,
  requestSaaSRecharge,
  renewSaaSPlan,
  getMySaaSPayments,
} from '@/app/actions/billing';
import { getSettings } from '@/app/actions/merchant';
import {
  ShieldAlert,
  Wallet,
  Clock,
  KeyRound,
  Coins,
  ArrowRight,
  Loader2,
  CheckCircle,
} from 'lucide-react';

export default function BillingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // States
  const [tenant, setTenant] = useState<any>(null);
  const [myPayments, setMyPayments] = useState<any[]>([]);

  // Forms
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
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
  }, [mounted]);

  const refreshBillingData = async () => {
    setLoading(true);
    try {
      const settingsRes = await getSettings();
      if (settingsRes.success && settingsRes.tenant) {
        setTenant(settingsRes.tenant);
      }

      const payRes = await getMySaaSPayments();
      if (payRes.success) {
        setMyPayments(payRes.requests);
      }
    } catch (e) {
      console.error('Error fetching billing data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.password !== passwordForm.confirm) {
      alert('كلمتا المرور غير متطابقتين!');
      return;
    }

    startTransition(async () => {
      const res = await changeMerchantPassword(passwordForm.password);
      if (res.success) {
        alert('تم تغيير كلمة المرور بنجاح!');
        setPasswordForm({ password: '', confirm: '' });
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

  const handleRenewClick = async () => {
    if (confirm('هل أنت متأكد من تمديد صلاحية متجرك لمدة 30 يوماً إضافية؟ سيتم سحب قيمة الاشتراك من رصيدك في المنصة.')) {
      startTransition(async () => {
        const res = await renewSaaSPlan();
        if (res.success) {
          alert('تهانينا! تم تجديد اشتراك متجرك بنجاح وتمديد الصلاحية 30 يوماً إضافية.');
          await refreshBillingData();
        } else {
          alert(res.error || 'فشل تجديد الاشتراك');
        }
      });
    }
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
    return <span className="text-green-500 font-bold">{end.toLocaleDateString('en-GB')} ({diff} يوم متبقي)</span>;
  };

  if (!mounted) return null;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8" dir="rtl">
      
      {/* Back Button */}
      <div className="max-w-6xl mx-auto mb-6 flex justify-between items-center">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer transition-all duration-150"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للوحة تحكم المتجر</span>
        </button>

        <h1 className="text-lg font-black text-white">إعدادات الاشتراك المالي والملف الشخصي للمتجر</h1>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Account Plan Summary & Renew */}
        <div className="space-y-8 lg:col-span-1">
          
          {/* Plan Status Card */}
          {tenant && (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl space-y-5 text-right">
              <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-zinc-800/50 pb-3">
                <Wallet className="w-5 h-5 text-indigo-400" />
                <span>اشتراك المتجر الحالي</span>
              </h3>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-bold">باقة المتجر:</span>
                  <span className="text-white font-black text-sm uppercase">
                    {tenant.saasPlan === 'free_trial' && 'فترة تجريبية (Trial)'}
                    {tenant.saasPlan === 'basic' && 'الباقة الأساسية'}
                    {tenant.saasPlan === 'premium' && 'الباقة الاحترافية'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-bold">صلاحية المتجر:</span>
                  <span>{formatExpiry(tenant.saasExpiry)}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-bold">حالة الخدمة:</span>
                  <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-lg ${tenant.saasStatus === 'active' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {tenant.saasStatus === 'active' ? 'نشط (مفتوح)' : 'معلق أو منتهي'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs border-t border-zinc-800/50 pt-3">
                  <span className="text-zinc-500 font-bold">رصيدك في المنصة:</span>
                  <span className="text-emerald-400 font-black text-base">{(tenant.saasBalance || 0).toFixed(2)} EGP</span>
                </div>
              </div>

              {(tenant.saasBalance || 0) >= (tenant.saasPlan === 'free_trial' ? 150 : (tenant.saasPlan === 'premium' ? 300 : 150)) ? (
                <button
                  onClick={handleRenewClick}
                  disabled={isPending}
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-500/10 cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>تجديد الاشتراك لـ 30 يوماً إضافية</span>
                </button>
              ) : (
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl text-[10px] text-indigo-400 font-bold text-center leading-relaxed">
                  ⚠️ رصيدك الحالي أقل من سعر تجديد الباقة. يرجى شحن محفظتك أدناه لتجديد اشتراك المتجر بنجاح.
                </div>
              )}
            </div>
          )}

          {/* Change Password Form */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl text-right">
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-zinc-800/50 pb-3 mb-4">
              <KeyRound className="w-5 h-5 text-indigo-400" />
              <span>تغيير كلمة مرور الحساب</span>
            </h3>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-2">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                  placeholder="أدخل الباسوورد الجديد"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 text-left"
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
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 text-left"
                  dir="ltr"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold text-xs rounded-2xl cursor-pointer transition-all"
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
              <Coins className="w-5 h-5 text-indigo-400" />
              <span>تقديم طلب شحن رصيد المتجر في المنصة</span>
            </h3>
            
            <div className="p-4 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl text-xs text-zinc-300 leading-relaxed">
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
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-500/10 cursor-pointer transition-all flex items-center justify-center gap-2"
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
              <Clock className="w-5 h-5 text-indigo-400" />
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
                        <td className="p-3 text-indigo-400 font-bold">{p.amount.toFixed(2)} EGP</td>
                        <td className="p-3">{p.method === 'instapay' ? 'إنستا باي' : 'فودافون كاش'}</td>
                        <td className="p-3 font-semibold">{p.senderIdentifier}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[8px] font-extrabold rounded-lg ${p.status === 'approved' ? 'bg-green-500/15 text-green-400' : p.status === 'rejected' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
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

    </div>
  );
}
