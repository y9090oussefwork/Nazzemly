/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { FormEvent, useEffect, useState, useTransition } from 'react';
import {
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Layers3,
  MessageCircle,
  PackageCheck,
  PackageX,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  getCatalog,
  getServiceInterests,
  saveCatalogService,
  saveServiceCategory,
  saveServicePlan,
  setCatalogItemState,
  updateServiceInterest,
} from '@/app/actions/catalog-actions';
import HelpTip from '@/app/dashboard/help-tip';
import FulfillmentManager from './fulfillment-manager';

type Catalog = Awaited<ReturnType<typeof getCatalog>>;
type Service = Catalog['uncategorizedServices'][number];
type Plan = Service['plans'][number];
type Interest = Awaited<ReturnType<typeof getServiceInterests>>[number];

const inputClass =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-zinc-100 outline-none transition-colors duration-150 placeholder:text-zinc-600 focus:border-emerald-500/70';
const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-zinc-950 transition-colors duration-150 hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

function FieldLabel({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <span className="mb-2 flex items-center gap-1 text-xs font-bold text-zinc-400">
      {children}
      <HelpTip text={tip} />
    </span>
  );
}

function ToggleField({
  checked,
  onChange,
  label,
  tip,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tip: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3">
      <span className="flex items-center gap-1 text-sm font-bold">
        {label}
        <HelpTip text={tip} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-emerald-500"
      />
    </label>
  );
}

function CategoryForm({
  onSaved,
  setNotice,
}: {
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: '', icon: '', description: '', showInBot: true });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveServiceCategory(form);
      setNotice(result.success ? 'تم إنشاء التصنيف.' : result.error || 'تعذر إنشاء التصنيف.');
      if (result.success) {
        setForm({ name: '', icon: '', description: '', showInBot: true });
        await onSaved();
      }
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label>
        <FieldLabel tip="مثال: ChatGPT أو منصات المشاهدة. ستظهر الخدمات التابعة تحته داخل البوت.">اسم التصنيف</FieldLabel>
        <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="مثال: ChatGPT" />
      </label>
      <label>
        <FieldLabel tip="رمز تعبيري اختياري يظهر بجوار اسم التصنيف في البوت.">أيقونة اختيارية</FieldLabel>
        <input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} className={inputClass} placeholder="🤖" maxLength={8} />
      </label>
      <label className="md:col-span-2">
        <FieldLabel tip="وصف داخلي مختصر يساعد فريقك على فهم نوع الخدمات الموجودة في هذا القسم.">وصف التصنيف</FieldLabel>
        <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} placeholder="اشتراكات ومنتجات ChatGPT" />
      </label>
      <ToggleField checked={form.showInBot} onChange={(showInBot) => setForm({ ...form, showInBot })} label="عرض التصنيف في البوت" tip="عند إيقافه يختفي التصنيف وكل ما تحته من قوائم البوت، مع بقاء البيانات داخل اللوحة." />
      <button disabled={isPending} className={buttonPrimary}><Plus className="h-4 w-4" />إنشاء التصنيف</button>
    </form>
  );
}

