/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import { FormEvent, Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { getCustomers } from '@/app/actions/merchant';
import { deleteDeal, deleteTask, getCRMWorkspace, saveDeal, saveTask } from '@/app/actions/crm';
import { createTeamMember, getTeamMembers } from '@/app/actions/team';
import { TEAM_PERMISSIONS } from '@/lib/team-permissions';
import { deleteBotAutomation, getBotControlCenter, queueBroadcast, rotateSmsWebhookSecret, saveBotAutomation, saveBotPaymentMenu } from '@/app/actions/bot-admin';

type Tab = 'crm' | 'team' | 'bot';

function OperationsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('crm');

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab && ['crm', 'team', 'bot'].includes(requestedTab)) setTab(requestedTab as Tab);
  }, [searchParams]);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [crm, setCrm] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bot, setBot] = useState<any>(null);
  const [task, setTask] = useState({ title: '', dueAt: '', priority: 'normal' });
  const [deal, setDeal] = useState({ customerId: '', title: '', value: '', stage: 'new' });
  const [member, setMember] = useState({ username: '', password: '', fullName: '', role: 'user', permissions: ['dashboard'] });
  const [automation, setAutomation] = useState({ name: '', trigger: 'command', triggerValue: '', message: '' });
  const [broadcast, setBroadcast] = useState({ name: '', message: '', stage: '', tag: '', scheduledAt: '' });
  const [paymentMenu, setPaymentMenu] = useState({ vodafoneNumber: '', instapayAddress: '', rechargeAmounts: '50,100,200,500' });
  const [smsSenders, setSmsSenders] = useState('');
  const [smsSecret, setSmsSecret] = useState('');
  const [smsWebhookUrl, setSmsWebhookUrl] = useState('');

  const refresh = async () => {
    setLoading(true);
    const results = await Promise.all([getCurrentUser(), getCRMWorkspace(), getTeamMembers(), getCustomers(), getBotControlCenter()]);
    if (!results[0]) {
      router.replace('/login');
      return;
    }
    if (results[1].success) setCrm(results[1]);
    if (results[2].success) setMembers(results[2].members);
    if (results[3].success) setCustomers(results[3].customers);
    if (results[4].success) setBot(results[4]);
    const failed = results.slice(1).find((item: any) => !item.success) as any;
    if (failed?.error) setNotice(failed.error);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const submit = (event: FormEvent, action: () => Promise<any>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await action();
      setNotice(result.success ? 'تم الحفظ بنجاح.' : result.error || 'تعذر إتمام العملية.');
      if (result.success) await refresh();
    });
  };

  const togglePermission = (permission: string) => {
    setMember((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  return (
    <section dir="rtl" className="mx-auto max-w-7xl">
      <div>
        <header className="mb-8 flex flex-col gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div><p className="text-sm text-emerald-400">مركز التشغيل</p><h1 className="text-3xl font-black">العملاء والفريق وأتمتة البوت</h1></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void refresh()} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold hover:bg-zinc-700">تحديث</button>
          </div>
        </header>
        {notice && <p className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">{notice}</p>}
        {loading && <div className="rounded-2xl bg-zinc-900 p-10 text-center">جارٍ التحميل…</div>}

        {!loading && tab === 'crm' && <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2">
            <h2 className="mb-4 text-xl font-black">لوحة الصفقات</h2>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(crm?.dealTotals || {}).map(([stage, value]) => <div key={stage} className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">{stage}</p><p className="mt-1 text-lg font-black">{Number(value).toLocaleString()} EGP</p></div>)}
            </div>
            <div className="space-y-3">
              {(crm?.deals || []).map((item: any) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 p-4"><div><p className="font-bold">{item.title}</p><p className="text-sm text-zinc-400">{item.customer?.name} · {item.stage} · {item.value} EGP</p></div><button onClick={() => void deleteDeal(item.id).then(refresh)} className="text-sm text-red-400">حذف</button></article>)}
              {!crm?.deals?.length && <p className="text-zinc-500">لا توجد صفقات بعد.</p>}
            </div>
          </div>
          <form onSubmit={(event) => submit(event, async () => {
            const result = await saveDeal({ ...deal, value: Number(deal.value) });
            if (result.success) setDeal({ customerId: '', title: '', value: '', stage: 'new' });
            return result;
          })} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-4 text-lg font-black">صفقة جديدة</h2>
            <select required value={deal.customerId} onChange={(e) => setDeal({ ...deal, customerId: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm"><option value="">اختر العميل</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone}</option>)}</select>
            <input required value={deal.title} onChange={(e) => setDeal({ ...deal, title: e.target.value })} placeholder="اسم الصفقة" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input required min="0" type="number" value={deal.value} onChange={(e) => setDeal({ ...deal, value: e.target.value })} placeholder="القيمة" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <select value={deal.stage} onChange={(e) => setDeal({ ...deal, stage: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm">{['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((stage) => <option key={stage}>{stage}</option>)}</select>
            <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">حفظ الصفقة</button>
          </form>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2">
            <h2 className="mb-4 text-xl font-black">مهام الفريق</h2>
            <div className="space-y-3">{(crm?.tasks || []).map((item: any) => <article key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-800 p-4"><div><p className="font-bold">{item.title}</p><p className="text-sm text-zinc-400">{item.status} · {item.priority}</p></div><button onClick={() => void deleteTask(item.id).then(refresh)} className="text-sm text-red-400">حذف</button></article>)}</div>
          </div>
          <form onSubmit={(event) => submit(event, async () => {
            const result = await saveTask(task);
            if (result.success) setTask({ title: '', dueAt: '', priority: 'normal' });
            return result;
          })} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-4 text-lg font-black">مهمة جديدة</h2>
            <input required value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="عنوان المهمة" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input type="date" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm">{['low', 'normal', 'high', 'urgent'].map((value) => <option key={value}>{value}</option>)}</select>
            <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">إضافة المهمة</button>
          </form>
        </section>}

        {!loading && tab === 'team' && <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2"><h2 className="mb-4 text-xl font-black">أعضاء الفريق</h2><div className="space-y-3">{members.map((item) => <article key={item.id} className="rounded-xl border border-zinc-800 p-4"><div className="flex items-center justify-between"><div><p className="font-bold">{item.fullName || item.username}</p><p className="text-sm text-zinc-400">@{item.username} · {item.role} · {item.isActive ? 'نشط' : 'معطل'}</p></div><span className="text-xs text-zinc-500">{item._count.assignedCustomers} عملاء · {item._count.assignedTasks} مهام</span></div><p className="mt-2 text-xs text-zinc-500">{item.permissions.join('، ') || 'لا توجد صلاحيات'}</p></article>)}</div></div>
          <form onSubmit={(event) => submit(event, async () => {
            const result = await createTeamMember(member);
            if (result.success) setMember({ username: '', password: '', fullName: '', role: 'user', permissions: ['dashboard'] });
            return result;
          })} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="mb-4 text-lg font-black">إضافة عضو</h2>
            <input required value={member.fullName} onChange={(e) => setMember({ ...member, fullName: e.target.value })} placeholder="الاسم الكامل" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input required value={member.username} onChange={(e) => setMember({ ...member, username: e.target.value })} placeholder="اسم المستخدم بالإنجليزية" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <input required minLength={10} type="password" value={member.password} onChange={(e) => setMember({ ...member, password: e.target.value })} placeholder="كلمة مرور قوية" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
            <select value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm"><option value="sales">مبيعات</option><option value="support">دعم</option><option value="user">موظف مخصص</option><option value="manager">مدير فريق</option></select>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs">{TEAM_PERMISSIONS.map((permission) => <label key={permission} className="flex items-center gap-1"><input type="checkbox" checked={member.permissions.includes(permission)} onChange={() => togglePermission(permission)} />{permission}</label>)}</div>
            <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">إنشاء الحساب</button>
          </form>
        </section>}

        {!loading && tab === 'bot' && <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-2">
            <h2 className="mb-4 text-xl font-black">حالة البوت والحملات</h2>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"><div className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">الحالة</p><p className="font-bold">{bot?.settings?.connectionStatus || 'غير مهيأ'}</p></div><div className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">عملاء مربوطون</p><p className="font-bold">{bot?.metrics?.linkedCustomers || 0}</p></div><div className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">تم التسليم</p><p className="font-bold">{bot?.metrics?.delivered || 0}</p></div><div className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">أحداث فاشلة</p><p className="font-bold">{bot?.metrics?.failedEvents || 0}</p></div></div>
            <h3 className="mb-3 font-bold">الأتمتة الحالية</h3><div className="space-y-3">{(bot?.automations || []).map((item: any) => <article key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-800 p-3"><div><p className="font-bold">{item.name}</p><p className="text-xs text-zinc-400">{item.trigger} · {item.isActive ? 'نشطة' : 'معطلة'}</p></div><button onClick={() => void deleteBotAutomation(item.id).then(refresh)} className="text-sm text-red-400">حذف</button></article>)}</div>
            <h3 className="mb-3 mt-6 font-bold">الحملات</h3><div className="space-y-2">{(bot?.broadcasts || []).map((item: any) => <p key={item.id} className="rounded-xl bg-zinc-950 p-3 text-sm">{item.name} — {item.status} — تم {item.delivered} / فشل {item.failed}</p>)}</div>
          </div>
          <div className="space-y-6">
            <form onSubmit={(event) => submit(event, async () => {
              const result = await saveBotAutomation(automation);
              if (result.success) setAutomation({ name: '', trigger: 'command', triggerValue: '', message: '' });
              return result;
            })} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-lg font-black">رد آلي جديد</h2>
              <input required value={automation.name} onChange={(e) => setAutomation({ ...automation, name: e.target.value })} placeholder="اسم الأتمتة" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <select value={automation.trigger} onChange={(e) => setAutomation({ ...automation, trigger: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm">{(bot?.triggerOptions || ['command', 'keyword']).map((value: string) => <option key={value}>{value}</option>)}</select>
              <input value={automation.triggerValue} onChange={(e) => setAutomation({ ...automation, triggerValue: e.target.value })} placeholder="/price أو كلمة مفتاحية" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <textarea required value={automation.message} onChange={(e) => setAutomation({ ...automation, message: e.target.value })} placeholder="الرسالة التي سيرسلها البوت" className="mb-3 min-h-28 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">حفظ الرد</button>
            </form>
            <form onSubmit={(event) => submit(event, async () => {
              const result = await saveBotPaymentMenu(paymentMenu);
              return result;
            })} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-lg font-black">وسائل دفع البوت</h2>
              <input value={paymentMenu.vodafoneNumber} onChange={(e) => setPaymentMenu({ ...paymentMenu, vodafoneNumber: e.target.value })} placeholder="رقم فودافون كاش" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <input value={paymentMenu.instapayAddress} onChange={(e) => setPaymentMenu({ ...paymentMenu, instapayAddress: e.target.value })} placeholder="عنوان InstaPay" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <input value={paymentMenu.rechargeAmounts} onChange={(e) => setPaymentMenu({ ...paymentMenu, rechargeAmounts: e.target.value })} placeholder="50,100,200,500" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">حفظ وسائل الدفع</button>
            </form>
            <form onSubmit={(event) => submit(event, async () => {
              const result = await rotateSmsWebhookSecret(smsSenders.split(',').map((item) => item.trim()).filter(Boolean));
              if (result.success) { setSmsSecret(result.secret || ''); setSmsWebhookUrl(result.webhookUrl || ''); }
              return result;
            })} className="rounded-2xl border border-amber-500/30 bg-zinc-900/60 p-5">
              <h2 className="mb-2 text-lg font-black">ربط رسائل الدفع</h2>
              <p className="mb-3 text-xs text-zinc-400">أدخل أسماء المرسلين المسموح بها، مفصولة بفاصلة. سيظهر السر مرة واحدة.</p>
              <input value={smsSenders} onChange={(e) => setSmsSenders(e.target.value)} placeholder="Vodafone, NBE" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <button disabled={isPending} className="w-full rounded-xl bg-amber-600 p-3 text-sm font-bold">إنشاء سر الربط</button>
              {smsSecret && <div className="mt-3 space-y-2 text-xs"><p className="break-all rounded-lg bg-zinc-950 p-3 text-amber-300">السر: {smsSecret}</p><p className="break-all rounded-lg bg-zinc-950 p-3 text-emerald-300">الرابط: {smsWebhookUrl}</p></div>}
            </form>
            <form onSubmit={(event) => submit(event, async () => {
              const result = await queueBroadcast(broadcast);
              if (result.success) setBroadcast({ name: '', message: '', stage: '', tag: '', scheduledAt: '' });
              return result;
            })} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 text-lg font-black">حملة رسائل</h2>
              <input required value={broadcast.name} onChange={(e) => setBroadcast({ ...broadcast, name: e.target.value })} placeholder="اسم الحملة" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <textarea required value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} placeholder="نص الرسالة" className="mb-3 min-h-24 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <input value={broadcast.stage} onChange={(e) => setBroadcast({ ...broadcast, stage: e.target.value })} placeholder="مرحلة العميل (اختياري)" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <input value={broadcast.tag} onChange={(e) => setBroadcast({ ...broadcast, tag: e.target.value })} placeholder="وسم العميل (اختياري)" className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <input type="datetime-local" value={broadcast.scheduledAt} onChange={(e) => setBroadcast({ ...broadcast, scheduledAt: e.target.value })} className="mb-3 w-full rounded-xl bg-zinc-950 p-3 text-sm" />
              <button disabled={isPending} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold">جدولة الحملة</button>
            </form>
          </div>
        </section>}
      </div>
    </section>
  );
}

export default function OperationsPage() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl animate-pulse space-y-5"><div className="h-16 rounded-2xl bg-zinc-900" /><div className="h-80 rounded-2xl bg-zinc-900" /></div>}><OperationsWorkspace /></Suspense>;
}