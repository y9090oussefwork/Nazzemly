/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw, Send, Store } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { getPlatformSupportTickets, replyPlatformSupportTicket, setPlatformTicketStatus } from '@/app/actions/support-actions';

export default function AdminSupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    const result = await getPlatformSupportTickets();
    if (result.success) setTickets(result.tickets);
    else setNotice(result.error || 'تعذر تحميل التذاكر.');
    setLoading(false);
  };
  useEffect(() => {
    void getCurrentUser().then((user) => {
      if (!user || user.role !== 'super_admin') router.replace('/login');
      else void refresh();
    });
  }, [router]);

  const reply = (ticketId: string) => startTransition(async () => {
    const result = await replyPlatformSupportTicket({ ticketId, message: replies[ticketId] || '' });
    setNotice(result.success ? 'تم إرسال الرد إلى التاجر.' : result.error || 'تعذر إرسال الرد.');
    if (result.success) { setReplies((current) => ({ ...current, [ticketId]: '' })); await refresh(); }
  });
  const changeStatus = (ticketId: string, status: 'open' | 'in_progress' | 'answered' | 'closed') => startTransition(async () => {
    const result = await setPlatformTicketStatus({ ticketId, status });
    setNotice(result.success ? 'تم تحديث حالة التذكرة.' : result.error || 'تعذر التحديث.');
    if (result.success) await refresh();
  });

  const openCount = tickets.filter((ticket) => ticket.status !== 'closed').length;
  const awaitingCount = tickets.filter((ticket) => ticket.lastReplyBy === 'merchant' && ticket.status !== 'closed').length;

  return <main dir="rtl" className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 lg:px-10">
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/admin" className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-emerald-300"><ArrowRight className="h-4 w-4" />لوحة مالك المنصة</Link><p className="text-sm font-bold text-emerald-400">مركز خدمة التجار</p><h1 className="mt-2 text-3xl font-black">تذاكر الدعم الداخلية</h1></div><button onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold hover:bg-zinc-900"><RefreshCw className="h-4 w-4" />تحديث</button></header>
      {notice ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm">{notice}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><span className="text-sm text-zinc-500">كل التذاكر</span><b className="mt-2 block text-3xl">{tickets.length}</b></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><span className="text-sm text-zinc-500">مفتوحة</span><b className="mt-2 block text-3xl text-amber-300">{openCount}</b></div><div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><span className="text-sm text-zinc-500">تحتاج ردك</span><b className="mt-2 block text-3xl text-emerald-300">{awaitingCount}</b></div></div>
      {loading ? <div className="rounded-2xl border border-zinc-800 p-12 text-center text-zinc-500">جارٍ تحميل تذاكر التجار…</div> : <div className="space-y-4">{tickets.map((ticket) => <details key={ticket.id} open={ticket.lastReplyBy === 'merchant' && ticket.status !== 'closed'} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 open:border-emerald-500/30">
        <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{ticket.subject}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${ticket.lastReplyBy === 'merchant' && ticket.status !== 'closed' ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-800 text-zinc-400'}`}>{ticket.status}</span><span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">{ticket.priority}</span></div><p className="mt-2 flex items-center gap-2 text-sm text-zinc-400"><Store className="h-4 w-4" />{ticket.tenant.storeName} · بواسطة {ticket.createdBy.fullName || ticket.createdBy.username}</p></div><span className="text-xs text-zinc-500">آخر تحديث {new Date(ticket.lastReplyAt).toLocaleString('ar-EG')}</span></summary>
        <div className="border-t border-zinc-800 p-5"><div className="space-y-3">{ticket.messages.map((message: any) => <div key={message.id} className={`max-w-[90%] rounded-2xl p-4 text-sm leading-7 ${message.senderType === 'platform' ? 'ml-auto bg-emerald-500/10' : 'mr-auto bg-zinc-950'}`}><p className="mb-1 text-xs font-black text-zinc-500">{message.senderType === 'platform' ? 'فريق المنصة' : ticket.tenant.storeName} · {new Date(message.createdAt).toLocaleString('ar-EG')}</p>{message.message}</div>)}</div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]"><textarea rows={3} value={replies[ticket.id] || ''} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm outline-none focus:border-emerald-500" placeholder="اكتب ردك للتاجر…" /><button disabled={isPending || !(replies[ticket.id] || '').trim()} onClick={() => reply(ticket.id)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-zinc-950 disabled:opacity-50"><Send className="h-4 w-4" />إرسال الرد</button></div>
          <div className="mt-3 flex flex-wrap gap-2">{(['open', 'in_progress', 'answered', 'closed'] as const).map((status) => <button key={status} disabled={isPending || ticket.status === status} onClick={() => changeStatus(ticket.id, status)} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold disabled:border-emerald-500/30 disabled:text-emerald-300">{status === 'open' ? 'مفتوحة' : status === 'in_progress' ? 'قيد العمل' : status === 'answered' ? 'تم الرد' : 'إغلاق التذكرة'}</button>)}</div>
        </div>
      </details>)}{!tickets.length ? <div className="rounded-2xl border border-dashed border-zinc-800 p-14 text-center text-zinc-500"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-400" />لا توجد تذاكر دعم حالياً.</div> : null}</div>}
    </section>
  </main>;
}