function ServiceForm({
  categories,
  initial,
  onSaved,
  setNotice,
}: {
  categories: Catalog['categories'];
  initial?: Service;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    categoryId: initial?.categoryId || '',
    name: initial?.name || '',
    icon: initial?.icon || '',
    description: initial?.description || '',
    features: initial?.features.join('\n') || '',
    defaultDuration: String(initial?.defaultDuration || 30),
    defaultSellingPrice: String(initial?.defaultSellingPrice || ''),
    defaultCostPrice: String(initial?.defaultCostPrice || 0),
    showInBot: initial?.showInBot ?? true,
    isActive: initial?.isActive ?? true,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveCatalogService({
        id: initial?.id,
        categoryId: form.categoryId || undefined,
        name: form.name,
        icon: form.icon,
        description: form.description,
        features: form.features.split('\n'),
        defaultDuration: Number(form.defaultDuration),
        defaultSellingPrice: Number(form.defaultSellingPrice),
        defaultCostPrice: Number(form.defaultCostPrice),
        showInBot: form.showInBot,
        isActive: form.isActive,
      });
      setNotice(result.success ? (initial ? 'تم تحديث الخدمة.' : 'تم إنشاء الخدمة وإضافة المدة الأساسية.') : result.error || 'تعذر حفظ الخدمة.');
      if (result.success) {
        if (!initial) setForm({ categoryId: '', name: '', icon: '', description: '', features: '', defaultDuration: '30', defaultSellingPrice: '', defaultCostPrice: '0', showInBot: true, isActive: true });
        await onSaved();
      }
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label>
        <FieldLabel tip="ضع الخدمة تحت القسم المناسب؛ مثال: Plus وPro وBusiness كلها تحت تصنيف ChatGPT.">التصنيف</FieldLabel>
        <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className={inputClass}>
          <option value="">بدون تصنيف</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </label>
      <label>
        <FieldLabel tip="اسم المنتج الذي يراه فريقك والعميل؛ مثال: ChatGPT Plus.">اسم الخدمة</FieldLabel>
        <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="ChatGPT Plus" />
      </label>
      <label>
        <FieldLabel tip="رمز تعبيري اختياري يظهر مع الخدمة داخل البوت.">أيقونة اختيارية</FieldLabel>
        <input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} className={inputClass} placeholder="✨" maxLength={8} />
      </label>
      <div className="hidden md:block" />
      <label className="md:col-span-2">
        <FieldLabel tip="اكتب شرحاً واضحاً لما يحصل عليه العميل، ولمن تناسب الخدمة، وأي شروط مهمة.">وصف الخدمة</FieldLabel>
        <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} placeholder="وصف واضح للخدمة وطريقة التسليم…" />
      </label>
      <label className="md:col-span-2">
        <FieldLabel tip="اكتب كل ميزة في سطر مستقل. ستظهر كنقاط منظمة داخل البوت.">مميزات الخدمة</FieldLabel>
        <textarea rows={4} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} className={inputClass} placeholder={'أولوية الوصول للنماذج\nرفع ملفات وتحليلها\nإنشاء صور'} />
      </label>
      <label>
        <FieldLabel tip="هذه هي المدة المرجعية التي يقارن بها النظام باقي المدد. غالباً 30 يوماً.">المدة الأساسية بالأيام</FieldLabel>
        <input required min="1" max="3650" type="number" value={form.defaultDuration} onChange={(event) => setForm({ ...form, defaultDuration: event.target.value })} className={inputClass} />
      </label>
      <label>
        <FieldLabel tip="سعر المدة الأساسية. يستخدمه النظام لحساب السعر العادي والتوفير في الخطط الأطول تلقائياً.">سعر الاشتراك الأساسي</FieldLabel>
        <input required min="0.01" step="0.01" type="number" value={form.defaultSellingPrice} onChange={(event) => setForm({ ...form, defaultSellingPrice: event.target.value })} className={inputClass} placeholder="100" />
      </label>
      <label>
        <FieldLabel tip="تكلفتك الداخلية للخدمة، لا تظهر للعميل وتستخدم لحساب الربح.">التكلفة الأساسية</FieldLabel>
        <input min="0" step="0.01" type="number" value={form.defaultCostPrice} onChange={(event) => setForm({ ...form, defaultCostPrice: event.target.value })} className={inputClass} />
      </label>
      <div className="grid gap-3">
        <ToggleField checked={form.showInBot} onChange={(showInBot) => setForm({ ...form, showInBot })} label="عرض الخدمة في البوت" tip="يمكن إخفاء الخدمة من البوت مع استمرار إدارتها وبيعها يدوياً من اللوحة." />
        <ToggleField checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="الخدمة نشطة" tip="إيقاف الخدمة يمنع استخدامها في المبيعات الجديدة دون حذف بياناتها القديمة." />
      </div>
      <button disabled={isPending} className={`${buttonPrimary} md:col-span-2`}><PackageCheck className="h-4 w-4" />{initial ? 'حفظ تعديلات الخدمة' : 'إنشاء الخدمة'}</button>
    </form>
  );
}

