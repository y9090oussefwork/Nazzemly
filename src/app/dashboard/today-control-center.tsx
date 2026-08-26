'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { BellRing, CheckCheck, ChevronLeft, ClipboardCheck, Inbox, RefreshCw } from 'lucide-react';
import { getNotifications, getOperationsCenter, markNotificationsRead } from '@/app/actions/operations-center';

type AttentionItem = { key: string; count: number; label: string; href: string; tone: string };
type NotificationItem = { id: string; type: string; title: string; body: string | null; href: string | null; readAt: string | Date | null; createdAt: string | Date };

const toneClass: Record<string, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200',
  violet: 'border-violet-500/30 bg-violet-500/5 text-violet-200',
  amber: 'border-amber-500/30 bg-amber-500/5 text-amber-100',
  rose: 'border-rose-500/30 bg-rose-500/5 text-rose-100',
  orange: 'border-orange-500/30 bg-orange-500/5 text-orange-100',
};

function timeLabel(value: string | Date) {
  const date = new Date(value);
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return date.toLocaleDateString('ar-EG');
}

export default function TodayControlCenter() {
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    setLoading(true);
    const [operations, notificationResult] = await Promise.all([getOperationsCenter(), getNotifications()]);
    if (operations.success) setAttention(operations.attention as AttentionItem[]);
    if (notificationResult.success) setNotifications(notificationResult.notifications as NotificationItem[]);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);
  const unread = notifications.filter((item) => !item.readAt);

  const markAllRead = () => startTransition(async () => {
    const result = await markNotificationsRead(unread.map((item) => item.id));
    if (result.success) setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt || new Date() })));
  });

  if (loading) return <section className="grid animate-pulse gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]"><div className="h-72 rounded-2xl border border-zinc-800 bg-zinc-900/50" /><div className="h-72 rounded-2xl border border-zinc-800 bg-zinc-900/50" /></section>;

  return <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]" dir="rtl">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
        <div><h2 className="text-lg font-black text-white">خطة اليوم</h2><p className="mt-1 text-sm text-zinc-400">ابدأ بالأمور التي تحتاج قرارًا أو متابعة الآن.</p></div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><RefreshCw className="h-4 w-4" />تحديث</button>
      </div>
      {attention.length ? <div className="mt-4 divide-y divide-zinc-800">{attention.map((item) => <Link key={item.key} href={item.href} className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-400"><span className={`grid h-10 min-w-10 place-items-center rounded-xl border text-lg font-black ${toneClass[item.tone] || toneClass.emerald}`}>{item.count}</span><span className="min-w-0 flex-1"><b className="block text-sm text-zinc-100 transition-colors group-hover:text-emerald-200">{item.label}</b><small className="mt-1 block text-xs text-zinc-500">فتح القسم واتخاذ الإجراء المناسب</small></span><ChevronLeft className="h-5 w-5 text-zinc-600 transition-transform group-hover:-translate-x-0.5 group-hover:text-zinc-200" /></Link>)}</div> : <div className="grid min-h-44 place-items-center text-center"><div><ClipboardCheck className="mx-auto h-8 w-8 text-emerald-300" /><p className="mt-3 font-black text-zinc-100">لا توجد إجراءات عاجلة الآن</p><p className="mt-1 text-sm text-zinc-500">طلباتك وتجديداتك ومخزونك تحت السيطرة.</p></div></div>}
    </section>

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4"><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-emerald-300" /><div><h2 className="font-black text-white">الإشعارات</h2><p className="mt-1 text-xs text-zinc-500">{unread.length ? `${unread.length} غير مقروءة` : 'تمت المراجعة'}</p></div></div>{unread.length ? <button disabled={isPending} type="button" onClick={markAllRead} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"><CheckCheck className="h-4 w-4" />تمت المراجعة</button> : null}</div>
      {notifications.length ? <div className="mt-3 divide-y divide-zinc-800">{notifications.slice(0, 5).map((item) => { const content = <><p className={`text-sm font-bold ${item.readAt ? 'text-zinc-300' : 'text-white'}`}>{item.title}</p>{item.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.body}</p> : null}<p className="mt-1.5 text-[11px] font-bold text-zinc-600">{timeLabel(item.createdAt)}</p></>; return item.href ? <Link key={item.id} href={item.href} className="block py-3 outline-none transition-colors hover:text-emerald-200 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-400">{content}</Link> : <article key={item.id} className="py-3">{content}</article>; })}</div> : <div className="grid min-h-44 place-items-center text-center"><div><Inbox className="mx-auto h-7 w-7 text-zinc-500" /><p className="mt-3 text-sm font-bold text-zinc-300">لا توجد إشعارات جديدة</p></div></div>}
    </section>
  </section>;
}
