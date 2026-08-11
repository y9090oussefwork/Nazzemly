'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Building2, Check, CheckCircle2, ChevronLeft, CreditCard, MessageCircleMore, Plus, Sparkles, Trash2 } from 'lucide-react';
import { saveBotSettings } from '@/app/actions/merchant';
import {
  completeMerchantOnboarding,
  getMerchantProfile,
  saveBusinessProfile,
  saveContactMethods,
  saveMarketingChannel,
  savePaymentMethods,
} from '@/app/actions/merchant-profile';

type PaymentRow = { id: string; type: string; label: string; accountIdentifier: string; directPaymentUrl: string; instructions: string; isActive: boolean; showInBot: boolean };

const steps = [
  { id: 1, label: 'النشاط', icon: Building2 },
  { id: 2, label: 'التواصل', icon: MessageCircleMore },
  { id: 3, label: 'الدفع', icon: CreditCard },
  { id: 4, label: 'البوت', icon: Bot },
];
const inputClass = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm outline-none transition-colors duration-150 placeholder:text-zinc-600 focus:border-emerald-500/70';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-zinc-950 transition-[background-color,transform] duration-150 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50';
const paymentNames: Record<string, string> = { wallet: 'محفظة إلكترونية', instapay: 'InstaPay', bank_transfer: 'تحويل بنكي', other: 'وسيلة أخرى' };
const makePayment = (): PaymentRow => ({ id: Math.random().toString(36).slice(2), type: 'wallet', label: 'محفظة إلكترونية', accountIdentifier: '', directPaymentUrl: '', instructions: '', isActive: true, showInBot: true });