function PlanForm({
  serviceId,
  plan,
  onSaved,
  setNotice,
}: {
  serviceId: string;
  plan?: Plan;
  onSaved: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: plan?.name || '',
    durationDays: String(plan?.durationDays || 30),
    price: String(plan?.price || ''),
    costPrice: String(plan?.costPrice || 0),
    trackInventory: plan?.trackInventory ?? false,
    stockQuantity: String(plan?.stockQuantity || 0),
    showInBot: plan?.showInBot ?? true,
    isActive: plan?.isActive ?? true,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveServicePlan({
        id: plan?.id,
        serviceId,
        name: form.name,
        durationDays: Number(form.durationDays),
        price: Number(form.price),
        costPrice: Number(form.costPrice),
        trackInventory: form.trackInventory,
        stockQuantity: Number(form.stockQuantity),
        showInBot: form.showInBot,
        isActive: form.isActive,
      });
      setNotice(result.success ? `تم حفظ المدة.${result.notifiedCount ? ` وأُرسل إشعار إلى ${result.notifiedCount} عميل.` : ''}` : result.error || 'تعذر حفظ المدة.');
      if (result.success) {
        if (!plan) setForm({ name: '', durationDays: '30', price: '', costPrice: '0', trackInventory: false, stockQuantity: '0', showInBot: true, isActive: true });
        await onSaved();
      }
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 md:grid-cols-4">
      <label>
        <FieldLabel tip="اسم سهل مثل: شهر، شهران، 3 شهور، سنة.">اسم المدة</FieldLabel>
        <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="3 شهور" />
      </label>
      <label>
        <FieldLabel tip="المدة الفعلية التي سيضيفها النظام لتاريخ بداية الاشتراك.">عدد الأيام</FieldLabel>
        <input required min="1" max="3650" type="number" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} className={inputClass} />
      </label>
      <label>
        <FieldLabel tip="السعر النهائي لهذه المدة. يحسب النظام مقدار التوفير مقارنة بتكرار السعر الأساسي.">سعر البيع</FieldLabel>
        <input required min="0.01" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={inputClass} />
      </label>
      <label>
        <FieldLabel tip="تكلفتك الداخلية لهذه المدة لحساب الربح بدقة.">التكلفة</FieldLabel>
        <input min="0" step="0.01" type="number" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} className={inputClass} />
      </label>
      <ToggleField checked={form.trackInventory} onChange={(trackInventory) => setForm({ ...form, trackInventory })} label="تتبع المخزون" tip="فعّله للخدمات ذات الكمية المحدودة. عند وصول المخزون إلى صفر يمنع البوت الشراء تلقائياً." />
      {form.trackInventory ? <label>
        <FieldLabel tip="عدد الوحدات المتاحة الآن. كل شراء ناجح من البوت ينقص وحدة واحدة تلقائياً.">الكمية المتاحة</FieldLabel>
        <input required min="0" type="number" value={form.stockQuantity} onChange={(event) => setForm({ ...form, stockQuantity: event.target.value })} className={inputClass} />
      </label> : <div className="flex items-center rounded-xl border border-sky-500/20 bg-sky-500/5 px-3.5 py-3 text-xs leading-6 text-sky-200">هذه المدة متاحة بلا حد، ولن تحتاج إلى كتابة مخزون.</div>}
      <ToggleField checked={form.showInBot} onChange={(showInBot) => setForm({ ...form, showInBot })} label="تظهر في البوت" tip="إخفاء مدة محددة فقط من البوت، مع بقاء مدد الخدمة الأخرى ظاهرة." />
      <ToggleField checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="المدة نشطة" tip="عند إيقافها لا يمكن بيعها أو اختيارها حتى تعيد تفعيلها." />
      <button disabled={isPending} className={`${buttonPrimary} md:col-span-4`}><CheckCircle2 className="h-4 w-4" />{plan ? (form.trackInventory ? 'حفظ المدة والمخزون' : 'حفظ المدة') : 'إضافة المدة'}</button>
    </form>
  );
}

