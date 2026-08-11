/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import Link from 'next/link';
import BotSetupPage from '@/app/dashboard/bot/page';
import OperationsPage from '@/app/dashboard/operations/page';
import DataPage from '@/app/dashboard/data/page';
import { FormEvent, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, CheckCircle2, CreditCard, MessageCircleMore, Plus, Save, Trash2 } from 'lucide-react';
import {
  getMerchantProfile,
  saveBusinessProfile,
  saveContactMethods,
  savePaymentMethods,
} from '@/app/actions/merchant-profile';
import HelpTip from '@/app/dashboard/help-tip';

type ContactRow = { id: string; type: string; label: string; value: string; url: string; showInBot: boolean };
type PaymentRow = { id: string; type: string; label: string; accountIdentifier: string; directPaymentUrl: string; instructions: string; isActive: boolean; showInBot: boolean };

const inputClass = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm outline-none transition-colors duration-150 placeholder:text-zinc-600 focus:border-emerald-500/70';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-[background-color,transform] duration-150 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50';
const contactLabels: Record<string, string> = { whatsapp: 'واتساب', telegram: 'تيليجرام', facebook: 'فيسبوك', instagram: 'إنستجرام', email: 'البريد الإلكتروني', phone: 'هاتف', website: 'الموقع', other: 'وسيلة أخرى' };
const paymentLabels: Record<string, string> = { wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي', other: 'وسيلة أخرى' };

function randomId() {
  return Math.random().toString(36).slice(2);
}

function menuAmounts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '50,100,200,500';
  const amounts = (value as Record<string, unknown>).rechargeAmounts;
  return Array.isArray(amounts) ? amounts.join(',') : '50,100,200,500';
}

