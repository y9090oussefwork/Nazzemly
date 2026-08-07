'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logoutMerchant } from '@/app/actions/auth';
import {
  getDashboardStats,
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getServices,
  addService,
  updateService,
  deleteService,
  getSubscriptions,
  addSubscription,
  renewSubscription,
  deleteSubscription,
  getExpenses,
  addExpense,
  deleteExpense,
  getAdvertising,
  addAdvertising,
  deleteAdvertising,
  getSettings,
  saveSettings,
  saveBotSettings,
} from '@/app/actions/merchant';
import {
  getPendingPayments,
  approvePayment,
  rejectPayment,
} from '@/app/actions/payments';
import {
  LayoutDashboard,
  Users,
  Bell,
  Puzzle,
  DollarSign,
  Megaphone,
  Bot as BotIcon,
  Settings,
  LogOut,
  RefreshCw,
  Search,
  MessageSquareCode,
  UserPlus,
  Trash2,
  Edit,
  Plus,
  Calendar,
  Wallet,
  Clock,
  ShieldCheck,
  Check,
  X,
  Loader2,
  Coins,
} from 'lucide-react';

type ViewType = 'dashboard' | 'customers' | 'subscriptions' | 'services' | 'expenses' | 'ads' | 'bot' | 'settings';

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<ViewType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [botSettings, setBotSettings] = useState<any>(null);
  const [tenantSettings, setTenantSettings] = useState<any>(null);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [modalType, setModalType] = useState<string | null>(null); // 'customer' | 'service' | 'subscription' | 'renew' | 'expense' | 'ad'
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Form states
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [serviceForm, setServiceForm] = useState({ name: '', defaultDuration: 30, defaultSellingPrice: 0, defaultCostPrice: 0 });
  const [subscriptionForm, setSubscriptionForm] = useState({ customerId: '', serviceId: '', package: '', startDate: '', endDate: '', sellingPrice: 0, costPrice: 0, notes: '' });
  const [renewForm, setRenewForm] = useState({ startDate: '', endDate: '', sellingPrice: 0, costPrice: 0 });
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: 0, date: '', notes: '' });
  const [adForm, setAdForm] = useState({ platform: '', amount: 0, date: '', notes: '' });
  const [botForm, setBotForm] = useState({ botToken: '', botUsername: '', isActive: false, welcomeMsg: '' });
  const [settingsForm, setSettingsForm] = useState({ storeName: '', currency: 'EGP', reminderDays: 3, notifEmail: '' });

  // Initial load
  useEffect(() => {
    async function loadUser() {
      const user = await getCurrentUser();
      if (!user) {
        router.push('/login');
      } else {
        setCurrentUser(user);
        await refreshAllData();
      }
    }
    loadUser();
  }, []);

  const refreshAllData = async () => {
    setLoading(true);
    try {
      const statsRes = await getDashboardStats();
      if (statsRes.success) setStats(statsRes.stats);

      const custRes = await getCustomers();
      if (custRes.success) setCustomers(custRes.customers);

      const srvRes = await getServices();
      if (srvRes.success) setServices(srvRes.services);

      const subRes = await getSubscriptions();
      if (subRes.success) setSubscriptions(subRes.subscriptions);

      const expRes = await getExpenses();
      if (expRes.success) setExpenses(expRes.expenses);

      const adRes = await getAdvertising();
      if (adRes.success) setAds(adRes.campaigns);

      const setRes = await getSettings();
      if (setRes.success && setRes.tenant) {
        setTenantSettings(setRes.tenant);
        setSettingsForm({
          storeName: setRes.tenant.storeName,
          currency: setRes.tenant.currency,
          reminderDays: setRes.tenant.reminderDays,
          notifEmail: setRes.tenant.notifEmail || '',
        });
        if (setRes.tenant.botSettings) {
          setBotSettings(setRes.tenant.botSettings);
          setBotForm({
            botToken: setRes.tenant.botSettings.botToken || '',
            botUsername: setRes.tenant.botSettings.botUsername || '',
            isActive: setRes.tenant.botSettings.isActive,
            welcomeMsg: setRes.tenant.botSettings.welcomeMsg || '',
          });
        }
      }

      const payRes = await getPendingPayments();
      if (payRes.success) setPendingPayments(payRes.requests);

    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutMerchant();
    router.push('/login');
  };

  // ----------------------------------------------------
  // SUBMIT HANDLERS
  // ----------------------------------------------------

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      let res;
      if (selectedItem) {
        res = await updateCustomer(selectedItem.id, customerForm);
      } else {
        res = await addCustomer(customerForm);
      }
      if (res.success) {
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      let res;
      if (selectedItem) {
        res = await updateService(selectedItem.id, serviceForm);
      } else {
        res = await addService(serviceForm);
      }
      if (res.success) {
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleSubscriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addSubscription(subscriptionForm);
      if (res.success) {
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    startTransition(async () => {
      const res = await renewSubscription(selectedItem.id, renewForm);
      if (res.success) {
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addExpense(expenseForm);
      if (res.success) {
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addAdvertising(adForm);
      if (res.success) {
        setModalType(null);
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleBotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveBotSettings(botForm);
      if (res.success) {
        alert('تم حفظ إعدادات البوت بنجاح');
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveSettings(settingsForm);
      if (res.success) {
        alert('تم حفظ الإعدادات العامة بنجاح');
        await refreshAllData();
      } else {
        alert(res.error);
      }
    });
  };

  // ----------------------------------------------------
  // DELETE TRIGGERS
  // ----------------------------------------------------
  const handleDeleteCustomer = async (id: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف العميل "${name}"؟`)) {
      const res = await deleteCustomer(id);
      if (res.success) await refreshAllData();
      else alert(res.error);
    }
  };

  const handleDeleteService = async (id: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف الخدمة "${name}"؟`)) {
      const res = await deleteService(id);
      if (res.success) await refreshAllData();
      else alert(res.error);
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    if (confirm(`هل أنت متأكد من حذف هذا الاشتراك؟`)) {
      const res = await deleteSubscription(id);
      if (res.success) await refreshAllData();
      else alert(res.error);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm(`هل أنت متأكد من حذف هذا المصروف؟`)) {
      const res = await deleteExpense(id);
      if (res.success) await refreshAllData();
      else alert(res.error);
    }
  };

  const handleDeleteAd = async (id: string) => {
    if (confirm(`هل أنت متأكد من حذف هذا الإعلان؟`)) {
      const res = await deleteAdvertising(id);
      if (res.success) await refreshAllData();
      else alert(res.error);
    }
  };

  // ----------------------------------------------------
  // PAYMENT RESOLVERS
  // ----------------------------------------------------
  const handleApprovePayment = async (requestId: string, transactionId: string) => {
    if (confirm('هل ترغب في الموافقة على هذا الإيداع وشحن رصيد العميل؟')) {
      const res = await approvePayment(requestId, transactionId || 'MANUAL_OK');
      if (res.success) {
        alert('تم قبول التحويل وشحن رصيد المحفظة بنجاح.');
        await refreshAllData();
      } else {
        alert(res.error);
      }
    }
  };

  const handleRejectPayment = async (requestId: string) => {
    const notes = prompt('برجاء كتابة سبب رفض المعاملة لإعلام العميل بها في البوت:');
    if (notes !== null) {
      const res = await rejectPayment(requestId, notes);
      if (res.success) {
        alert('تم رفض طلب الشحن وإخطار العميل بنجاح.');
        await refreshAllData();
      } else {
        alert(res.error);
      }
    }
  };

  // Helpers
  const formatMoney = (n: number) => {
    const symbol = tenantSettings?.currency || 'EGP';
    return `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${symbol}`;
  };

  const getRemainingDays = (endDate: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const end = new Date(endDate);
    end.setHours(0,0,0,0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return <span className="text-red-500 font-bold">منتهي ({Math.abs(diff)} يوم)</span>;
    if (diff === 0) return <span className="text-amber-500 font-bold">ينتهي اليوم</span>;
    return <span className="text-green-500 font-medium">{diff} يوم</span>;
  };

  if (!mounted) return null;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex" dir="rtl">
      
      {/* 1. RIGHT SIDEBAR */}
      <aside className="w-72 bg-zinc-900/40 border-l border-zinc-800/80 backdrop-blur-xl flex flex-col p-6 h-screen sticky top-0">
        
        {/* Brand */}
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-800/80 mb-6">
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-wide text-white">{tenantSettings?.storeName || 'لوحة التحكم'}</h2>
            <span className="text-[10px] text-zinc-500 font-bold">نظام إدارة الاشتراكات (SaaS)</span>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'dashboard' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>لوحة التحكم الرئيسية</span>
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'customers' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Users className="w-5 h-5" />
            <span>إدارة العملاء</span>
          </button>

          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'subscriptions' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Bell className="w-5 h-5" />
            <span>الاشتراكات والبطاقات</span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'services' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Puzzle className="w-5 h-5" />
            <span>الخدمات والمنتجات</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'expenses' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <DollarSign className="w-5 h-5" />
            <span>إدارة المصروفات</span>
          </button>

          <button
            onClick={() => setActiveTab('ads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'ads' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Megaphone className="w-5 h-5" />
            <span>الإعلانات والمبيعات</span>
          </button>

          <div className="h-px bg-zinc-800/80 my-4" />

          <button
            onClick={() => setActiveTab('bot')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'bot' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <BotIcon className="w-5 h-5" />
            <span>إعدادات بوت التيلجرام</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer transition-all duration-150 ${activeTab === 'settings' ? 'bg-gradient-to-l from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/10' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <Settings className="w-5 h-5" />
            <span>إعدادات النظام العامة</span>
          </button>

          <button
            onClick={() => router.push('/dashboard/billing')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-xs cursor-pointer text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all duration-150"
          >
            <Coins className="w-5 h-5 text-indigo-400" />
            <span>رصيد واشتراك المتجر</span>
          </button>
        </nav>

        {/* Footer User Chip */}
        <div className="pt-4 border-t border-zinc-800/80 mt-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center font-bold text-indigo-400 text-xs">
            {currentUser.username.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs text-white truncate">{currentUser.username}</p>
            <p className="text-[9px] text-zinc-500 font-bold uppercase">{currentUser.role === 'admin' ? 'مدير النظام' : 'مستخدم'}</p>
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
              {activeTab === 'dashboard' && 'لوحة التحكم والمؤشرات'}
              {activeTab === 'customers' && 'إدارة العملاء والاتصال'}
              {activeTab === 'subscriptions' && 'إدارة الاشتراكات والبطاقات'}
              {activeTab === 'services' && 'الخدمات والمنتجات النشطة'}
              {activeTab === 'expenses' && 'إدارة وتتبع المصروفات'}
              {activeTab === 'ads' && 'إدارة الحملات الإعلانية'}
              {activeTab === 'bot' && 'تكامل وإعدادات بوت التيلجرام'}
              {activeTab === 'settings' && 'إعدادات المنصة المتقدمة'}
            </h1>
            {loading && <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />}
          </div>

          <div className="flex items-center gap-4">
            {/* Global Search */}
            {(activeTab === 'customers' || activeTab === 'subscriptions') && (
              <div className="relative w-80">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-500">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="بحث سريع..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            )}

            {/* Quick Filters */}
            {activeTab === 'subscriptions' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-white text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="expiring_soon">قريب الانتهاء</option>
                <option value="expired">منتهي</option>
              </select>
            )}

            {/* Refresh Button */}
            <button
              onClick={refreshAllData}
              disabled={loading}
              className="p-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-xl cursor-pointer transition-all duration-150"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <section className="flex-1 p-8 overflow-y-auto relative z-10">
          
          {/* A. DASHBOARD VIEW */}
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-8 animate-fadeUp">
              
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                
                {/* Customers */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 shadow-lg flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{stats.totalCustomers}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">إجمالي العملاء</p>
                  </div>
                </div>

                {/* Active Subscriptions */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 shadow-lg flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-400">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{stats.activeSubs}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">اشتراكات نشطة</p>
                  </div>
                </div>

                {/* Revenue */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 shadow-lg flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">{formatMoney(stats.monthlyRevenue)}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">مبيعات الشهر الحالي</p>
                  </div>
                </div>

                {/* Net Profit */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-5 shadow-lg flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-black ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatMoney(stats.netProfit)}
                    </h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mt-0.5">صافي الأرباح المقدرة</p>
                  </div>
                </div>

              </div>

              {/* Grid 2 Columns: Pending Payments & Recent Activities */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                
                {/* 1. Pending Payments Queue */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl">
                  <h3 className="text-sm font-black text-white flex items-center gap-2 mb-4">
                    <Wallet className="w-5 h-5 text-indigo-400" />
                    <span>طلبات إيداع معلقة وتأكيد دفع (فودافون كاش / إنستا باي)</span>
                    {pendingPayments.length > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-extrabold rounded-full">
                        {pendingPayments.length} جديد
                      </span>
                    )}
                  </h3>

                  {pendingPayments.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs font-semibold">
                      🎉 لا توجد طلبات شحن معلقة حالياً. كل المعاملات مطابقة!
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                      {pendingPayments.map((p) => {
                        const expectedTotal = p.amount + p.fraction;
                        return (
                          <div key={p.id} className="p-4 bg-zinc-950/60 border border-zinc-800/50 rounded-2xl flex items-center justify-between text-right">
                            <div>
                              <p className="font-bold text-xs text-white">{p.customer.name}</p>
                              <p className="text-[10px] text-zinc-500 font-bold mt-1">
                                طريقة الدفع: {p.method === 'instapay' ? 'إنستا باي' : 'فودافون كاش'} | رقم التحويل: {p.senderIdentifier || 'غير معروف'}
                              </p>
                              <p className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                                المبلغ مع كسر التأكيد: *{expectedTotal.toFixed(2)} EGP*
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprovePayment(p.id, p.transactionId || '')}
                                className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl cursor-pointer hover:bg-emerald-500/20 transition-all"
                                title="موافقة وشحن المحفظة"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRejectPayment(p.id)}
                                className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl cursor-pointer hover:bg-red-500/20 transition-all"
                                title="رفض الطلب"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Recent Activities */}
                <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-6 shadow-xl flex flex-col">
                  <h3 className="text-sm font-black text-white flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-indigo-400" />
                    <span>آخر العمليات والمبيعات بالمتجر</span>
                  </h3>

                  {stats.recentActivity.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs font-semibold my-auto">
                      📭 لا توجد نشاطات مسجلة بعد.
                    </div>
                  ) : (
                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                      {stats.recentActivity.map((a: any) => (
                        <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-zinc-800/50 last:border-0">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-200 text-right leading-relaxed">{a.text}</p>
                            <span className="text-[10px] text-zinc-500 mt-1 block">
                              {new Date(a.date).toLocaleString('en-GB')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* B. CUSTOMERS TAB */}
          {activeTab === 'customers' && (
            <div className="space-y-6 animate-fadeUp">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400">قائمة العملاء المسجلين</h2>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setCustomerForm({ name: '', phone: '', email: '', notes: '' });
                    setModalType('customer');
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>إضافة عميل جديد</span>
                </button>
              </div>

              {/* Table Card */}
              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800">
                      <th className="p-4 text-xs font-bold text-zinc-400">العميل</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">رقم الهاتف</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">البريد الإلكتروني</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">رصيد المحفظة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">تاريخ التسجيل</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers
                      .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery))
                      .map((c) => (
                        <tr key={c.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                          <td className="p-4 font-bold text-xs text-white">{c.name}</td>
                          <td className="p-4 text-xs text-zinc-300 font-semibold">{c.phone}</td>
                          <td className="p-4 text-xs text-zinc-400">{c.email || '-'}</td>
                          <td className="p-4 text-xs font-black text-emerald-400">{formatMoney(c.walletBalance)}</td>
                          <td className="p-4 text-xs text-zinc-500">{new Date(c.createdAt).toLocaleDateString('en-GB')}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedItem(c);
                                  setCustomerForm({ name: c.name, phone: c.phone, email: c.email || '', notes: c.notes || '' });
                                  setModalType('customer');
                                }}
                                className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                                title="تعديل العميل"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCustomer(c.id, c.name)}
                                className="p-2 hover:bg-red-950/20 text-zinc-400 hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                                title="حذف العميل"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* C. SUBSCRIPTIONS TAB */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-6 animate-fadeUp">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400">سجل اشتراكات العملاء</h2>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setSubscriptionForm({
                      customerId: customers[0]?.id || '',
                      serviceId: services[0]?.id || '',
                      package: '',
                      startDate: new Date().toISOString().substring(0, 10),
                      endDate: '',
                      sellingPrice: services[0]?.defaultSellingPrice || 0,
                      costPrice: services[0]?.defaultCostPrice || 0,
                      notes: '',
                    });
                    setModalType('subscription');
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة اشتراك جديد</span>
                </button>
              </div>

              {/* Table Card */}
              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800">
                      <th className="p-4 text-xs font-bold text-zinc-400">العميل</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">الخدمة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">الباقة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">البداية</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">النهاية</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">المتبقي</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">سعر البيع</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">الربح</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions
                      .filter(s => {
                        const nameMatches = s.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.service.name.toLowerCase().includes(searchQuery.toLowerCase());
                        const statusMatches = statusFilter ? s.status === statusFilter : true;
                        return nameMatches && statusMatches;
                      })
                      .map((s) => (
                        <tr key={s.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                          <td className="p-4 font-bold text-xs text-white">{s.customer.name}</td>
                          <td className="p-4 text-xs text-indigo-300 font-semibold">{s.service.name}</td>
                          <td className="p-4 text-xs text-zinc-400">{s.package || '-'}</td>
                          <td className="p-4 text-xs text-zinc-500">{new Date(s.startDate).toLocaleDateString('en-GB')}</td>
                          <td className="p-4 text-xs text-zinc-300">{new Date(s.endDate).toLocaleDateString('en-GB')}</td>
                          <td className="p-4 text-xs">{getRemainingDays(s.endDate)}</td>
                          <td className="p-4 text-xs text-white font-semibold">{formatMoney(s.sellingPrice)}</td>
                          <td className="p-4 text-xs text-emerald-400 font-bold">{formatMoney(s.sellingPrice - s.costPrice)}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedItem(s);
                                  setRenewForm({
                                    startDate: new Date().toISOString().substring(0, 10),
                                    endDate: '',
                                    sellingPrice: s.sellingPrice,
                                    costPrice: s.costPrice,
                                  });
                                  setModalType('renew');
                                }}
                                className="px-2 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500/20 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                                title="تجديد الاشتراك"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>تجديد</span>
                              </button>
                              <button
                                onClick={() => handleDeleteSubscription(s.id)}
                                className="p-2 hover:bg-red-950/20 text-zinc-400 hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                                title="حذف الاشتراك"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* D. SERVICES TAB */}
          {activeTab === 'services' && (
            <div className="space-y-6 animate-fadeUp">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400">قائمة الخدمات والاشتراكات المقدمة</h2>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setServiceForm({ name: '', defaultDuration: 30, defaultSellingPrice: 0, defaultCostPrice: 0 });
                    setModalType('service');
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة خدمة جديدة</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {services.map((s) => (
                  <div key={s.id} className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="font-black text-white text-sm">{s.name}</h3>
                        <span className="px-2 py-0.5 bg-indigo-500/15 text-indigo-400 text-[10px] font-bold rounded-lg">
                          صلاحية {s.defaultDuration} يوم
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-right">
                        <p className="text-xs text-zinc-400">
                          سعر البيع الافتراضي: <span className="text-white font-bold">{formatMoney(s.defaultSellingPrice)}</span>
                        </p>
                        <p className="text-xs text-zinc-400">
                          سعر التكلفة الافتراضي: <span className="text-zinc-300 font-semibold">{formatMoney(s.defaultCostPrice)}</span>
                        </p>
                        <p className="text-xs text-zinc-500 font-medium">
                          إجمالي المبيعات النشطة: *{s._count.subscriptions} اشتراكات*
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-zinc-800/60 pt-4 mt-6">
                      <button
                        onClick={() => {
                          setSelectedItem(s);
                          setServiceForm({
                            name: s.name,
                            defaultDuration: s.defaultDuration,
                            defaultSellingPrice: s.defaultSellingPrice,
                            defaultCostPrice: s.defaultCostPrice,
                          });
                          setModalType('service');
                        }}
                        className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDeleteService(s.id, s.name)}
                        className="p-2.5 bg-red-950/20 text-red-400 hover:bg-red-950/40 border border-red-900/30 rounded-xl cursor-pointer transition-colors"
                        title="حذف الخدمة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* E. EXPENSES TAB */}
          {activeTab === 'expenses' && (
            <div className="space-y-6 animate-fadeUp">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400">سجل المصروفات العامة</h2>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setExpenseForm({ category: '', amount: 0, date: new Date().toISOString().substring(0, 10), notes: '' });
                    setModalType('expense');
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة مصروف</span>
                </button>
              </div>

              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800">
                      <th className="p-4 text-xs font-bold text-zinc-400">التصنيف</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">المبلغ</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">التاريخ</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">ملاحظات</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                        <td className="p-4 font-bold text-xs text-white">{e.category}</td>
                        <td className="p-4 text-xs text-red-400 font-bold">{formatMoney(e.amount)}</td>
                        <td className="p-4 text-xs text-zinc-400">{new Date(e.date).toLocaleDateString('en-GB')}</td>
                        <td className="p-4 text-xs text-zinc-500">{e.notes || '-'}</td>
                        <td className="p-4">
                          <button
                            onClick={() => handleDeleteExpense(e.id)}
                            className="p-2 hover:bg-red-950/20 text-zinc-400 hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* F. ADS TAB */}
          {activeTab === 'ads' && (
            <div className="space-y-6 animate-fadeUp">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black text-zinc-400">تتبع الحملات الإعلانية ومصروفاتها</h2>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setAdForm({ platform: '', amount: 0, date: new Date().toISOString().substring(0, 10), notes: '' });
                    setModalType('ad');
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-500/10 cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة حملة إعلانية</span>
                </button>
              </div>

              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/60 border-b border-zinc-800">
                      <th className="p-4 text-xs font-bold text-zinc-400">المنصة</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">المبلغ المنفق</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">التاريخ</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">ملاحظات</th>
                      <th className="p-4 text-xs font-bold text-zinc-400">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.map((a) => (
                      <tr key={a.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                        <td className="p-4 font-bold text-xs text-white">{a.platform}</td>
                        <td className="p-4 text-xs text-red-400 font-bold">{formatMoney(a.amount)}</td>
                        <td className="p-4 text-xs text-zinc-400">{new Date(a.date).toLocaleDateString('en-GB')}</td>
                        <td className="p-4 text-xs text-zinc-500">{a.notes || '-'}</td>
                        <td className="p-4">
                          <button
                            onClick={() => handleDeleteAd(a.id)}
                            className="p-2 hover:bg-red-950/20 text-zinc-400 hover:text-red-400 rounded-xl transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* G. BOT CONFIG TAB */}
          {activeTab === 'bot' && (
            <div className="space-y-8 animate-fadeUp">
              <div className="max-w-2xl bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-8 shadow-xl text-right">
                <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
                  <BotIcon className="w-5 h-5 text-indigo-400" />
                  <span>إعداد وتفعيل بوت التيلجرام للمبيعات</span>
                </h3>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  أنشئ بوت جديد عبر التيلجرام بمراسلة البوت الرسمي <span className="text-indigo-400">@BotFather</span>، احصل على الـ API Token وضعه أدناه. سيقوم النظام ديناميكياً بربط البوت ومعالجة طلبات المبيعات والمحافظ لعملائك.
                </p>

                <form onSubmit={handleBotSubmit} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">رمز الـ API Token للبوت</label>
                    <input
                      type="text"
                      value={botForm.botToken}
                      onChange={(e) => setBotForm({ ...botForm, botToken: e.target.value })}
                      placeholder="أدخل Token البوت من BotFather"
                      className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs placeholder-zinc-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">اسم معرف البوت (Username)</label>
                      <input
                        type="text"
                        value={botForm.botUsername}
                        onChange={(e) => setBotForm({ ...botForm, botUsername: e.target.value })}
                        placeholder="@MyStoreBot"
                        className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs placeholder-zinc-700 focus:outline-none focus:border-indigo-500 text-left"
                        dir="ltr"
                      />
                    </div>

                    <div className="flex flex-col justify-end">
                      <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">حالة البوت</label>
                      <div className="flex items-center gap-3 py-3">
                        <input
                          type="checkbox"
                          id="botActive"
                          checked={botForm.isActive}
                          onChange={(e) => setBotForm({ ...botForm, isActive: e.target.checked })}
                          className="w-5 h-5 rounded border-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-opacity-25"
                        />
                        <label htmlFor="botActive" className="text-xs font-bold text-zinc-200 cursor-pointer">تفعيل استقبال الطلبات في البوت</label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">رسالة الترحيب في البوت</label>
                    <textarea
                      value={botForm.welcomeMsg}
                      onChange={(e) => setBotForm({ ...botForm, welcomeMsg: e.target.value })}
                      rows={3}
                      placeholder="أهلاً بك في بوت متجرنا..."
                      className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs placeholder-zinc-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {botSettings && (
                    <div className="p-4 bg-zinc-950/40 border border-zinc-800/60 rounded-2xl">
                      <h4 className="text-xs font-bold text-white mb-2">رابط استقبال الـ Webhook الخاص بك:</h4>
                      <code className="text-[10px] text-indigo-400 block bg-zinc-950 p-3 rounded-xl border border-zinc-900 select-all overflow-x-auto text-left" dir="ltr">
                        {`https://your-domain.com/api/webhooks/telegram/${botSettings.botToken}`}
                      </code>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-500/10 cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>حفظ وتفعيل إعدادات البوت</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* H. SYSTEM SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="space-y-8 animate-fadeUp">
              <div className="max-w-2xl bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-8 shadow-xl text-right">
                <h3 className="text-base font-black text-white mb-6 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  <span>الإعدادات العامة للتاجر والعملات</span>
                </h3>

                <form onSubmit={handleSettingsSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">اسم المتجر</label>
                      <input
                        type="text"
                        value={settingsForm.storeName}
                        onChange={(e) => setSettingsForm({ ...settingsForm, storeName: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">عملة المتجر</label>
                      <input
                        type="text"
                        value={settingsForm.currency}
                        onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">التنبيه بالانتهاء قبل (أيام)</label>
                      <input
                        type="number"
                        value={settingsForm.reminderDays}
                        onChange={(e) => setSettingsForm({ ...settingsForm, reminderDays: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-400 mb-2 mr-1">بريد استلام التنبيهات والتقارير</label>
                      <input
                        type="email"
                        value={settingsForm.notifEmail}
                        onChange={(e) => setSettingsForm({ ...settingsForm, notifEmail: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-950/60 border border-zinc-800/80 rounded-2xl text-white text-xs focus:outline-none focus:border-indigo-500 text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {tenantSettings && (
                    <div className="p-4 bg-zinc-950/40 border border-zinc-800/60 rounded-2xl">
                      <h4 className="text-xs font-bold text-white mb-2">معرّف المتجر في نظام الـ SaaS (Tenant ID):</h4>
                      <code className="text-[10px] text-indigo-400 block bg-zinc-950 p-3 rounded-xl border border-zinc-900 select-all overflow-x-auto text-left" dir="ltr">
                        {tenantSettings.id}
                      </code>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-indigo-500/10 cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    <span>حفظ التعديلات العامة</span>
                  </button>
                </form>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* 3. MODALS POPUPS SYSTEM */}
      {modalType && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          
          {/* Customer Modal */}
          {modalType === 'customer' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-6">
                {selectedItem ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h3>
              <form onSubmit={handleCustomerSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">اسم العميل</label>
                  <input
                    type="text"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">رقم الهاتف</label>
                  <input
                    type="text"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="010xxxxxxxx"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 text-left"
                    dir="ltr"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 text-left"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">ملاحظات</label>
                  <textarea
                    value={customerForm.notes}
                    onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    حفظ البيانات
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

          {/* Service Modal */}
          {modalType === 'service' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-6">
                {selectedItem ? 'تعديل بيانات الخدمة' : 'إضافة خدمة جديدة'}
              </h3>
              <form onSubmit={handleServiceSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">اسم الخدمة</label>
                  <input
                    type="text"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                    placeholder="مثال: Netflix Premium"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">مدة الصلاحية الافتراضية (بالأيام)</label>
                  <input
                    type="number"
                    value={serviceForm.defaultDuration}
                    onChange={(e) => setServiceForm({ ...serviceForm, defaultDuration: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">سعر البيع الافتراضي</label>
                    <input
                      type="number"
                      value={serviceForm.defaultSellingPrice}
                      onChange={(e) => setServiceForm({ ...serviceForm, defaultSellingPrice: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">سعر التكلفة الافتراضي</label>
                    <input
                      type="number"
                      value={serviceForm.defaultCostPrice}
                      onChange={(e) => setServiceForm({ ...serviceForm, defaultCostPrice: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    حفظ الخدمة
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

          {/* Subscription Modal */}
          {modalType === 'subscription' && (
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-6">إضافة اشتراك لعميل</h3>
              <form onSubmit={handleSubscriptionSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">اختر العميل</label>
                    <select
                      value={subscriptionForm.customerId}
                      onChange={(e) => setSubscriptionForm({ ...subscriptionForm, customerId: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                      required
                    >
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">اختر الخدمة</label>
                    <select
                      value={subscriptionForm.serviceId}
                      onChange={(e) => {
                        const srvId = e.target.value;
                        const srv = services.find(s => s.id === srvId);
                        setSubscriptionForm({
                          ...subscriptionForm,
                          serviceId: srvId,
                          sellingPrice: srv?.defaultSellingPrice || 0,
                          costPrice: srv?.defaultCostPrice || 0,
                        });
                      }}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                      required
                    >
                      {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">الباقة</label>
                    <input
                      type="text"
                      value={subscriptionForm.package}
                      onChange={(e) => setSubscriptionForm({ ...subscriptionForm, package: e.target.value })}
                      placeholder="شهري، سنوي، إلخ"
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">تاريخ البدء</label>
                    <input
                      type="date"
                      value={subscriptionForm.startDate}
                      onChange={(e) => setSubscriptionForm({ ...subscriptionForm, startDate: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">سعر البيع</label>
                    <input
                      type="number"
                      value={subscriptionForm.sellingPrice}
                      onChange={(e) => setSubscriptionForm({ ...subscriptionForm, sellingPrice: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">سعر التكلفة</label>
                    <input
                      type="number"
                      value={subscriptionForm.costPrice}
                      onChange={(e) => setSubscriptionForm({ ...subscriptionForm, costPrice: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">تاريخ الانتهاء (اتركه فارغاً للحساب التلقائي)</label>
                  <input
                    type="date"
                    value={subscriptionForm.endDate}
                    onChange={(e) => setSubscriptionForm({ ...subscriptionForm, endDate: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    حفظ الاشتراك
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

          {/* Renew Modal */}
          {modalType === 'renew' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-2">
                تجديد الاشتراك لـ {selectedItem?.customer.name}
              </h3>
              <p className="text-[10px] text-zinc-500 font-bold mb-6">
                الخدمة: {selectedItem?.service.name} | سيتم إغلاق الاشتراك الحالي وفتح اشتراك نشط جديد.
              </p>
              <form onSubmit={handleRenewSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">تاريخ بدء التجديد</label>
                  <input
                    type="date"
                    value={renewForm.startDate}
                    onChange={(e) => setRenewForm({ ...renewForm, startDate: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">سعر البيع</label>
                    <input
                      type="number"
                      value={renewForm.sellingPrice}
                      onChange={(e) => setRenewForm({ ...renewForm, sellingPrice: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">سعر التكلفة</label>
                    <input
                      type="number"
                      value={renewForm.costPrice}
                      onChange={(e) => setRenewForm({ ...renewForm, costPrice: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    تأكيد التجديد
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

          {/* Expense Modal */}
          {modalType === 'expense' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-6">تسجيل مصروف جديد</h3>
              <form onSubmit={handleExpenseSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">تصنيف المصروف</label>
                  <input
                    type="text"
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    placeholder="مثال: استضافة سيرفر، حسابات موردين"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">المبلغ</label>
                    <input
                      type="number"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">التاريخ</label>
                    <input
                      type="date"
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">ملاحظات</label>
                  <textarea
                    value={expenseForm.notes}
                    onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    حفظ المصروف
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

          {/* Ad Modal */}
          {modalType === 'ad' && (
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl animate-fadeUp text-right">
              <h3 className="text-sm font-black text-white mb-6">تسجيل مصروف إعلان</h3>
              <form onSubmit={handleAdSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">المنصة</label>
                  <input
                    type="text"
                    value={adForm.platform}
                    onChange={(e) => setAdForm({ ...adForm, platform: e.target.value })}
                    placeholder="مثال: فيسبوك، جوجل"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">المبلغ المنفق</label>
                    <input
                      type="number"
                      value={adForm.amount}
                      onChange={(e) => setAdForm({ ...adForm, amount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 mb-2">التاريخ</label>
                    <input
                      type="date"
                      value={adForm.date}
                      onChange={(e) => setAdForm({ ...adForm, date: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-2">ملاحظات</label>
                  <textarea
                    value={adForm.notes}
                    onChange={(e) => setAdForm({ ...adForm, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    حفظ الحملة
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
