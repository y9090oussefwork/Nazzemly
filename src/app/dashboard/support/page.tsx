/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import { CheckCircle2, Clock3, LifeBuoy, MessageSquareText, Plus, Send } from 'lucide-react';
import { createSupportTicket, getMySupportTickets, replySupportTicket } from '@/app/actions/support-actions';
import HelpTip from '@/app/dashboard/help-tip';

const inputClass = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm outline-none transition-colors duration-150 placeholder:text-zinc-600 focus:border-emerald-500/70';

export default function SupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ subject: '', category: 'general', priority: 'normal', message: '' });
  const [replies, setReplies] = useState<Record<string, string>>({});

  const refresh = async () => {
    const result = await getMySupportTickets();
    if (result.success) setTickets(result.tickets);
    else setNotice(result.error || 'تعذر تحميل الرسائل.');
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, []);

  const create = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createSupportTicket(form);
      setNotice(result.success ? 'وصلت رسالتك إلى مالك المنصة.' : result.error || 'تعذر إرسال الرسالة.');
      if (result.success) { setForm({ subject: '', category: 'general', priority: 'normal', message: '' }); await refresh(); }
    });
  };
  const reply = (ticketId: string) => startTransition(async () => {
    const result = await replySupportTicket({ ticketId, message: replies[ticketId] || '' });
    setNotice(result.success ? 'تم إرسال ردك.' : result.error || 'تعذر إرسال الرد.');
    if (result.success) { setReplies((current) => ({ ...current, [ticketId]: '' })); await refresh(); }
  });

  return <section dir="rtl" className="mx-auto max-w-6xl space-y-6">
    <header className="border-b border-zinc-800 pb-6"><p className="text-sm font-bold text-emerald-400">تواصل داخل المنصة</p><h1 className="mt-2 text-3xl font-black">الدعم والمساعدة</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">أرسل مشكلة أو اقتراحاً إلى مالك المنصة وتابع الرد هنا، من دون الاعتماد على محادثات خارجية.</p></header>
    {notice ? <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm"><span>{notice}</span><button onClick={() => setNotice('')} className="text-zinc-400">إغلاق</button></div> : null}
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={create} className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="mb-5 flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-400" /><h2 className="text-xl font-black">رسالة دعم جديدة</h2><HelpTip text="اكتب طلباً واحداً لكل مشكلة حتى يسهل متابعته وإغلاقه بعد الحل." /></div>
        <label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">عنوان مختصر</span><input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className={inputClass} placeholder="مثال: البوت لا يستقبل /start" /></label>
        <div className="mb-4 grid grid-cols-2 gap-3"><label><span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">القسم<HelpTip text="اختر الأقرب لمشكلتك لتصل إلى الشخص المناسب بسرعة." /></span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}><option value="general">عام</option><option value="technical">مشكلة تقنية</option><option value="billing">الحساب والفوترة</option><option value="bot">البوت</option><option value="suggestion">اقتراح ميزة</option></select></label><label><span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">الأولوية<HelpTip text="استخدم عاجل فقط إذا توقف عمل المتجر أو البوت بالكامل." /></span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className={inputClass}><option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">مرتفعة</option><option value="urgent">عاجلة</option></select></label></div>
        <label className="mb-4 block"><span className="mb-2 block text-xs font-bold text-zinc-400">التفاصيل</span><textarea required minLength={10} rows={7} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className={inputClass} placeholder="اشرح ما حدث، والخطوات التي قمت بها، والنتيجة التي كنت تتوقعها…" /></label>
        <button disabled={isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50"><Send className="h-4 w-4" />إرسال إلى مالك المنصة</button>
      </form>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-emerald-400" /><h2 className="text-xl font-black">رسائلك السابقة</h2></div>
        {loading ? <div className="rounded-2xl border border-zinc-800 p-10 text-center text-zinc-500">جارٍ تحميل المحادثات…</div> : tickets.map((ticket) => <details key={ticket.id} open={ticket.lastReplyBy === 'platform' && ticket.status !== 'closed'} className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 open:border-emerald-500/30">
          <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{ticket.subject}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${ticket.status === 'closed' ? 'bg-zinc-800 text-zinc-500' : ticket.lastReplyBy === 'platform' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{ticket.status === 'closed' ? 'مغلقة' : ticket.lastReplyBy === 'platform' ? 'لديك رد جديد' : 'بانتظار الرد'}</span></div><p className="mt-1 text-xs text-zinc-500">{new Date(ticket.createdAt).toLocaleString('ar-EG')} · {ticket.category} · {ticket.priority}</p></div>{ticket.status === 'closed' ? <CheckCircle2 className="h-5 w-5 text-zinc-500" /> : <Clock3 className="h-5 w-5 text-amber-300" />}</summary>
          <div className="border-t border-zinc-800 p-5"><div className="space-y-3">{ticket.messages.map((message: any) => <div key={message.id} className={`max-w-[90%] rounded-2xl p-4 text-sm leading-7 ${message.senderType === 'platform' ? 'mr-auto border border-emerald-500/20 bg-emerald-500/10' : 'ml-auto bg-zinc-950'}`}><p className="mb-1 text-xs font-black text-zinc-500">{message.senderType === 'platform' ? 'فريق المنصة' : 'أنت'} · {new Date(message.createdAt).toLocaleString('ar-EG')}</p>{message.message}</div>)}</div>
            {ticket.status !== 'closed' ? <div className="mt-4 flex gap-2"><textarea rows={2} value={replies[ticket.id] || ''} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} className={inputClass} placeholder="اكتب ردك…" /><button disabled={isPending || !(replies[ticket.id] || '').trim()} onClick={() => reply(ticket.id)} className="grid w-12 shrink-0 place-items-center rounded-xl bg-emerald-500 text-zinc-950 disabled:opacity-50" aria-label="إرسال الرد"><Send className="h-4 w-4" /></button></div> : null}
          </div>
        </details>)}
        {!loading && !tickets.length ? <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500"><MessageSquareText className="mx-auto mb-3 h-8 w-8" />لا توجد رسائل دعم بعد.</div> : null}
      </section>
    </div>
  </section>;
}