export default function StoreSettingsPage() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'store';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();
  const [business, setBusiness] = useState({ storeName: '', businessType: '', businessDescription: '', websiteUrl: '' });
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [rechargeAmounts, setRechargeAmounts] = useState('50,100,200,500');
  const [completed, setCompleted] = useState(false);

  const refresh = async () => {
    const profile = await getMerchantProfile();
    setBusiness({
      storeName: profile.storeName,
      businessType: profile.businessType || '',
      businessDescription: profile.businessDescription || '',
      websiteUrl: profile.websiteUrl || '',
    });
    setContacts(profile.contacts.map((item) => ({ id: item.id, type: item.type, label: item.label, value: item.value, url: item.url || '', showInBot: item.showInBot })));
    setPayments(profile.paymentMethods.map((item) => ({ id: item.id, type: item.type, label: item.label, accountIdentifier: item.accountIdentifier, directPaymentUrl: item.directPaymentUrl || '', instructions: item.instructions || '', isActive: item.isActive, showInBot: item.showInBot })));
    setRechargeAmounts(menuAmounts(profile.botSettings?.menuConfig));
    setCompleted(profile.completed);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (activeTab === 'setup') router.replace('/dashboard/setup'); }, [activeTab, router]);

  const submitBusiness = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveBusinessProfile(business);
      setNotice(result.success ? 'تم حفظ بيانات النشاط.' : result.error || 'تعذر الحفظ.');
      if (result.success) await refresh();
    });
  };

  const submitContacts = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveContactMethods({ contacts });
      setNotice(result.success ? 'تم حفظ وسائل التواصل وربطها بالدعم داخل البوت.' : result.error || 'تعذر الحفظ.');
      if (result.success) await refresh();
    });
  };

  const submitPayments = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await savePaymentMethods({ methods: payments, rechargeAmounts });
      setNotice(result.success ? 'تم حفظ وسائل الدفع وقيم الشحن.' : result.error || 'تعذر الحفظ.');
      if (result.success) await refresh();
    });
  };

  if (loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-zinc-400">جارٍ تحميل بيانات المتجر...</div>;

  return <section dir="rtl" className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-bold text-emerald-400">هوية واحدة لكل القنوات</p><h1 className="mt-2 text-2xl font-black">بيانات المتجر والتواصل والدفع</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">أي بيانات تحفظها هنا تظهر تلقائيًا في الأماكن المناسبة داخل البوت ولوحة التحكم.</p></div>
      <div className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${completed ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-200'}`}><CheckCircle2 className="h-4 w-4" />{completed ? 'بيانات التشغيل مكتملة' : 'تحتاج إلى استكمال البيانات الأساسية'}</div>
    </header>

    {notice ? <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}

    <nav className="flex flex-wrap gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-2" aria-label="أقسام الإعدادات">
      <Link href="/dashboard/settings" className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === 'store' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>بيانات المتجر</Link>
      <Link href="/dashboard/settings?tab=contacts" className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === 'contacts' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>التواصل والدعم</Link>
      <Link href="/dashboard/settings?tab=payments" className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === 'payments' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>الدفع وشحن المحفظة</Link>
      <Link href="/dashboard/settings?tab=bot" className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === 'bot' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>البوت والقناة</Link>
      <Link href="/dashboard/settings?tab=team" className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === 'team' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>الفريق والصلاحيات</Link>
      <Link href="/dashboard/settings?tab=data" className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === 'data' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>استيراد وتصدير البيانات</Link>    </nav>
    <div className="space-y-6">
    {activeTab === 'store' ? <>
    <form onSubmit={submitBusiness} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300"><Building2 className="h-5 w-5" /></span><div><h2 className="text-lg font-black">بيانات النشاط</h2><p className="mt-1 text-sm text-zinc-500">الاسم والوصف اللذان يعرّفان العميل بمتجرك.</p></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label><span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">اسم النشاط<HelpTip text="اسم الشركة أو المتجر الذي سيظهر داخل البوت والرسائل." /></span><input required value={business.storeName} onChange={(event) => setBusiness({ ...business, storeName: event.target.value })} className={inputClass} /></label>
        <label><span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">نوع النشاط<HelpTip text="مثال: اشتراكات رقمية، خدمات تسويق، برامج، تعليم." /></span><input required value={business.businessType} onChange={(event) => setBusiness({ ...business, businessType: event.target.value })} className={inputClass} placeholder="اشتراكات وخدمات رقمية" /></label>
        <label className="md:col-span-2"><span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">نبذة عن النشاط<HelpTip text="وصف مختصر يساعد العميل وفريقك على فهم ما يقدمه المتجر." /></span><textarea rows={3} value={business.businessDescription} onChange={(event) => setBusiness({ ...business, businessDescription: event.target.value })} className={inputClass} /></label>
        <label><span className="mb-2 block text-xs font-bold text-zinc-400">الموقع الإلكتروني، اختياري</span><input dir="ltr" value={business.websiteUrl} onChange={(event) => setBusiness({ ...business, websiteUrl: event.target.value })} className={inputClass} placeholder="https://example.com" /></label>
      </div>
      <button disabled={isPending} className={`${primary} mt-5`}><Save className="h-4 w-4" />حفظ بيانات النشاط</button>
    </form>
    </> : null}
    {activeTab === 'contacts' ? <>
    <form onSubmit={submitContacts} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-300"><MessageCircleMore className="h-5 w-5" /></span><div><h2 className="text-lg font-black">وسائل التواصل والدعم</h2><p className="mt-1 text-sm text-zinc-500">واتساب وتيليجرام مطلوبان، ويمكنك إضافة أي عدد من القنوات الأخرى.</p></div></div><button type="button" onClick={() => setContacts([...contacts, { id: randomId(), type: 'other', label: 'وسيلة أخرى', value: '', url: '', showInBot: true }])} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold hover:bg-zinc-800 active:scale-[0.98]"><Plus className="h-4 w-4" />إضافة وسيلة</button></div>
      <div className="space-y-3">
        {contacts.map((contact, index) => <div key={contact.id} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:grid-cols-[10rem_1fr_1fr_auto]">
          <select value={contact.type} onChange={(event) => setContacts(contacts.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value, label: contactLabels[event.target.value] } : item))} className={inputClass}>{Object.entries(contactLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input required value={contact.label} onChange={(event) => setContacts(contacts.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className={inputClass} placeholder="اسم يظهر للعميل" />
          <input required dir={['whatsapp', 'telegram', 'email', 'phone'].includes(contact.type) ? 'ltr' : 'auto'} value={contact.value} onChange={(event) => setContacts(contacts.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} className={inputClass} placeholder={contact.type === 'telegram' ? '@username' : contact.type === 'whatsapp' ? '201xxxxxxxxx' : 'الرابط أو القيمة'} />
          <button type="button" onClick={() => setContacts(contacts.filter((_, itemIndex) => itemIndex !== index))} className="grid h-11 w-11 place-items-center rounded-xl text-zinc-500 hover:bg-red-500/10 hover:text-red-300" aria-label="حذف وسيلة التواصل"><Trash2 className="h-4 w-4" /></button>
          <label className="flex items-center gap-2 text-xs text-zinc-400 md:col-span-4"><input type="checkbox" checked={contact.showInBot} onChange={(event) => setContacts(contacts.map((item, itemIndex) => itemIndex === index ? { ...item, showInBot: event.target.checked } : item))} className="accent-emerald-500" />عرض هذه الوسيلة داخل زر الدعم في البوت</label>
        </div>)}
        {!contacts.length ? <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500">أضف واتساب وتيليجرام للبدء.</div> : null}
      </div>
      <button disabled={isPending} className={`${primary} mt-5`}><Save className="h-4 w-4" />حفظ وسائل التواصل</button>
    </form>
    </> : null}
    {activeTab === 'payments' ? <>
    <form onSubmit={submitPayments} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-300"><CreditCard className="h-5 w-5" /></span><div><h2 className="text-lg font-black">وسائل الدفع وشحن المحفظة</h2><p className="mt-1 text-sm text-zinc-500">ستظهر للعميل ليختار بينها قبل إنشاء طلب الشحن.</p></div></div><button type="button" onClick={() => setPayments([...payments, { id: randomId(), type: 'wallet', label: 'محفظة إلكترونية', accountIdentifier: '', directPaymentUrl: '', instructions: '', isActive: true, showInBot: true }])} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold hover:bg-zinc-800 active:scale-[0.98]"><Plus className="h-4 w-4" />إضافة طريقة</button></div>
      <div className="space-y-3">{payments.map((payment, index) => <div key={payment.id} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:grid-cols-2">
        <select value={payment.type} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value, label: paymentLabels[event.target.value] } : item))} className={inputClass}>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input required value={payment.label} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className={inputClass} placeholder="اسم الطريقة" />
        <input required dir="ltr" value={payment.accountIdentifier} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, accountIdentifier: event.target.value } : item))} className={inputClass} placeholder="رقم المحفظة أو عنوان InstaPay" />
        <input dir="ltr" value={payment.directPaymentUrl} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, directPaymentUrl: event.target.value } : item))} className={inputClass} placeholder="رابط الدفع المباشر، اختياري" />
        <textarea value={payment.instructions} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, instructions: event.target.value } : item))} className={`${inputClass} md:col-span-2`} placeholder="تعليمات إضافية للعميل، اختياري" />
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400"><label className="flex items-center gap-2"><input type="checkbox" checked={payment.isActive} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: event.target.checked } : item))} className="accent-emerald-500" />مفعلة</label><label className="flex items-center gap-2"><input type="checkbox" checked={payment.showInBot} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, showInBot: event.target.checked } : item))} className="accent-emerald-500" />تظهر في البوت</label></div>
        <button type="button" onClick={() => setPayments(payments.filter((_, itemIndex) => itemIndex !== index))} className="justify-self-end rounded-xl px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"><Trash2 className="ml-2 inline h-4 w-4" />حذف الطريقة</button>
      </div>)}</div>
      <label className="mt-4 block"><span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">قيم الشحن السريعة<HelpTip text="افصل القيم بفاصلة. سيظل العميل قادرًا على كتابة قيمة خاصة من داخل البوت." /></span><input dir="ltr" value={rechargeAmounts} onChange={(event) => setRechargeAmounts(event.target.value)} className={inputClass} /></label>
      <button disabled={isPending} className={`${primary} mt-5`}><Save className="h-4 w-4" />حفظ وسائل الدفع</button>
    </form>
    </> : null}
    </div>

    {activeTab === 'bot' ? <BotSetupPage /> : null}
    {activeTab === 'team' ? <OperationsPage /> : null}
    {activeTab === 'data' ? <DataPage /> : null}  </section>;
}
