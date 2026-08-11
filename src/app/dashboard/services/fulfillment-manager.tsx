/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import { useEffect, useState, useTransition } from 'react';
import { ChevronDown, Eye, KeyRound, PackagePlus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  addDeliveryUnits,
  getDeliveryInventory,
  revealDeliveryUnit,
  savePlanFulfillmentSettings,
  setDeliveryUnitStatus,
} from '@/app/actions/order-fulfillment';
import HelpTip from '@/app/dashboard/help-tip';

type RequiredField = { label: string; type: string; required: boolean };
type StatusTemplate = { key: string; label: string; message: string; final?: boolean };
type Inventory = Awaited<ReturnType<typeof getDeliveryInventory>>;

type PlanProps = {
  id: string;
  name: string;
  fulfillmentMode: string;
  requiredCustomerFields: unknown;
  statusTemplates: unknown;
  purchaseMessage: string | null;
  warrantyType: string;
  warrantyDays: number | null;
};

const inputClass =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/70';

const defaultStatuses: StatusTemplate[] = [
  { key: 'awaiting_contact', label: 'بانتظار تواصل الدعم', message: 'تم استلام طلبك بنجاح. سيتواصل معك فريق الدعم لإتمام التفعيل.' },
  { key: 'awaiting_customer_data', label: 'بانتظار بيانات العميل', message: 'تم استلام طلبك. أرسل البيانات المطلوبة لإكمال التفعيل.' },
  { key: 'activation_in_progress', label: 'جاري التفعيل', message: 'بدأ فريق الدعم تنفيذ طلبك، وسيصلك تحديث فور اكتمال التفعيل.' },
  { key: 'invitation_sent', label: 'تم إرسال الدعوة', message: 'تم إرسال دعوة التفعيل إلى بريدك الإلكتروني. برجاء قبول الدعوة.' },
  { key: 'fulfilled', label: 'تم التفعيل', message: 'تم تفعيل اشتراكك بنجاح.', final: true },
  { key: 'cancelled', label: '\u0645\u0644\u063a\u064a', message: '\u062a\u0645 \u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0637\u0644\u0628. \u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062f\u0639\u0645 \u0625\u0630\u0627 \u0643\u0646\u062a \u062a\u062d\u062a\u0627\u062c \u0625\u0644\u0649 \u0645\u0633\u0627\u0639\u062f\u0629.' },
];

function parseFields(value: unknown): RequiredField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      label: String(item.label || ''),
      type: String(item.type || 'text'),
      required: item.required !== false,
    }));
}

function parseStatuses(value: unknown): StatusTemplate[] {
  if (!Array.isArray(value) || !value.length) return defaultStatuses;
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      key: String(item.key || `custom_${index + 1}`),
      label: String(item.label || ''),
      message: String(item.message || ''),
      final: item.final === true,
    }));
}

function modeDescription(mode: string) {
  if (mode === 'auto_delivery') return 'يسحب النظام حسابًا أو رابطًا أو كودًا من المخزون ويسلمه فورًا بعد الدفع.';
  if (mode === 'customer_data') return 'يطلب البوت البيانات التي تحددها، ثم يظهر الطلب للفريق لإكمال التفعيل.';
  return 'يؤكد النظام استلام الطلب ويخبر العميل أن فريق الدعم سيتواصل معه.';
}

