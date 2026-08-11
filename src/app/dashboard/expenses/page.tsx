/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import {
  CalendarClock, Pencil, PauseCircle, PlayCircle, Plus, ReceiptText, Repeat2, Trash2, WalletCards, X,
} from 'lucide-react';
import { addExpense, deleteExpense } from '@/app/actions/merchant';
import {
  getExpenseWorkspace, saveRecurringExpense, setRecurringExpenseActive, updateExpense,
} from '@/app/actions/expense-schedules';

type Modal = 'expense' | 'recurring' | null;

const today = () => new Date().toISOString().slice(0, 10);
const emptyExpense = () => ({ id: '', category: '', amount: '', date: today(), notes: '' });
const emptyRecurring = () => ({
  id: '', category: '', amount: '', frequency: 'monthly', interval: '1',
  startDate: today(), nextRunAt: today(), endDate: '', notes: '', isActive: true,
});
const frequencyLabels: Record<string, string> = {
  daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي',
};

export default function ExpensesPage() {
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<any>({ expenses: [], schedules: [], currency: 'EGP' });
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [recurringForm, setRecurringForm] = useState(emptyRecurring);
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    setLoading(true);
    const result = await getExpenseWorkspace();
    if (result.success) {
      setWorkspace(result);
      if (result.generated > 0) setNotice(`تم تسجيل ${result.generated} مصروف مستحق تلقائيًا.`);
    } else setNotice(result.error || 'تعذر تحميل المصروفات.');
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const activeSchedules = useMemo(
    () => (workspace.schedules || []).filter((item: any) => item.isActive),
    [workspace.schedules],
  );
  const formatMoney = (value: number) => `${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${workspace.currency || 'EGP'}`;
  const formatDate = (value: string) => new Date(value).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });

  const openExpense = (item?: any) => {
    setExpenseForm(item ? {
      id: item.id,
      category: item.category,
      amount: String(item.amount),
      date: String(item.date).slice(0, 10),
      notes: item.notes || '',
    } : emptyExpense());
    setModal('expense');
  };

  const openRecurring = (item?: any) => {
    setRecurringForm(item ? {
      id: item.id,
      category: item.category,
      amount: String(item.amount),
      frequency: item.frequency,
      interval: String(item.interval),
      startDate: String(item.startDate).slice(0, 10),
      nextRunAt: String(item.nextRunAt).slice(0, 10),
      endDate: item.endDate ? String(item.endDate).slice(0, 10) : '',
      notes: item.notes || '',
      isActive: item.isActive,
    } : emptyRecurring());
    setModal('recurring');
  };

  const submitExpense = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const payload = { category: expenseForm.category, amount: Number(expenseForm.amount), date: expenseForm.date, notes: expenseForm.notes };
      const result = expenseForm.id
        ? await updateExpense({ id: expenseForm.id, ...payload })
        : await addExpense(payload);
      setNotice(result.success ? (expenseForm.id ? 'تم تعديل المصروف.' : 'تم تسجيل المصروف.') : result.error || 'تعذر حفظ المصروف.');
      if (result.success) {
        setModal(null);
        await refresh();
      }
    });
  };

  const submitRecurring = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveRecurringExpense({
        id: recurringForm.id || undefined,
        category: recurringForm.category,
        amount: Number(recurringForm.amount),
        frequency: recurringForm.frequency,
        interval: Number(recurringForm.interval),
        startDate: recurringForm.startDate,
        nextRunAt: recurringForm.nextRunAt,
        endDate: recurringForm.endDate || undefined,
        notes: recurringForm.notes,
        isActive: recurringForm.isActive,
      });
      setNotice(result.success ? (recurringForm.id ? 'تم تعديل المصروف المتكرر.' : 'تم إنشاء المصروف المتكرر.') : result.error || 'تعذر حفظ الجدول.');
      if (result.success) {
        setModal(null);
        await refresh();
      }
    });
  };

  const toggleSchedule = (item: any) => {
    startTransition(async () => {
      const result = await setRecurringExpenseActive({ id: item.id, isActive: !item.isActive });
      setNotice(result.success ? (item.isActive ? 'تم إيقاف المصروف المتكرر.' : 'تم استئناف المصروف المتكرر.') : result.error || 'تعذر تحديث الجدول.');
      if (result.success) await refresh();
    });
  };

  const removeExpense = (item: any) => {
    if (!confirm(`هل تريد حذف مصروف "${item.category}"؟`)) return;
    startTransition(async () => {
      const result = await deleteExpense(item.id);
      setNotice(result.success ? 'تم حذف المصروف.' : result.error || 'تعذر حذف المصروف.');
      if (result.success) await refresh();
    });
  };

  if (loading) return <div className="mx-auto max-w-7xl animate-pulse space-y-5" dir="rtl"><div className="h-24 rounded-2xl bg-zinc-900" /><div className="h-80 rounded-2xl bg-zinc-900" /></div>;

  return (
    <section className="mx-auto max-w-7xl space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-black text-zinc-100">المصروفات</h1><p className="mt-1 text-sm leading-6 text-zinc-500">سجّل المصروف مرة واحدة أو أنشئ جدولًا يتكرر تلقائيًا ويمكن إيقافه وتعديله في أي وقت.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => openRecurring()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-2.5 text-sm font-bold text-emerald-300 transition-colors hover:bg-emerald-500/10 active:scale-[0.98]"><Repeat2 className="h-4 w-4" />مصروف متكرر</button><button onClick={() => openExpense()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-zinc-950 active:scale-[0.98]"><Plus className="h-4 w-4" />مصروف جديد</button></div>
      </div>

      {notice ? <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="إغلاق الرسالة"><X className="h-4 w-4" /></button></div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={WalletCards} label="مصروفات الشهر" value={formatMoney(workspace.currentMonthTotal)} />
        <Metric icon={CalendarClock} label="التزام شهري تقديري" value={formatMoney(workspace.activeMonthlyCommitment)} emphasis />
        <Metric icon={Repeat2} label="جداول نشطة" value={String(activeSchedules.length)} />
        <Metric icon={ReceiptText} label="إجمالي السجلات" value={String(workspace.expenses.length)} />
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">المصروفات المتكررة</h2><p className="mt-1 text-sm text-zinc-500">رواتب، اشتراكات أدوات، إيجار وأي التزام دوري.</p></div><span className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs text-zinc-400">{workspace.schedules.length} جدول</span></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">{workspace.schedules.map((item: any) => <article key={item.id} className={`rounded-2xl border p-4 ${item.isActive ? 'border-zinc-800 bg-zinc-950/70' : 'border-zinc-800/60 bg-zinc-950/30 opacity-75'}`}><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-zinc-100">{item.category}</h3><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${item.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>{item.isActive ? 'نشط' : 'متوقف'}</span></div><p className="mt-2 text-sm text-zinc-400">{formatMoney(item.amount)} كل {item.interval > 1 ? `${item.interval} ` : ''}{frequencyLabels[item.frequency] || item.frequency}</p><p className="mt-1 text-xs text-zinc-500">الاستحقاق القادم: {formatDate(item.nextRunAt)} | تم تسجيل {item._count?.expenses || 0} مرة</p></div><p className="text-sm font-black text-amber-300">{formatMoney(item.monthlyEstimate)}<span className="mt-1 block text-[10px] font-normal text-zinc-500">تقدير شهري</span></p></div>{item.notes ? <p className="mt-3 rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-5 text-zinc-500">{item.notes}</p> : null}<div className="mt-4 flex gap-2"><button disabled={isPending} onClick={() => openRecurring(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800"><Pencil className="h-3.5 w-3.5" />تعديل</button><button disabled={isPending} onClick={() => toggleSchedule(item)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${item.isActive ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10' : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'}`}>{item.isActive ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}{item.isActive ? 'إيقاف' : 'استئناف'}</button></div></article>)}</div>
        {!workspace.schedules.length ? <Empty text="لا توجد مصروفات متكررة. أضف راتبًا أو اشتراكًا مرة واحدة وسيقوم النظام بالتسجيل تلقائيًا." action={() => openRecurring()} label="إضافة أول جدول" /> : null}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">سجل المصروفات</h2><p className="mt-1 text-sm text-zinc-500">يشمل الإدخالات اليدوية وما أنشأته الجداول تلقائيًا.</p></div><span className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs text-zinc-400">{workspace.expenses.length} مصروف</span></div>
        <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full min-w-[720px] text-right text-sm"><thead className="bg-zinc-950 text-xs text-zinc-500"><tr><th className="p-3">المصروف</th><th className="p-3">القيمة</th><th className="p-3">التاريخ</th><th className="p-3">النوع</th><th className="p-3">ملاحظات</th><th className="p-3">إجراءات</th></tr></thead><tbody>{workspace.expenses.map((item: any) => <tr key={item.id} className="border-t border-zinc-800/80"><td className="p-3 font-bold text-zinc-200">{item.category}</td><td className="p-3 font-black text-amber-300">{formatMoney(item.amount)}</td><td className="p-3 text-zinc-400">{formatDate(item.date)}</td><td className="p-3"><span className={`rounded-md px-2 py-1 text-xs ${item.recurringExpenseId ? 'bg-sky-500/10 text-sky-300' : 'bg-zinc-800 text-zinc-400'}`}>{item.recurringExpenseId ? 'تلقائي' : 'يدوي'}</span></td><td className="max-w-72 truncate p-3 text-zinc-500">{item.notes || '-'}</td><td className="p-3"><div className="flex gap-1"><button onClick={() => openExpense(item)} aria-label="تعديل المصروف" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"><Pencil className="h-4 w-4" /></button><button onClick={() => removeExpense(item)} aria-label="حذف المصروف" className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>
        {!workspace.expenses.length ? <Empty text="لم تسجل أي مصروف حتى الآن." action={() => openExpense()} label="تسجيل مصروف" /> : null}
      </section>

      {modal ? <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-zinc-950/85 p-4"><form onSubmit={modal === 'expense' ? submitExpense : submitRecurring} className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{modal === 'expense' ? (expenseForm.id ? 'تعديل المصروف' : 'مصروف جديد') : (recurringForm.id ? 'تعديل المصروف المتكرر' : 'مصروف متكرر جديد')}</h2><p className="mt-1 text-sm text-zinc-500">{modal === 'expense' ? 'سجل عملية واحدة في يوم محدد.' : 'سيُضاف المصروف تلقائيًا عند كل موعد استحقاق.'}</p></div><button type="button" onClick={() => setModal(null)} aria-label="إغلاق"><X className="h-5 w-5 text-zinc-400" /></button></div>{modal === 'expense' ? <div className="mt-5 space-y-4"><Field label="اسم المصروف"><input required value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} className={inputClass} placeholder="مثال: شراء حسابات" /></Field><div className="grid grid-cols-2 gap-3"><Field label="القيمة"><input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} className={inputClass} /></Field><Field label="التاريخ"><input required type="date" value={expenseForm.date} onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })} className={inputClass} /></Field></div><Field label="ملاحظات (اختياري)"><textarea value={expenseForm.notes} onChange={(event) => setExpenseForm({ ...expenseForm, notes: event.target.value })} className={`${inputClass} min-h-24`} /></Field></div> : <div className="mt-5 space-y-4"><Field label="اسم المصروف"><input required value={recurringForm.category} onChange={(event) => setRecurringForm({ ...recurringForm, category: event.target.value })} className={inputClass} placeholder="مثال: رواتب الموظفين" /></Field><div className="grid grid-cols-2 gap-3"><Field label="القيمة في كل مرة"><input required type="number" min="0.01" step="0.01" value={recurringForm.amount} onChange={(event) => setRecurringForm({ ...recurringForm, amount: event.target.value })} className={inputClass} /></Field><Field label="التكرار"><select value={recurringForm.frequency} onChange={(event) => setRecurringForm({ ...recurringForm, frequency: event.target.value })} className={inputClass}><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option></select></Field></div><Field label="كل كم فترة؟"><input required type="number" min="1" max="365" value={recurringForm.interval} onChange={(event) => setRecurringForm({ ...recurringForm, interval: event.target.value })} className={inputClass} /><span className="mt-1 block text-xs text-zinc-500">مثال: كل 2 أسبوع يعني اختر أسبوعي واكتب 2.</span></Field><div className="grid grid-cols-2 gap-3"><Field label="تاريخ البداية"><input required type="date" value={recurringForm.startDate} onChange={(event) => setRecurringForm({ ...recurringForm, startDate: event.target.value })} className={inputClass} /></Field><Field label="الاستحقاق القادم"><input required type="date" value={recurringForm.nextRunAt} onChange={(event) => setRecurringForm({ ...recurringForm, nextRunAt: event.target.value })} className={inputClass} /></Field></div><Field label="تاريخ النهاية (اختياري)"><input type="date" value={recurringForm.endDate} onChange={(event) => setRecurringForm({ ...recurringForm, endDate: event.target.value })} className={inputClass} /></Field><Field label="ملاحظات (اختياري)"><textarea value={recurringForm.notes} onChange={(event) => setRecurringForm({ ...recurringForm, notes: event.target.value })} className={`${inputClass} min-h-20`} /></Field></div>}<button disabled={isPending} className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-50">{isPending ? 'جارٍ الحفظ...' : 'حفظ'}</button></form></div> : null}
    </section>
  );
}

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-400';
function Metric({ icon: Icon, label, value, emphasis = false }: { icon: any; label: string; value: string; emphasis?: boolean }) { return <article className={`rounded-2xl border p-4 ${emphasis ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900/40'}`}><div className="flex items-center gap-2 text-sm text-zinc-500"><Icon className="h-4 w-4" />{label}</div><p className={`mt-3 text-2xl font-black ${emphasis ? 'text-emerald-300' : 'text-zinc-100'}`}>{value}</p></article>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">{label}</span>{children}</label>; }
function Empty({ text, action, label }: { text: string; action: () => void; label: string }) { return <div className="mt-5 rounded-xl border border-dashed border-zinc-700 p-8 text-center"><p className="text-sm text-zinc-500">{text}</p><button onClick={action} className="mt-4 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800">{label}</button></div>; }
