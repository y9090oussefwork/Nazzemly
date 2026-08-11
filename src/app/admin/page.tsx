/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/immutability */
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logoutMerchant } from '@/app/actions/auth';
import {
  getSystemStats,
  getMerchants,
  createMerchant,
  updateMerchantSaaS,
  getSaaSPayments,
  approveSaaSPayment,
  rejectSaaSPayment,
} from '@/app/actions/superadmin';
import {
  LayoutDashboard,
  Users,
  Wallet,
  Plus,
  Edit,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Check,
  X,
  Loader2,
  Coins,
  LifeBuoy,
} from 'lucide-react';

export default function SuperAdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'merchants' | 'payments'>('stats');
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // System data states
  const [stats, setStats] = useState<any>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Modal states
  const [modalType, setModalType] = useState<'create' | 'edit' | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<any>(null);

  // Form states
  const [createForm, setCreateForm] = useState({ storeName: '', usernameInput: '', passwordInput: '' });
  const [editForm, setEditForm] = useState({ plan: 'basic', status: 'active', expiry: '', balance: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    async function loadUser() {
      const user = await getCurrentUser();
      if (!user || user.role !== 'super_admin') {
        router.push('/login');
      } else {
        setCurrentUser(user);
        await refreshAllData();
      }
    }
    loadUser();
  }, [mounted, router]);

  const refreshAllData = async () => {
    setLoading(true);
    try {
      const statsRes = await getSystemStats();
      if (statsRes.success) setStats(statsRes.stats);

      const merchRes = await getMerchants();
      if (merchRes.success) setMerchants(merchRes.merchants);

      const payRes = await getSaaSPayments();
      if (payRes.success) setPayments(payRes.requests);
    } catch (e) {
      console.error('Error loading super admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createMerchant(createForm);
      if (res.success) {
        alert('تم إنشاء متجر التاجر وحسابه الإداري بنجاح!');
        setModalType(null);
        setCreateForm({ storeName: '', usernameInput: '', passwordInput: '' });
        await refreshAllData();
      } else {
        alert(res.error || 'فشل إنشاء المتجر');
      }
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMerchant) return;
    startTransition(async () => {
      const res = await updateMerchantSaaS(selectedMerchant.id, editForm);
      if (res.success) {
        alert('تم تحديث إعدادات اشتراك التاجر بنجاح!');
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error || 'فشل تحديث التاجر');
      }
    });
  };

  const handleApprovePayment = async (requestId: string) => {
    if (confirm('هل ترغب في تأكيد وصول حوالة التاجر وشحن رصيده في المنصة؟')) {
      const res = await approveSaaSPayment(requestId);
      if (res.success) {
        alert('تم قبول التحويل وشحن رصيد التاجر وتفعيل حسابه تلقائياً!');
        await refreshAllData();
      } else {
        alert(res.error);
      }
    }
  };

  const handleRejectPayment = async (requestId: string) => {
    const notes = prompt('برجاء كتابة سبب رفض الدفع لإعلام التاجر به:');
    if (notes !== null) {
      const res = await rejectSaaSPayment(requestId, notes);
      if (res.success) {
        alert('تم رفض المعاملة وإخطار التاجر بنجاح.');
        await refreshAllData();
      } else {
        alert(res.error);
      }
    }
  };

  const handleLogout = async () => {
    await logoutMerchant();
    router.push('/login');
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
    return <span className="text-emerald-500 font-medium">{end.toLocaleDateString('en-GB')} ({diff} يوم متبقي)</span>;
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex" dir="rtl">
      
      {/* 1. SIDEBAR */}
      <aside className="w-72 bg-zinc-900/40 border-l border-zinc-800/80 backdrop-blur-xl flex flex-col p-6 h-screen sticky top-0">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-800/80 mb-6">
          <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-wide text-white">Trust Nexus SaaS</h2>
            <span className="text-[10px] text-zinc-500 font-bold">لوحة تحكم المشرف العام</span>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setActiveTab('stats')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-colors duration-150 ${activeTab === 'stats' ? 'bg-gradient-to-l from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>نظرة عامة وإحصائيات</span>
          </button>

          <button
            onClick={() => setActiveTab('merchants')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-colors duration-150 ${activeTab === 'merchants' ? 'bg-gradient-to-l from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Users className="w-5 h-5" />
            <span>إدارة وتتبع التجار</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-colors duration-150 ${activeTab === 'payments' ? 'bg-gradient-to-l from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Coins className="w-5 h-5" />
            <span>طلبات تفعيل وحسابات التجار</span>
            {payments.filter(p => p.status === 'pending').length > 0 && (
              <span className="mr-auto px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold rounded-full">
                {payments.filter(p => p.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => router.push('/admin/operations')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors duration-150"
          >
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>الباقات وسجل التدقيق</span>
          </button>
          <button
            onClick={() => router.push('/admin/support')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors duration-150"
          >
            <LifeBuoy className="w-5 h-5 text-emerald-400" />
            <span>دعم التجار</span>
          </button>
        </nav>

        <div className="pt-4 border-t border-zinc-800/80 mt-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-950 flex items-center justify-center font-bold text-emerald-400 text-xs">
            SA
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs text-white truncate">{currentUser.username}</p>
            <p className="text-[9px] text-zinc-500 font-bold uppercase">المدير العام</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-zinc-500 hover:text-red-400 rounded-xl hover:bg-red-950/20 cursor-pointer transition-colors duration-150"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* 2. MAIN AREA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Topbar */}
        <header className="h-20 bg-zinc-950/80 border-b border-zinc-900 flex items-center justify-between px-8 relative z-20">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-white">
              {activeTab === 'stats' && 'لوحة إحصائيات النظام بالكامل'}
              {activeTab === 'merchants' && 'إدارة المتاجر وحسابات التجار'}
              {activeTab === 'payments' && 'فحص طلبات شحن المتاجر المالي'}
            </h1>
            {loading && <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />}
          </div>

          <button
            onClick={refreshAllData}
            disabled={loading}
            className="p-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl cursor-pointer transition-colors duration-150"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {/* Content Panel */}
        <section className="flex-1 p-8 overflow-y-auto relative z-10">

          {/* A. SYSTEM STATS */}
          {activeTab === 'stats' && stats && (
            <div className="space-y-8 animate-fadeUp">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{stats.totalMerchants}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">إجمالي التجار</p>
                  </div>
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{stats.activeMerchants}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">متاجر نشطة</p>
                  </div>
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400">
                    <X className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{stats.expiredMerchants}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">متاجر منتهية</p>
                  </div>
                </div>

                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{stats.totalPlatformRevenue.toFixed(2)} EGP</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">إيرادات المنصة الإجمالية</p>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* B. MERCHANTS MANAGEMENT */}
          {activeTab === 'merchants' && (
            <div className="space-y-6 animate-fadeUp">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400">سجل متاجر التجار والاشتراكات</h2>
                <button
                  onClick={() => {
                    setCreateForm({ storeName: '', usernameInput: '', passwordInput: '' });
                    setModalType('create');
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة متجر تاجر جديد</span>
                </button>
              </div>

              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800">
                      <th className="p-4 text-xs font-bold text-zinc-400">اسم المتجر</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">معرف المستأجر (Tenant ID)</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">رصيد المنصة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">الباقة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">تاريخ انتهاء متجره</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">حالة الاشتراك</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">الزبائن/الاشتراكات</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchants.map((m) => (
                      <tr key={m.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                        <td className="p-4 font-bold text-xs text-white">{m.storeName}</td>
                        <td className="p-4 text-[10px] text-zinc-500 font-mono select-all">{m.id}</td>
                        <td className="p-4 text-xs text-emerald-400 font-bold">{(m.saasBalance || 0).toFixed(2)} EGP</td>
                        <td className="p-4 text-xs text-zinc-300 font-bold">
                          {m.saasPlan === 'free_trial' && 'فترة تجريبية'}
                          {m.saasPlan === 'basic' && 'باقة أساسية'}
                          {m.saasPlan === 'premium' && 'باقة احترافية'}
                        </td>
                        <td className="p-4 text-xs">{formatExpiry(m.saasExpiry)}</td>
                        <td className="p-4 text-xs">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-lg ${m.saasStatus === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {m.saasStatus === 'active' ? 'نشط' : 'موقف'}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-zinc-400 font-medium">
                          {m._count.customers} عملاء | {m._count.subscriptions} اشتراكات
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => {
                              setSelectedMerchant(m);
                              setEditForm({
                                plan: m.saasPlan,
                                status: m.saasStatus,
                                expiry: m.saasExpiry ? m.saasExpiry.substring(0, 10) : '',
                                balance: m.saasBalance,
                              });
                              setModalType('edit');
                            }}
                            className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* C. PAYMENTS QUEUE */}
          {activeTab === 'payments' && (
            <div className="space-y-6 animate-fadeUp">
              <h2 className="text-sm font-black text-zinc-400">طابور طلبات شحن أرصدة التجار وتفعيل المتاجر</h2>

              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800">
                      <th className="p-4 text-xs font-bold text-zinc-400">التاريخ</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">المتجر</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">المبلغ</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">طريقة التحويل</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">معلومات المرسل</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">ملاحظات</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">الحالة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                        <td className="p-4 text-xs text-zinc-500">{new Date(p.createdAt).toLocaleString('en-GB')}</td>
                        <td className="p-4 font-bold text-xs text-white">{p.tenant.storeName}</td>
                        <td className="p-4 text-xs text-emerald-400 font-bold">{p.amount.toFixed(2)} EGP</td>
                        <td className="p-4 text-xs text-zinc-300 font-bold">{p.method === 'instapay' ? 'إنستا باي' : 'فودافون كاش'}</td>
                        <td className="p-4 text-xs text-zinc-400 font-semibold">{p.senderIdentifier}</td>
                        <td className="p-4 text-xs text-zinc-500 max-w-xs truncate">{p.notes || '-'}</td>
                        <td className="p-4 text-xs">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-lg ${p.status === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : p.status === 'rejected' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {p.status === 'approved' && 'تم القبول'}
                            {p.status === 'rejected' && 'مرفوض'}
                            {p.status === 'pending' && 'معلق مراجعة'}
                          </span>
                        </td>
                        <td className="p-4">
                          {p.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprovePayment(p.id)}
                                className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl cursor-pointer hover:bg-emerald-500/20 transition-colors"
                                title="قبول وشحن"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRejectPayment(p.id)}
                                className="p-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl cursor-pointer hover:bg-red-500/20 transition-colors"
                                title="رفض الطلب"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* 3. MODALS POPUPS */}
      {modalType && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          
          {/* Create Merchant Modal */}
          {modalType === 'create' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-6">إنشاء متجر وحساب إداري لتاجر جديد</h3>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">اسم متجر التاجر</label>
                  <input
                    type="text"
                    value={createForm.storeName}
                    onChange={(e) => setCreateForm({ ...createForm, storeName: e.target.value })}
                    placeholder="مثال: متجر كابونجا الرقمي"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">اسم مستخدم لوحة التحكم (Username)</label>
                  <input
                    type="text"
                    value={createForm.usernameInput}
                    onChange={(e) => setCreateForm({ ...createForm, usernameInput: e.target.value })}
                    placeholder="اسم تسجيل الدخول للتاجر"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 text-left"
                    dir="ltr"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">كلمة مرور الحساب</label>
                  <input
                    type="password"
                    value={createForm.passwordInput}
                    onChange={(e) => setCreateForm({ ...createForm, passwordInput: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-500 text-left"
                    dir="ltr"
                    required
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    إنشاء حساب المتجر
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Edit SaaS Settings Modal */}
          {modalType === 'edit' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-2">تعديل اشتراك متجر: {selectedMerchant?.storeName}</h3>
              <p className="text-[10px] text-zinc-500 font-bold mb-6">معرف المستأجر: {selectedMerchant?.id}</p>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">باقة الاشتراك</label>
                    <select
                      value={editForm.plan}
                      onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="free_trial">فترة تجريبية</option>
                      <option value="basic">باقة أساسية</option>
                      <option value="premium">باقة احترافية</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">حالة الاشتراك</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="active">نشط (مفتوح)</option>
                      <option value="suspended">موقف (مغلق)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">تاريخ انتهاء الاشتراك</label>
                  <input
                    type="date"
                    value={editForm.expiry}
                    onChange={(e) => setEditForm({ ...editForm, expiry: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">رصيد التاجر في المنصة</label>
                  <input
                    type="number"
                    value={editForm.balance}
                    onChange={(e) => setEditForm({ ...editForm, balance: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    تحديث البيانات
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