export default function FulfillmentManager({
  plan,
  refresh,
  setNotice,
}: {
  plan: PlanProps;
  refresh: () => Promise<void>;
  setNotice: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState(plan.fulfillmentMode || 'manual_contact');
  const [fields, setFields] = useState<RequiredField[]>(parseFields(plan.requiredCustomerFields));
  const [statuses, setStatuses] = useState<StatusTemplate[]>(parseStatuses(plan.statusTemplates));
  const [purchaseMessage, setPurchaseMessage] = useState(plan.purchaseMessage || '');
  const [warrantyType, setWarrantyType] = useState(plan.warrantyType || 'none');
  const [warrantyDays, setWarrantyDays] = useState(String(plan.warrantyDays || 10));
  const [inventory, setInventory] = useState<Inventory>([]);
  const [units, setUnits] = useState([{ label: '', kind: 'account', credentials: '', sharing: 'private', capacity: '1' }]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const loadInventory = async () => setInventory(await getDeliveryInventory(plan.id));
  useEffect(() => { if (mode === 'auto_delivery') void loadInventory(); }, [mode, plan.id]);

  const saveSettings = () => {
    startTransition(async () => {
      const result = await savePlanFulfillmentSettings({
        servicePlanId: plan.id,
        fulfillmentMode: mode,
        requiredCustomerFields: fields,
        statusTemplates: statuses,
        purchaseMessage,
        warrantyType,
        warrantyDays: warrantyType === 'fixed_days' ? Number(warrantyDays) : null,
      });
      setNotice(result.success ? 'تم حفظ طريقة التنفيذ والضمان ورسائل الحالات.' : result.error || 'تعذر حفظ إعدادات التنفيذ.');
      if (result.success) await refresh();
    });
  };

  const addInventory = () => {
    startTransition(async () => {
      const result = await addDeliveryUnits({
        servicePlanId: plan.id,
        units: units.map((unit) => ({
          label: unit.label,
          kind: unit.kind,
          credentials: unit.credentials,
          capacity: unit.sharing === 'private' ? 1 : Number(unit.capacity),
        })),
      });
      setNotice(result.success ? `تمت إضافة ${result.createdCount} وحدة بسعة ${result.addedCapacity} عملية بيع.` : result.error || 'تعذر إضافة المخزون.');
      if (result.success) {
        setUnits([{ label: '', kind: 'account', credentials: '', sharing: 'private', capacity: '1' }]);
        await Promise.all([loadInventory(), refresh()]);
      }
    });
  };

  const reveal = (id: string) => {
    startTransition(async () => {
      const result = await revealDeliveryUnit(id);
      if (result.success) setRevealed((current) => ({ ...current, [id]: result.credentials }));
      else setNotice(result.error || 'تعذر عرض بيانات التسليم.');
    });
  };

  const toggleUnit = (id: string, currentStatus: string) => {
    startTransition(async () => {
      const result = await setDeliveryUnitStatus({ id, status: currentStatus === 'available' ? 'disabled' : 'available' });
      setNotice(result.success ? 'تم تحديث حالة وحدة التسليم.' : result.error || 'تعذر تحديث الوحدة.');
      if (result.success) await Promise.all([loadInventory(), refresh()]);
    });
  };

  return (
    <details className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-black text-emerald-300">
        <span className="flex items-center gap-2"><PackagePlus className="h-4 w-4" />طريقة التنفيذ والتسليم والضمان</span>
        <ChevronDown className="h-4 w-4" />
      </summary>
      <div className="space-y-5 border-t border-emerald-500/15 p-4">
        <section>
          <h5 className="mb-3 flex items-center gap-1 font-black">كيف يحصل العميل على الاشتراك؟ <HelpTip text="يمكن أن يتواصل الدعم مع العميل، أو يطلب البوت بيانات منه، أو يسلمه حسابًا أو رابطًا أو كودًا تلقائيًا." /></h5>
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              ['manual_contact', 'تواصل وتفعيل يدوي'],
              ['customer_data', 'طلب بيانات ثم التفعيل'],
              ['auto_delivery', 'تسليم تلقائي من المخزون'],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-xl border p-4 text-right transition-colors ${mode === value ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'}`}>
                <b className="block text-sm">{label}</b><small className="mt-2 block leading-6">{modeDescription(value)}</small>
              </button>
            ))}
          </div>
        </section>

        <label className="block">
          <span className="mb-2 flex items-center gap-1 text-xs font-black text-zinc-400">رسالة ما بعد الشراء <HelpTip text="رسالة اختيارية تظهر بعد نجاح الدفع. إذا تركتها فارغة يستخدم النظام الرسالة المناسبة لطريقة التنفيذ." /></span>
          <textarea rows={3} value={purchaseMessage} onChange={(event) => setPurchaseMessage(event.target.value)} className={inputClass} placeholder="تم استلام طلبك، وسنتابع معك حتى اكتمال التفعيل." />
        </label>

        {mode === 'customer_data' ? (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="mb-3 flex items-center justify-between"><h5 className="font-black">البيانات المطلوبة من العميل</h5><button type="button" onClick={() => setFields([...fields, { label: '', type: 'text', required: true }])} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold"><Plus className="h-3.5 w-3.5" />إضافة بيان</button></div>
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_11rem_auto_auto]">
                  <input value={field.label} onChange={(event) => setFields(fields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className={inputClass} placeholder="مثال: البريد الإلكتروني" />
                  <select value={field.type} onChange={(event) => setFields(fields.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} className={inputClass}><option value="text">نص</option><option value="email">بريد إلكتروني</option><option value="phone">رقم هاتف</option><option value="password">كلمة مرور</option></select>
                  <label className="flex items-center gap-2 rounded-xl border border-zinc-800 px-3 text-xs"><input type="checkbox" checked={field.required} onChange={(event) => setFields(fields.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} className="accent-emerald-500" />مطلوب</label>
                  <button type="button" onClick={() => setFields(fields.filter((_, itemIndex) => itemIndex !== index))} className="grid h-11 w-11 place-items-center rounded-xl text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {!fields.length ? <p className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-sm text-zinc-500">أضف البريد أو الهاتف أو أي بيانات يحتاجها التفعيل.</p> : null}
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <h5 className="mb-3 flex items-center gap-1 font-black">رسائل مراحل التنفيذ <HelpTip text="عند تغيير حالة الطلب تُملأ رسالة العميل تلقائيًا. يمكنك تعديلها قبل الإرسال في صفحة الطلبات." /></h5>
          <button type="button" onClick={() => setStatuses([...statuses, { key: `custom_${Date.now()}`, label: '\u062d\u0627\u0644\u0629 \u062c\u062f\u064a\u062f\u0629', message: '\u0627\u0643\u062a\u0628 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062a\u064a \u062a\u0635\u0644 \u0644\u0644\u0639\u0645\u064a\u0644.' }])} className="mb-3 inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/60"><Plus className="h-3.5 w-3.5" />{'\u0625\u0636\u0627\u0641\u0629 \u062d\u0627\u0644\u0629 \u0645\u062e\u0635\u0635\u0629'}</button>
          <div className="space-y-3">
            {statuses.map((status, index) => (
              <div key={`${status.key}-${index}`} className="grid gap-2 lg:grid-cols-[13rem_1fr_auto_auto]">
                <input value={status.label} onChange={(event) => setStatuses(statuses.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className={inputClass} />
                <input value={status.message} onChange={(event) => setStatuses(statuses.map((item, itemIndex) => itemIndex === index ? { ...item, message: event.target.value } : item))} className={inputClass} />
                <label className="flex items-center gap-2 rounded-xl border border-zinc-800 px-3 text-xs"><input type="checkbox" checked={status.final === true} onChange={(event) => setStatuses(statuses.map((item, itemIndex) => itemIndex === index ? { ...item, final: event.target.checked } : item))} className="accent-emerald-500" />نهائية</label>
                <button type="button" onClick={() => setStatuses(statuses.filter((_, itemIndex) => itemIndex !== index))} title={'\u062d\u0630\u0641 \u0627\u0644\u062d\u0627\u0644\u0629'} className="grid h-11 w-11 place-items-center rounded-xl text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <h5 className="mb-3 flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4 text-emerald-300" />الضمان</h5>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={warrantyType} onChange={(event) => setWarrantyType(event.target.value)} className={inputClass}><option value="none">بدون ضمان</option><option value="fixed_days">ضمان لمدة أحددها</option><option value="subscription_duration">طوال مدة الاشتراك</option></select>
            {warrantyType === 'fixed_days' ? <input type="number" min="1" max="3650" value={warrantyDays} onChange={(event) => setWarrantyDays(event.target.value)} className={inputClass} placeholder="عدد أيام الضمان" /> : <div className="rounded-xl border border-zinc-800 px-3.5 py-3 text-sm text-zinc-500">يبدأ الضمان من لحظة التفعيل.</div>}
          </div>
        </section>

        <button type="button" disabled={isPending} onClick={saveSettings} className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">حفظ طريقة التنفيذ والرسائل والضمان</button>

        {mode === 'auto_delivery' ? (
          <section className="space-y-4 border-t border-zinc-800 pt-5">
            <div><h5 className="flex items-center gap-2 font-black"><KeyRound className="h-4 w-4 text-amber-300" />مخزون الحسابات والروابط والأكواد</h5><p className="mt-1 text-xs leading-6 text-zinc-500">اختر “خاص” للبيع مرة واحدة، أو “مشترك” وحدد عدد العملاء المسموح لهم باستلام نفس الوحدة.</p></div>
            <div className="space-y-3">
              {units.map((unit, index) => (
                <div key={index} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <input value={unit.label} onChange={(event) => setUnits(units.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className={inputClass} placeholder="اسم داخلي اختياري" />
                    <select value={unit.kind} onChange={(event) => setUnits(units.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value } : item))} className={inputClass}><option value="account">حساب</option><option value="link">رابط</option><option value="code">كود</option><option value="custom">بيانات أخرى</option></select>
                    <select value={unit.sharing} onChange={(event) => setUnits(units.map((item, itemIndex) => itemIndex === index ? { ...item, sharing: event.target.value, capacity: event.target.value === 'private' ? '1' : item.capacity } : item))} className={inputClass}><option value="private">خاص لعميل واحد</option><option value="shared">مشترك لأكثر من عميل</option></select>
                    {unit.sharing === 'shared' ? <input type="number" min="2" value={unit.capacity} onChange={(event) => setUnits(units.map((item, itemIndex) => itemIndex === index ? { ...item, capacity: event.target.value } : item))} className={inputClass} placeholder="عدد العملاء" /> : <div className="rounded-xl border border-zinc-800 px-3 py-3 text-sm text-zinc-500">السعة: عملية بيع واحدة</div>}
                  </div>
                  <textarea rows={4} value={unit.credentials} onChange={(event) => setUnits(units.map((item, itemIndex) => itemIndex === index ? { ...item, credentials: event.target.value } : item))} className={inputClass} placeholder={'البريد: example@email.com\nكلمة المرور: ********\nرابط الدخول: https://...\nكود المصادقة أو ملاحظات التسليم'} />
                </div>
              ))}
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setUnits([...units, { label: '', kind: 'account', credentials: '', sharing: 'private', capacity: '1' }])} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold"><Plus className="h-4 w-4" />إضافة وحدة أخرى</button><button type="button" disabled={isPending} onClick={addInventory} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-zinc-950"><PackagePlus className="h-4 w-4" />حفظ وحدات المخزون</button></div>
            </div>

            <div className="space-y-3">
              {inventory.map((item) => (
                <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div><b>{item.label || item.credentialHint || 'وحدة تسليم'}</b><p className="mt-1 text-xs text-zinc-500">{item.kind}، تم بيعها {item.deliveredCount} من {item.capacity}، المتبقي {item.remaining}</p></div>
                    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => reveal(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold"><Eye className="h-3.5 w-3.5" />عرض</button><button type="button" onClick={() => toggleUnit(item.id, item.status)} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.status === 'available' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{item.status === 'available' ? 'إيقاف' : 'إعادة التفعيل'}</button></div>
                  </div>
                  {revealed[item.id] ? <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-3 text-xs text-zinc-200">{revealed[item.id]}</pre> : null}
                  {item.allocations.length ? <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-zinc-400">عرض العملاء الذين استلموها</summary><div className="mt-2 space-y-2">{item.allocations.map((allocation) => <div key={allocation.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs"><span>{allocation.customer.name}، {allocation.customer.phone}</span><span>{allocation.order.orderNo}، {new Date(allocation.deliveredAt).toLocaleString('ar-EG')}</span></div>)}</div></details> : null}
                </article>
              ))}
              {!inventory.length ? <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">لا توجد وحدات تسليم لهذه الخطة بعد.</div> : null}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}

