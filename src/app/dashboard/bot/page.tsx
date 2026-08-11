/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState, useTransition } from 'react';
import { AlertCircle, Bot, CheckCircle2, Circle, ExternalLink, Info, Megaphone, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';
import { checkBotHealth, getSettings, saveBotSettings } from '@/app/actions/merchant';
import { getBotControlCenter } from '@/app/actions/bot-admin';
import { getMerchantProfile, saveMarketingChannel } from '@/app/actions/merchant-profile';
import HelpTip from '@/app/dashboard/help-tip';

type Notice = { text: string; tone: 'success' | 'warning' | 'error' | 'info' } | null;

const inputClass = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm outline-none transition-colors duration-150 placeholder:text-zinc-600 focus:border-emerald-500/70';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-[background-color,transform] duration-150 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50';

function StepTitle({ number, title, done, tip }: { number: number; title: string; done: boolean; tip: string }) {
  return <div className="mb-4 flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${done ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}>{done ? <CheckCircle2 className="h-5 w-5" /> : number}</span><h2 className="flex items-center gap-1 text-lg font-black">{title}<HelpTip text={tip} /></h2></div>;
}

function friendlyMessage(message?: string | null) {
  if (!message) return '';
  if (message.includes('APP_ENCRYPTION_KEY') || message.includes('إعداد الأمان الداخلي')) return 'تعذر حفظ البوت بسبب إعداد أمان داخلي في المنصة. تواصل مع دعم المنصة، ولا تحتاج إلى تنفيذ أي خطوة تقنية.';
  const normalized = message.toLowerCase();
  if (normalized.includes('app_base_url') || normalized.includes('https') || normalized.includes('webhook')) return 'تم حفظ رمز البوت، لكن استقبال الرسائل يحتاج رابطًا آمنًا للمنصة. هذه مسؤولية مالك المنصة وليست مطلوبة من التاجر.';
  return message;
}

export default function BotSetupPage() {
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [settings, setSettings] = useState<any>(null);
  const [center, setCenter] = useState<any>(null);
  const [botForm, setBotForm] = useState({ botToken: '', welcomeMsg: 'مرحباً بك في متجرنا 👋', supportMessage: 'اختر طريقة التواصل المناسبة وسيرد عليك فريق المتجر.', isActive: true });
  const [channel, setChannel] = useState({ channelChatId: '', channelUrl: '', requireChannelJoin: false, autoPostServices: false, autoPostRestocks: false });

  const refresh = async () => {
    const [settingsResult, centerResult, profile] = await Promise.all([getSettings(), getBotControlCenter(), getMerchantProfile()]);
    if (settingsResult.success) {
      const currentBot = settingsResult.tenant?.botSettings;
      setSettings(settingsResult.tenant);
      setBotForm((current) => ({ ...current, welcomeMsg: currentBot?.welcomeMsg || current.welcomeMsg, supportMessage: currentBot?.supportMessage || current.supportMessage, isActive: currentBot?.isActive ?? true }));
    } else setNotice({ text: settingsResult.error || 'تعذر تحميل إعدادات المتجر.', tone: 'error' });
    if (centerResult.success) setCenter(centerResult);
    setChannel({
      channelChatId: profile.botSettings?.channelChatId || '',
      channelUrl: profile.botSettings?.channelUrl || '',
      requireChannelJoin: profile.botSettings?.requireChannelJoin || false,
      autoPostServices: profile.botSettings?.autoPostServices || false,
      autoPostRestocks: profile.botSettings?.autoPostRestocks || false,
    });
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  const bot = settings?.botSettings;
  const connected = bot?.connectionStatus === 'connected';
  const configured = Boolean(bot?.tokenLast4);
  const setupRequired = configured && ['setup_required', 'warning', 'error'].includes(bot?.connectionStatus);
  const channelReady = Boolean(channel.channelChatId);

  const saveBot = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setNotice({ text: 'جارٍ التحقق من الرمز وتشغيل البوت. قد يستغرق ذلك عدة ثوانٍ.', tone: 'info' });
      const result = await saveBotSettings(botForm);
      if (!result.success) return setNotice({ text: friendlyMessage(result.error) || 'تعذر حفظ البوت.', tone: 'error' });
      const text = result.connected
        ? result.connectionMode === 'local_polling' ? 'تم حفظ الرمز وتشغيل البوت محليًا بأمان. البوت جاهز للتجربة الآن.' : 'تم حفظ الرمز وربط البوت بالمنصة.'
        : friendlyMessage(result.warning) || 'تم حفظ الرمز، وسيكتمل التشغيل بعد تجهيز رابط المنصة.';
      setNotice({ text, tone: result.connected ? 'success' : 'warning' });
      setBotForm((current) => ({ ...current, botToken: '' }));
      await refresh();
    });
  };

  const saveChannel = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveMarketingChannel(channel);
      setNotice(result.success ? { text: 'تم حفظ إعدادات القناة التسويقية.', tone: 'success' } : { text: result.error || 'تعذر حفظ القناة.', tone: 'error' });
      if (result.success) await refresh();
    });
  };

  const testConnection = () => startTransition(async () => {
    setNotice({ text: 'جارٍ فحص الاتصال بتيليجرام.', tone: 'info' });
    const result = await checkBotHealth();
    const health = result.success ? result.health : null;
    setNotice(result.success && health?.status === 'connected'
      ? { text: `البوت يعمل بنجاح${health.username ? ` باسم ${health.username}` : ''}.`, tone: 'success' }
      : { text: friendlyMessage(result.error || health?.lastError) || 'الاتصال غير مكتمل. اضغط حفظ وتشغيل البوت.', tone: 'warning' });
    await refresh();
  });

  if (loading) return <div className="mx-auto max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-zinc-400">جارٍ فحص إعدادات البوت...</div>;

  const noticeStyle = notice?.tone === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100' : notice?.tone === 'warning' ? 'border-amber-500/25 bg-amber-500/10 text-amber-100' : notice?.tone === 'error' ? 'border-red-500/25 bg-red-500/10 text-red-100' : 'border-sky-500/25 bg-sky-500/10 text-sky-100';

  return <section dir="rtl" className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-bold text-emerald-400">إعداد بدون كتابة كود</p><h1 className="mt-2 text-2xl font-black">بوت المتجر والقناة التسويقية</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">المحفظة والشحن والخدمات والدعم تعمل تلقائيًا من بيانات متجرك.</p></div><button onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold hover:bg-zinc-900 active:scale-[0.98]"><RefreshCw className="h-4 w-4" />تحديث الحالة</button></header>
    <div className="flex flex-col gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm leading-7 text-sky-100 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-3"><Info className="mt-1 h-5 w-5 shrink-0 text-sky-300" /><span><b className="block">بيانات الدفع والدعم في صفحة المتجر</b>عدّل واتساب وتيليجرام ووسائل الدفع من مكان واحد، وسيقرأها البوت تلقائيًا.</span></span><Link href="/dashboard/settings" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 font-black text-zinc-950 active:scale-[0.98]"><Settings2 className="h-4 w-4" />إعدادات المتجر</Link></div>
    {notice ? <div role="status" className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm leading-6 ${noticeStyle}`}><span className="flex items-start gap-2">{notice.tone === 'success' ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : notice.tone === 'warning' || notice.tone === 'error' ? <AlertCircle className="mt-1 h-4 w-4 shrink-0" /> : <Info className="mt-1 h-4 w-4 shrink-0" />}{notice.text}</span><button onClick={() => setNotice(null)}>إغلاق</button></div> : null}
    <div className="grid gap-3 sm:grid-cols-4">{[
      { label: 'رمز البوت', done: configured, value: configured ? `محفوظ وينتهي بـ ${bot?.tokenLast4}` : 'لم يُحفظ' },
      { label: 'حالة البوت', done: connected, value: connected ? `يعمل ${bot?.botUsername || ''}` : setupRequired ? 'يحتاج مراجعة' : 'جاهز للربط' },
      { label: 'القناة', done: channelReady, value: channelReady ? channel.channelChatId : 'اختيارية' },
      { label: 'عملاء مرتبطون', done: (center?.metrics?.linkedCustomers || 0) > 0, value: `${center?.metrics?.linkedCustomers || 0} عميل` },
    ].map((item) => <div key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><div className="flex items-center gap-2 text-sm text-zinc-500">{item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4" />}{item.label}</div><b className="mt-3 block truncate">{item.value}</b></div>)}</div>
    <div className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><StepTitle number={1} title="إنشاء البوت من BotFather" done={configured} tip="BotFather هو الحساب الرسمي داخل تيليجرام لإنشاء البوتات مجانًا." /><ol className="space-y-3 text-sm leading-7 text-zinc-300"><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">1.</b> افتح BotFather واضغط Start.</li><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">2.</b> أرسل <code dir="ltr" className="rounded bg-zinc-800 px-2 py-1">/newbot</code>.</li><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">3.</b> اكتب اسمًا واسم مستخدم ينتهي بـ bot.</li><li className="rounded-xl bg-zinc-950 p-3"><b className="text-emerald-300">4.</b> انسخ الرمز ولا تشاركه مع أحد.</li></ol><a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className={`${primary} mt-4 w-full`}><ExternalLink className="h-4 w-4" />فتح BotFather</a></article>
      <form onSubmit={saveBot} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><StepTitle number={2} title="لصق الرمز وتشغيل البوت" done={configured} tip="يُحفظ الرمز مشفرًا، ويمكن تركه فارغًا عند تعديل الرسائل." /><label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">رمز البوت</span><input dir="ltr" type="password" value={botForm.botToken} onChange={(event) => setBotForm({ ...botForm, botToken: event.target.value })} className={inputClass} placeholder={configured ? 'اتركه فارغًا للاحتفاظ بالرمز' : '123456789:AA...'} /></label><label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">رسالة الترحيب</span><textarea rows={3} value={botForm.welcomeMsg} onChange={(event) => setBotForm({ ...botForm, welcomeMsg: event.target.value })} className={inputClass} /></label><label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">رسالة الدعم</span><textarea rows={2} value={botForm.supportMessage} onChange={(event) => setBotForm({ ...botForm, supportMessage: event.target.value })} className={inputClass} /></label><label className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3"><b className="text-sm">تشغيل البوت</b><input type="checkbox" checked={botForm.isActive} onChange={(event) => setBotForm({ ...botForm, isActive: event.target.checked })} className="accent-emerald-500" /></label><button disabled={isPending} className={`${primary} w-full`}><ShieldCheck className="h-4 w-4" />حفظ وتشغيل البوت</button></form>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><StepTitle number={3} title="اختبار البوت" done={connected} tip="يفحص الاتصال ويعيد تشغيل الاستقبال المحلي إذا احتاج." /><div className={`rounded-2xl border p-5 text-center ${connected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-950'}`}><Bot className={`mx-auto h-10 w-10 ${connected ? 'text-emerald-400' : 'text-zinc-600'}`} /><h3 className="mt-3 text-lg font-black">{connected ? 'البوت متصل وجاهز' : 'احفظ الرمز أولًا'}</h3><p className="mt-2 text-sm text-zinc-400">{connected ? 'يمكنك الآن تجربة المحفظة والخدمات والدعم.' : 'بعد الحفظ سيشغل النظام الاتصال تلقائيًا.'}</p></div><button type="button" disabled={isPending || !configured} onClick={testConnection} className={`${primary} mt-4 w-full`}><RefreshCw className="h-4 w-4" />اختبار الاتصال</button>{bot?.botUsername ? <a href={`https://t.me/${String(bot.botUsername).replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold"><ExternalLink className="h-4 w-4" />فتح البوت وتجربة /start</a> : null}</article>
      <form onSubmit={saveChannel} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><StepTitle number={4} title="القناة التسويقية، اختيارية" done={channelReady} tip="اجعل البوت مشرفًا في القناة ليتمكن من النشر والتحقق من اشتراك العملاء." /><label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">اسم القناة أو رقمها</span><input dir="ltr" value={channel.channelChatId} onChange={(event) => setChannel({ ...channel, channelChatId: event.target.value })} className={inputClass} placeholder="@my_store_channel" /></label><label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">رابط القناة</span><input dir="ltr" value={channel.channelUrl} onChange={(event) => setChannel({ ...channel, channelUrl: event.target.value })} className={inputClass} placeholder="https://t.me/my_store_channel" /></label><div className="space-y-3">{[{ key: 'requireChannelJoin', label: 'اشتراط الانضمام قبل استخدام البوت' }, { key: 'autoPostServices', label: 'نشر الخدمات الجديدة تلقائيًا' }, { key: 'autoPostRestocks', label: 'نشر عودة المخزون تلقائيًا' }].map((item) => <label key={item.key} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm"><input type="checkbox" checked={Boolean(channel[item.key as keyof typeof channel])} onChange={(event) => setChannel({ ...channel, [item.key]: event.target.checked })} className="accent-emerald-500" />{item.label}</label>)}</div><div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-6 text-amber-100"><Megaphone className="mb-2 h-5 w-5" />قبل تفعيل الاشتراط أو النشر، أضف البوت مشرفًا في القناة. إذا كانت القناة خاصة استخدم رقم القناة وأضف رابط الدعوة.</div><button disabled={isPending} className={`${primary} mt-4 w-full`}><Megaphone className="h-4 w-4" />حفظ إعدادات القناة</button></form>
    </div>
  </section>;
}