export default function QuickSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();
  const [business, setBusiness] = useState({ storeName: '', businessType: '', businessDescription: '', websiteUrl: '' });
  const [contact, setContact] = useState({ whatsapp: '', telegram: '', facebook: '', instagram: '' });
  const [payments, setPayments] = useState<PaymentRow[]>([makePayment()]);
  const [rechargeAmounts, setRechargeAmounts] = useState('50,100,200,500');
  const [bot, setBot] = useState({ token: '', channelChatId: '', channelUrl: '', requireChannelJoin: false, autoPostServices: false, autoPostRestocks: false });
  const [wasCompleted, setWasCompleted] = useState(false);

  useEffect(() => {
    void getMerchantProfile().then((profile) => {
      setBusiness({ storeName: profile.storeName, businessType: profile.businessType || '', businessDescription: profile.businessDescription || '', websiteUrl: profile.websiteUrl || '' });
      const whatsapp = profile.contacts.find((item) => item.type === 'whatsapp')?.value || '';
      const telegram = profile.contacts.find((item) => item.type === 'telegram')?.value || '';
      const facebook = profile.contacts.find((item) => item.type === 'facebook')?.value || '';
      const instagram = profile.contacts.find((item) => item.type === 'instagram')?.value || '';
      setContact({ whatsapp, telegram, facebook, instagram });
      if (profile.paymentMethods.length) setPayments(profile.paymentMethods.map((item) => ({ id: item.id, type: item.type, label: item.label, accountIdentifier: item.accountIdentifier, directPaymentUrl: item.directPaymentUrl || '', instructions: item.instructions || '', isActive: item.isActive, showInBot: item.showInBot })));
      const config = profile.botSettings?.menuConfig && typeof profile.botSettings.menuConfig === 'object' && !Array.isArray(profile.botSettings.menuConfig) ? profile.botSettings.menuConfig as Record<string, unknown> : {};
      if (Array.isArray(config.rechargeAmounts)) setRechargeAmounts(config.rechargeAmounts.join(','));
      setBot((current) => ({ ...current, channelChatId: profile.botSettings?.channelChatId || '', channelUrl: profile.botSettings?.channelUrl || '', requireChannelJoin: profile.botSettings?.requireChannelJoin || false, autoPostServices: profile.botSettings?.autoPostServices || false, autoPostRestocks: profile.botSettings?.autoPostRestocks || false }));
      setWasCompleted(profile.completed);
      setStep(profile.completed ? 1 : Math.min(Math.max(profile.onboardingStep + 1, 1), 4));
      setLoading(false);
    });
  }, []);

  const saveBusiness = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveBusinessProfile(business);
      if (!result.success) return setNotice(result.error || 'تعذر حفظ بيانات النشاط.');
      setNotice('تم حفظ بيانات النشاط.');
      setStep(2);
    });
  };

  const saveContacts = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const contacts = [
        { type: 'whatsapp', label: 'واتساب الدعم', value: contact.whatsapp, showInBot: true },
        { type: 'telegram', label: 'تيليجرام الدعم', value: contact.telegram, showInBot: true },
        ...(contact.facebook ? [{ type: 'facebook', label: 'فيسبوك', value: contact.facebook, showInBot: false }] : []),
        ...(contact.instagram ? [{ type: 'instagram', label: 'إنستجرام', value: contact.instagram, showInBot: false }] : []),
      ];
      const result = await saveContactMethods({ contacts });
      if (!result.success) return setNotice(result.error || 'تعذر حفظ وسائل التواصل.');
      setNotice('تم حفظ وسائل التواصل والدعم.');
      setStep(3);
    });
  };

  const savePayments = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await savePaymentMethods({ methods: payments, rechargeAmounts });
      if (!result.success) return setNotice(result.error || 'تعذر حفظ وسائل الدفع.');
      setNotice('تم حفظ وسائل الدفع.');
      setStep(4);
    });
  };

  const finish = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      if (bot.token.trim()) {
        const botResult = await saveBotSettings({ botToken: bot.token, isActive: true });
        if (!botResult.success) return setNotice(botResult.error || 'تعذر ربط البوت. يمكنك ترك الرمز فارغًا وإكمال الإعداد.');
      }
      if (bot.channelChatId || bot.channelUrl || bot.requireChannelJoin || bot.autoPostServices || bot.autoPostRestocks) {
        const channelResult = await saveMarketingChannel(bot);
        if (!channelResult.success) return setNotice(channelResult.error || 'تعذر حفظ القناة.');
      }
      const result = await completeMerchantOnboarding();
      if (!result.success) return setNotice(result.error || 'تعذر إكمال الإعداد.');
      setNotice('متجرك جاهز. سيتم فتح لوحة التشغيل الآن.');
      router.replace('/dashboard');
    });
  };

  if (loading) return <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-zinc-400">جارٍ تجهيز جولتك...</div>;

  return <section dir="rtl" className="mx-auto max-w-4xl space-y-6">
    <header className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-zinc-950"><Sparkles className="h-6 w-6" /></span><div><p className="text-sm font-bold text-emerald-400">إعداد يحفظ تقدمك تلقائيًا</p><h1 className="mt-1 text-2xl font-black">جهّز متجرك في خطوات بسيطة</h1><p className="mt-2 text-sm leading-7 text-zinc-400">هذه البيانات تجعل المحفظة والدفع والدعم والبوت تعمل بشكل صحيح. يمكنك تعديلها لاحقًا في أي وقت.</p></div></div>
      {wasCompleted ? <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">إعدادك مكتمل بالفعل. يمكنك استخدام الجولة لتحديث بياناتك.</p> : null}
      <div className="mt-6 grid grid-cols-4 gap-2">{steps.map((item) => { const Icon = item.icon; const active = item.id === step; const done = item.id < step || wasCompleted; return <button type="button" key={item.id} onClick={() => setStep(item.id)} className={`rounded-xl border p-3 text-center transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${active ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-950/60'}`}><span className={`mx-auto grid h-8 w-8 place-items-center rounded-full ${done ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span className="mt-2 block text-xs font-bold">{item.label}</span></button>; })}</div>
    </header>

    {notice ? <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</p> : null}

    {step === 1 ? <form onSubmit={saveBusiness} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"><h2 className="text-xl font-black">1. بيانات النشاط</h2><p className="mt-2 text-sm text-zinc-500">عرّف متجرك للعميل وفريق العمل.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-xs font-bold text-zinc-400">اسم النشاط</span><input required value={business.storeName} onChange={(event) => setBusiness({ ...business, storeName: event.target.value })} className={inputClass} /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">نوع النشاط</span><input required value={business.businessType} onChange={(event) => setBusiness({ ...business, businessType: event.target.value })} className={inputClass} placeholder="اشتراكات وخدمات رقمية" /></label><label className="md:col-span-2"><span className="mb-2 block text-xs font-bold text-zinc-400">نبذة عن النشاط</span><textarea rows={3} value={business.businessDescription} onChange={(event) => setBusiness({ ...business, businessDescription: event.target.value })} className={inputClass} /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">الموقع، اختياري</span><input dir="ltr" value={business.websiteUrl} onChange={(event) => setBusiness({ ...business, websiteUrl: event.target.value })} className={inputClass} /></label></div><button disabled={isPending} className={`${primary} mt-6`}>حفظ والمتابعة<ChevronLeft className="h-4 w-4" /></button></form> : null}

    {step === 2 ? <form onSubmit={saveContacts} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"><h2 className="text-xl font-black">2. التواصل والدعم</h2><p className="mt-2 text-sm leading-7 text-zinc-500">واتساب وتيليجرام مطلوبان ليجد العميل طريقة واضحة للتواصل معك.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-xs font-bold text-zinc-400">رقم واتساب</span><input required dir="ltr" value={contact.whatsapp} onChange={(event) => setContact({ ...contact, whatsapp: event.target.value })} className={inputClass} placeholder="201xxxxxxxxx" /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">اسم مستخدم تيليجرام</span><input required dir="ltr" value={contact.telegram} onChange={(event) => setContact({ ...contact, telegram: event.target.value })} className={inputClass} placeholder="@username" /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">فيسبوك، اختياري</span><input dir="ltr" value={contact.facebook} onChange={(event) => setContact({ ...contact, facebook: event.target.value })} className={inputClass} /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">إنستجرام، اختياري</span><input dir="ltr" value={contact.instagram} onChange={(event) => setContact({ ...contact, instagram: event.target.value })} className={inputClass} /></label></div><div className="mt-6 flex gap-3"><button type="button" onClick={() => setStep(1)} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold">السابق</button><button disabled={isPending} className={primary}>حفظ والمتابعة<ChevronLeft className="h-4 w-4" /></button></div></form> : null}

    {step === 3 ? <form onSubmit={savePayments} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">3. وسائل الدفع</h2><p className="mt-2 text-sm text-zinc-500">أضف وسيلة واحدة على الأقل، ويمكن للعميل الاختيار بينها داخل البوت.</p></div><button type="button" onClick={() => setPayments([...payments, makePayment()])} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold"><Plus className="h-4 w-4" />طريقة أخرى</button></div><div className="mt-5 space-y-3">{payments.map((payment, index) => <div key={payment.id} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 md:grid-cols-2"><select value={payment.type} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value, label: paymentNames[event.target.value] } : item))} className={inputClass}>{Object.entries(paymentNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><input required value={payment.label} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className={inputClass} /><input required dir="ltr" value={payment.accountIdentifier} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, accountIdentifier: event.target.value } : item))} className={inputClass} placeholder="رقم المحفظة أو عنوان InstaPay" /><input dir="ltr" value={payment.directPaymentUrl} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, directPaymentUrl: event.target.value } : item))} className={inputClass} placeholder="رابط دفع مباشر، اختياري" /><textarea value={payment.instructions} onChange={(event) => setPayments(payments.map((item, itemIndex) => itemIndex === index ? { ...item, instructions: event.target.value } : item))} className={`${inputClass} md:col-span-2`} placeholder="تعليمات إضافية، اختياري" />{payments.length > 1 ? <button type="button" onClick={() => setPayments(payments.filter((_, itemIndex) => itemIndex !== index))} className="justify-self-end text-xs font-bold text-red-300"><Trash2 className="ml-2 inline h-4 w-4" />حذف</button> : null}</div>)}</div><label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">قيم الشحن السريعة، مفصولة بفاصلة</span><input dir="ltr" value={rechargeAmounts} onChange={(event) => setRechargeAmounts(event.target.value)} className={inputClass} /></label><div className="mt-6 flex gap-3"><button type="button" onClick={() => setStep(2)} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold">السابق</button><button disabled={isPending} className={primary}>حفظ والمتابعة<ChevronLeft className="h-4 w-4" /></button></div></form> : null}

    {step === 4 ? <form onSubmit={finish} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"><h2 className="text-xl font-black">4. البوت والقناة، اختياري</h2><p className="mt-2 text-sm leading-7 text-zinc-500">يمكنك إنهاء الإعداد بدون بوت. عند إضافته ستعمل المحفظة والكتالوج والدعم والتنبيهات داخله.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="md:col-span-2"><span className="mb-2 block text-xs font-bold text-zinc-400">رمز BotFather، اختياري</span><input dir="ltr" type="password" value={bot.token} onChange={(event) => setBot({ ...bot, token: event.target.value })} className={inputClass} placeholder="اتركه فارغًا للتخطي" /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">اسم القناة أو رقمها، اختياري</span><input dir="ltr" value={bot.channelChatId} onChange={(event) => setBot({ ...bot, channelChatId: event.target.value })} className={inputClass} placeholder="@channel" /></label><label><span className="mb-2 block text-xs font-bold text-zinc-400">رابط القناة، اختياري</span><input dir="ltr" value={bot.channelUrl} onChange={(event) => setBot({ ...bot, channelUrl: event.target.value })} className={inputClass} placeholder="https://t.me/channel" /></label><div className="space-y-3 md:col-span-2">{[{ key: 'requireChannelJoin', label: 'إلزام العميل بالانضمام للقناة قبل استخدام البوت' }, { key: 'autoPostServices', label: 'نشر الخدمات الجديدة تلقائيًا في القناة' }, { key: 'autoPostRestocks', label: 'نشر عودة المخزون تلقائيًا في القناة' }].map((item) => <label key={item.key} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm"><input type="checkbox" checked={Boolean(bot[item.key as keyof typeof bot])} onChange={(event) => setBot({ ...bot, [item.key]: event.target.checked })} className="accent-emerald-500" />{item.label}</label>)}</div></div><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setStep(3)} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold">السابق</button><button disabled={isPending} className={primary}><CheckCircle2 className="h-4 w-4" />إنهاء وفتح لوحة التشغيل</button></div></form> : null}
  </section>;
}