function ServiceCard({ service, categories, refresh, setNotice, currency }: { service: Service; categories: Catalog['categories']; refresh: () => Promise<void>; setNotice: (value: string) => void; currency: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black">{service.name}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${service.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-800 text-zinc-500'}`}>{service.isActive ? 'نشطة' : 'متوقفة'}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${service.showInBot ? 'bg-sky-500/10 text-sky-300' : 'bg-zinc-800 text-zinc-500'}`}>{service.showInBot ? 'ظاهرة في البوت' : 'مخفية من البوت'}</span></div>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">{service.description || 'لم يُضف وصف لهذه الخدمة بعد.'}</p>
          {service.features.length ? <div className="mt-3 flex flex-wrap gap-2">{service.features.map((feature) => <span key={feature} className="rounded-lg bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300">{feature}</span>)}</div> : null}
        </div>
        <div className="grid min-w-52 grid-cols-2 gap-2 text-center text-xs"><div className="rounded-xl bg-zinc-950 p-3"><b className="block text-lg text-emerald-300">{service.plans.length}</b><span className="text-zinc-500">مدد متاحة</span></div><div className="rounded-xl bg-zinc-950 p-3"><b className="block text-lg">{service._count.interests}</b><span className="text-zinc-500">مهتمون</span></div></div>
      </div>
      <div className="border-t border-zinc-800 p-5">
        <h4 className="mb-3 flex items-center gap-1 text-sm font-black">المدد والأسعار والمخزون<HelpTip text="كل مدة لها سعر ومخزون وظهور مستقل. التوفير يُحسب تلقائياً من السعر الأساسي للخدمة." /></h4>
        <div className="grid gap-3 lg:grid-cols-2">
          {service.plans.map((plan) => (
            <details key={plan.id} className="group rounded-xl border border-zinc-800 bg-zinc-950/70 open:border-emerald-500/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                <div><p className="font-black">{plan.name} <span className="text-zinc-500">· {plan.durationDays} يوم</span></p><p className="mt-1 text-sm"><span className="text-emerald-300">{plan.price.toLocaleString()} {currency}</span>{plan.savings > 0 ? <span className="mr-2 text-amber-300">توفر {plan.savings.toLocaleString()} ({plan.savingsPercent}%)</span> : null}</p></div>
                <div className="flex items-center gap-2">{plan.trackInventory ? <span className={`rounded-lg px-2 py-1 text-xs font-black ${plan.stockQuantity > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{plan.stockQuantity > 0 ? `المخزون ${plan.stockQuantity}` : 'نفد المخزون'}</span> : <span className="rounded-lg bg-sky-500/10 px-2 py-1 text-xs text-sky-300">غير محدود</span>}<ChevronDown className="h-4 w-4 text-zinc-500 transition-transform duration-150 group-open:rotate-180" /></div>
              </summary>
              <div className="border-t border-zinc-800 p-3">
                <PlanForm serviceId={service.id} plan={plan} onSaved={refresh} setNotice={setNotice} />
                <FulfillmentManager plan={plan} refresh={refresh} setNotice={setNotice} />
              </div>
            </details>
          ))}
        </div>
        {!service.plans.length ? <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500"><PackageX className="mx-auto mb-2 h-6 w-6" />لا توجد مدد بيع بعد.</div> : null}
        <details className="mt-4 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-4"><summary className="cursor-pointer list-none font-black text-emerald-300">+ إضافة مدة وسعر جديدين</summary><div className="mt-4"><PlanForm serviceId={service.id} onSaved={refresh} setNotice={setNotice} /></div></details>
        <details className="mt-3 rounded-xl border border-zinc-800 p-4"><summary className="cursor-pointer list-none text-sm font-bold text-zinc-400">تعديل بيانات الخدمة الأساسية</summary><div className="mt-4"><ServiceForm categories={categories} initial={service} onSaved={refresh} setNotice={setNotice} /></div></details>
      </div>
    </article>
  );
}

export default function ServicesPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    try {
      const [catalogData, interestData] = await Promise.all([getCatalog(), getServiceInterests()]);
      setCatalog(catalogData);
      setInterests(interestData);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر تحميل الخدمات.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const allServices = catalog ? [...catalog.categories.flatMap((category) => category.services), ...catalog.uncategorizedServices] : [];
  const stockAlerts = allServices.flatMap((service) => service.plans).filter((plan) => plan.trackInventory && plan.stockQuantity === 0).length;

  const changeInterest = (id: string, status: 'contacted' | 'converted' | 'closed') => {
    startTransition(async () => {
      const result = await updateServiceInterest({ id, status });
      setNotice(result.success ? 'تم تحديث متابعة العميل.' : result.error || 'تعذر تحديث المتابعة.');
      if (result.success) await refresh();
    });
  };

  if (loading) return <div className="mx-auto max-w-7xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-zinc-400">جارٍ تجهيز كتالوج الخدمات…</div>;
  if (!catalog) return <div className="mx-auto max-w-7xl rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">{notice || 'تعذر تحميل الكتالوج.'}</div>;

  return (
    <section dir="rtl" className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="flex items-center gap-2 text-sm font-bold text-emerald-400"><Sparkles className="h-4 w-4" />كتالوج ذكي ومتكامل</p><h1 className="mt-2 text-3xl font-black">الخدمات والأسعار والمخزون</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">أنشئ الأقسام والخدمات والمدد من مكان واحد، وسيظهر كل ما تسمح به تلقائياً داخل بوت متجرك.</p></div>
        <button onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-300 transition-colors duration-150 hover:bg-zinc-900 active:scale-[0.98]"><RefreshCw className="h-4 w-4" />تحديث البيانات</button>
      </header>

      {notice ? <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"><span>{notice}</span><button onClick={() => setNotice('')} className="text-zinc-400">إغلاق</button></div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{ label: 'التصنيفات', value: catalog.categories.length, icon: Layers3 }, { label: 'الخدمات', value: allServices.length, icon: Boxes }, { label: 'نفد مخزونها', value: stockAlerts, icon: PackageX }, { label: 'بانتظار التوفر', value: catalog.waitingCount, icon: BellRing }].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><div className="flex items-center justify-between"><span className="text-sm text-zinc-500">{label}</span><Icon className="h-4 w-4 text-emerald-400" /></div><b className="mt-3 block text-3xl">{value}</b></div>)}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <details className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><summary className="flex cursor-pointer list-none items-center justify-between text-lg font-black"><span className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-emerald-400" />إضافة تصنيف</span><ChevronDown className="h-5 w-5 text-zinc-500" /></summary><p className="my-3 text-sm text-zinc-500">التصنيف يجمع المنتجات المتشابهة ويجعل تصفح البوت أسرع.</p><CategoryForm onSaved={refresh} setNotice={setNotice} /></details>
        <details open={!allServices.length} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><summary className="flex cursor-pointer list-none items-center justify-between text-lg font-black"><span className="flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-400" />إضافة خدمة</span><ChevronDown className="h-5 w-5 text-zinc-500" /></summary><p className="my-3 text-sm leading-7 text-zinc-500">اكتب بيانات الخدمة والسعر فقط. لا تحتاج إلى إدخال مخزون الآن، وستضاف مدة أساسية غير محدودة تلقائياً. إذا كانت لديك كمية محدودة يمكنك تفعيل المخزون لاحقاً من تعديل المدة.</p><ServiceForm categories={catalog.categories} onSaved={refresh} setNotice={setNotice} /></details>
      </div>

      {catalog.categories.map((category) => (
        <section key={category.id} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black"><Layers3 className="h-5 w-5 text-emerald-400" />{category.name}</h2><p className="mt-1 text-sm text-zinc-500">{category.description || 'تصنيف خدمات'}</p></div><button disabled={isPending} onClick={() => startTransition(async () => { const result = await setCatalogItemState({ type: 'category', id: category.id, showInBot: !category.showInBot }); setNotice(result.success ? 'تم تحديث ظهور التصنيف في البوت.' : result.error || 'تعذر التحديث.'); if (result.success) await refresh(); })} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors duration-150 hover:bg-zinc-900">{category.showInBot ? 'إخفاء التصنيف من البوت' : 'إظهار التصنيف في البوت'}</button></div>
          <div className="space-y-4">{category.services.map((service) => <ServiceCard key={service.id} service={service} categories={catalog.categories} refresh={refresh} setNotice={setNotice} currency={catalog.currency} />)}{!category.services.length ? <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">لا توجد خدمات في هذا التصنيف بعد.</div> : null}</div>
        </section>
      ))}

      {catalog.uncategorizedServices.length ? <section className="space-y-4"><h2 className="text-xl font-black">خدمات بدون تصنيف</h2>{catalog.uncategorizedServices.map((service) => <ServiceCard key={service.id} service={service} categories={catalog.categories} refresh={refresh} setNotice={setNotice} currency={catalog.currency} />)}</section> : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black"><BellRing className="h-5 w-5 text-amber-300" />قائمة العملاء المهتمين</h2><p className="mt-1 text-sm text-zinc-500">العملاء الذين طلبوا إشعارهم عند عودة خدمة نفد مخزونها.</p></div><HelpTip text="عند تحويل مخزون خطة من صفر إلى كمية متاحة، يحاول النظام إشعار كل عميل مرتبط بتيليجرام تلقائياً." /></div>
        <div className="space-y-3">
          {interests.map((interest) => {
            const phone = interest.customer.phone.replace(/\D/g, '').replace(/^0/, '20');
            const message = `مرحباً ${interest.customer.name}، خدمة ${interest.service.name}${interest.servicePlan ? ` - ${interest.servicePlan.name}` : ''} التي سألت عنها متاحة الآن. هل تريد إتمام الاشتراك؟`;
            return <article key={interest.id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-black">{interest.customer.name} <span className="text-zinc-500">· {interest.customer.phone}</span></p><p className="mt-1 text-sm text-zinc-400">{interest.service.name}{interest.servicePlan ? ` — ${interest.servicePlan.name}` : ''} · <span className="text-amber-300">{interest.status}</span></p></div><div className="flex flex-wrap gap-2"><a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300 hover:bg-emerald-500/20"><MessageCircle className="h-4 w-4" />واتساب</a>{interest.customer.tgUsername ? <a href={`https://t.me/${interest.customer.tgUsername}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-300 hover:bg-sky-500/20"><Send className="h-4 w-4" />تيليجرام</a> : null}<button disabled={isPending} onClick={() => changeInterest(interest.id, 'contacted')} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold">تم التواصل</button><button disabled={isPending} onClick={() => changeInterest(interest.id, 'converted')} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold">تم البيع</button></div></article>;
          })}
          {!interests.length ? <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500">لا توجد طلبات اهتمام حتى الآن.</div> : null}
        </div>
      </section>
    </section>
  );
}
