import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpLeft,
  Bot,
  Check,
  ChevronLeft,
  CircleHelp,
  Clock3,
  CreditCard,
  FileText,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type MarketingPlan = {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  maxUsers: number;
  maxCustomers: number;
  maxMessages: number;
  features: string[];
};

async function getMarketingData(): Promise<{ plans: MarketingPlan[]; referralEnabled: boolean; referralRate: number | null; referralDiscount: number | null }> {
  try {
    const [plans, referralSettings] = await Promise.all([
      prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { priceMonthly: 'asc' },
        select: { code: true, name: true, priceMonthly: true, priceYearly: true, maxUsers: true, maxCustomers: true, maxMessages: true, features: true },
      }),
      prisma.referralSettings.findUnique({ where: { id: 'default' }, select: { isEnabled: true, defaultCommissionRate: true, firstMonthDiscountAmount: true } }),
    ]);
    return {
      plans: plans.map((plan) => ({ ...plan, priceMonthly: Number(plan.priceMonthly), priceYearly: plan.priceYearly ? Number(plan.priceYearly) : null })),
      referralEnabled: referralSettings?.isEnabled === true,
      referralRate: referralSettings?.isEnabled ? Number(referralSettings.defaultCommissionRate) : null,
      referralDiscount: referralSettings?.isEnabled ? Number(referralSettings.firstMonthDiscountAmount) : null,
    };
  } catch {
    return { plans: [], referralEnabled: false, referralRate: null, referralDiscount: null };
  }
}

function money(value: number) {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(value);
}

export default async function Home() {
  const { plans, referralEnabled, referralRate, referralDiscount } = await getMarketingData();

  return <main dir="rtl" className="min-h-dvh overflow-hidden bg-[#07100d] text-zinc-100">
    <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
      <Link href="/" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400 text-black"><PackageCheck className="h-5 w-5" /></span><span><span className="block text-lg font-black tracking-[-0.03em] text-white">Nazzemly</span><span className="block text-xs font-bold text-emerald-300">نظّملي</span></span></Link>
      <nav className="hidden items-center gap-6 text-sm font-bold text-zinc-300 md:flex"><a href="#features" className="transition-colors hover:text-white">المزايا</a><a href="#pricing" className="transition-colors hover:text-white">الباقات</a><a href="#referral" className="transition-colors hover:text-white">الإحالة</a><a href="#faq" className="transition-colors hover:text-white">الأسئلة</a></nav>
      <div className="flex items-center gap-3">
        <Link href="/login" className="hidden text-sm font-black text-zinc-300 transition-colors hover:text-white sm:block">تسجيل الدخول</Link>
        <Link href="/register" className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-black transition-colors hover:bg-emerald-300">ابدأ مجاناً</Link>
      </div>
    </header>

    <section className="relative mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:px-10 lg:pb-24">
      <div aria-hidden className="absolute -right-44 top-4 h-[32rem] w-[32rem] rounded-full border border-emerald-400/15" />
      <div aria-hidden className="absolute -left-20 top-72 h-72 w-72 rounded-full bg-emerald-400/5 blur-3xl" />
      <div className="relative grid items-center gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-200"><Clock3 className="h-3.5 w-3.5" />14 يوماً لتجربة المنصة مجاناً</p>
          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.06] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">كل اشتراكاتك<br /><span className="text-emerald-300">مُنظّمة. وتحت سيطرتك.</span></h1>
          <p className="mt-7 max-w-2xl text-base font-semibold leading-8 text-zinc-300 sm:text-lg">نظّملي هو مساحة تشغيل واحدة لخدماتك الرقمية: أضف العميل، تابع الطلب، سلّم الاشتراك، وخلّي بوت تيليجرام يردّ ويبيع بطريقة يفهمها العميل.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 text-base font-black text-black transition-colors hover:bg-emerald-300">أنشئ متجرك مجاناً <ArrowLeft className="h-5 w-5" /></Link><a href="#features" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-6 text-base font-black text-white transition-colors hover:border-emerald-400/60 hover:text-emerald-200">شاهد كيف يعمل <ChevronLeft className="h-5 w-5" /></a></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-zinc-400"><span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />بدون دفع عند التسجيل</span><span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />واجهة عربية سهلة</span><span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />تبدأ خلال دقائق</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <div className="rounded-[28px] border border-emerald-400/25 bg-[#0c1b16] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.38)]">
            <div className="overflow-hidden rounded-[20px] border border-zinc-800 bg-[#090f0d]">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div><p className="text-xs font-bold text-emerald-300">نموذج توضيحي</p><p className="mt-1 text-sm font-black text-white">لوحة التشغيل</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-black"><PackageCheck className="h-4 w-4" /></span></div>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4"><p className="text-[11px] font-bold text-zinc-500">طلبات تحتاج تنفيذ</p><p className="mt-3 text-3xl font-black tabular-nums text-white">04</p></div>
                <div className="rounded-2xl border border-emerald-400/25 bg-[#102018] p-4"><p className="text-[11px] font-bold text-emerald-200">اشتراكات نشطة</p><p className="mt-3 text-3xl font-black tabular-nums text-emerald-300">28</p></div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-4"><p className="text-[11px] font-bold text-zinc-500">تنتهي قريباً</p><p className="mt-3 text-3xl font-black tabular-nums text-amber-300">03</p></div>
              </div>
              <div className="mx-4 mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/25 p-4">
                <div className="flex items-center justify-between"><div><p className="text-sm font-black text-white">طلب GPT Plus Shared</p><p className="mt-1 text-xs font-semibold text-zinc-500">العميل: أحمد محمد · تم التحويل</p></div><span className="rounded-lg border border-emerald-400/30 px-2.5 py-1 text-[10px] font-black text-emerald-300">جاهز للتنفيذ</span></div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full w-2/3 rounded-full bg-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-3 border-t border-zinc-800 px-4 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-800 text-emerald-300"><Bot className="h-4 w-4" /></span><div><p className="text-xs font-black text-white">البوت يعمل معك</p><p className="mt-1 text-[11px] font-semibold leading-5 text-zinc-500">يعرض الخدمات، يستقبل بيانات التحويل، ويوجه الطلبات للوحة.</p></div></div>
            </div>
          </div>
          <div className="absolute -bottom-5 -right-3 rounded-2xl border border-emerald-400/25 bg-[#10251d] px-4 py-3 shadow-xl"><p className="text-[10px] font-bold text-emerald-200">الخطوة التالية واضحة</p><p className="mt-1 text-xs font-black text-white">اعتمد الطلب وسلّم الخدمة</p></div>
        </div>
      </div>
    </section>

    <section id="features" className="border-y border-zinc-800 bg-[#0a1511] py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><div className="max-w-3xl"><h2 className="text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">من أول عميل إلى التجديد، كل المسار مترابط.</h2><p className="mt-5 text-base font-semibold leading-8 text-zinc-400">بدلاً من ملفات متفرقة ورسائل تضيع، يعطيك نظّملي مساراً واضحاً لكل خدمة وعميل وطلب.</p></div>
        <div className="mt-12 grid gap-4 lg:grid-cols-12"><article className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-6 lg:col-span-7"><div className="flex items-start justify-between gap-6"><div><WalletCards className="h-6 w-6 text-emerald-300" /><h3 className="mt-7 text-2xl font-black text-white">الطلبات والتنفيذ بدون فوضى</h3><p className="mt-3 max-w-md text-sm font-semibold leading-7 text-zinc-400">الطلب الجديد يبدأ واضحاً، ثم يتحول إلى اشتراك أو متابعة تفعيل. تعرف ما يحتاج تدخلك الآن وما تم بالفعل.</p></div><span className="hidden rounded-xl border border-zinc-700 px-3 py-2 text-xs font-black text-zinc-300 sm:block">متابعة لحظية</span></div><div className="mt-9 grid gap-3 sm:grid-cols-3"><p className="border-t border-emerald-400/55 pt-3 text-xs font-bold text-emerald-200">طلب جديد</p><p className="border-t border-zinc-700 pt-3 text-xs font-bold text-zinc-300">بانتظار التفعيل</p><p className="border-t border-zinc-700 pt-3 text-xs font-bold text-zinc-300">اشتراك نشط</p></div></article>
          <article className="rounded-2xl border border-zinc-800 bg-[#12221b] p-6 lg:col-span-5"><Bot className="h-6 w-6 text-emerald-300" /><h3 className="mt-7 text-2xl font-black text-white">بوت للبيع والدعم</h3><p className="mt-3 text-sm font-semibold leading-7 text-zinc-400">اربط بوت تيليجرام من لوحة التحكم، اعرض خدماتك، واستقبل الطلبات والتحويلات بشكل منظم.</p><Link href="/register" className="mt-7 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">ابدأ المتجر أولاً <ArrowUpLeft className="h-4 w-4" /></Link></article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-6 lg:col-span-4"><UsersRound className="h-6 w-6 text-emerald-300" /><h3 className="mt-7 text-xl font-black text-white">ملف كامل لكل عميل</h3><p className="mt-3 text-sm font-semibold leading-7 text-zinc-400">اشتراكاته ومدفوعاته وملاحظاتك وتاريخه في مكان واحد.</p></article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-6 lg:col-span-4"><CreditCard className="h-6 w-6 text-emerald-300" /><h3 className="mt-7 text-xl font-black text-white">محفظة وتجديد واضح</h3><p className="mt-3 text-sm font-semibold leading-7 text-zinc-400">اشحن رصيدك يدوياً، راقب الحالة، ثم جدّد الباقة من داخل المنصة.</p></article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-6 lg:col-span-4"><FileText className="h-6 w-6 text-emerald-300" /><h3 className="mt-7 text-xl font-black text-white">تقارير وتصدير آمن</h3><p className="mt-3 text-sm font-semibold leading-7 text-zinc-400">اعرف حركة عملك واحتفظ بنسخة منظمة من بيانات متجرك.</p></article>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10"><div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center"><div><h2 className="text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">مسار بسيط، حتى لو لم تكتب سطر كود واحد.</h2><p className="mt-5 text-base font-semibold leading-8 text-zinc-400">تبدأ من الأساسيات، ثم تضيف ما تحتاجه عندما يكبر عملك.</p><Link href="/register" className="mt-8 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">جرّب المسار بنفسك <ArrowLeft className="h-4 w-4" /></Link></div><ol className="space-y-4">{[['أنشئ المتجر', 'اكتب اسم نشاطك وأنشئ حسابك. تبدأ التجربة مباشرة لمدة 14 يوماً.'], ['أضف خدماتك', 'أضف الباقات والمخزون وطريقة تسليم كل خدمة كما تعمل بها فعلاً.'], ['شغّل المبيعات', 'تابع الطلبات والعملاء من اللوحة، واربط البوت عندما تكون جاهزاً.']].map(([title, copy], index) => <li key={title} className="grid grid-cols-[auto_1fr] gap-5 border-b border-zinc-800 pb-5 last:border-0"><span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-400/35 text-sm font-black text-emerald-300">{index + 1}</span><div><h3 className="text-lg font-black text-white">{title}</h3><p className="mt-1.5 text-sm font-semibold leading-7 text-zinc-400">{copy}</p></div></li>)}</ol></div></section>

    <section id="pricing" className="border-y border-zinc-800 bg-[#0a1511] py-20 sm:py-28"><div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h2 className="text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">اختر ما يناسب مرحلة متجرك.</h2><p className="mt-4 max-w-2xl text-base font-semibold leading-8 text-zinc-400">ابدأ أولاً بـ 14 يوماً مجانية. عند انتهاء التجربة، تجدّد من محفظة المنصة بالباقة والمدة التي تختارها.</p></div><p className="inline-flex w-fit items-center gap-2 text-sm font-black text-emerald-200"><ShieldCheck className="h-5 w-5" />لا يوجد دفع عند التسجيل</p></div>
        {plans.length ? <div className="mt-10 grid gap-4 lg:grid-cols-3">{plans.map((plan, index) => <article key={plan.code} className={`flex min-h-96 flex-col rounded-2xl border p-6 ${index === 1 ? 'border-emerald-400/55 bg-[#102018]' : 'border-zinc-800 bg-zinc-950/45'}`}>
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-white">{plan.name}</h3><p className="mt-2 text-sm font-bold text-zinc-400">حتى {money(plan.maxCustomers)} عميل · {money(plan.maxUsers)} مستخدم</p></div>
            {index === 1 ? <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-black text-black">اختيار شائع</span> : null}
          </div>
          <div className="mt-8"><span className="text-4xl font-black tabular-nums text-white">{money(plan.priceMonthly)}</span><span className="mr-1 text-sm font-bold text-zinc-400">ج.م / شهرياً</span>{plan.priceYearly ? <p className="mt-2 text-xs font-bold text-emerald-200">سنوي: {money(plan.priceYearly)} ج.م</p> : null}</div>
          <ul className="mt-7 space-y-3 text-sm font-semibold text-zinc-300">{plan.features.slice(0, 4).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{feature}</li>)}<li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />حتى {money(plan.maxMessages)} رسالة</li></ul>
          <Link href="/register" className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-colors ${index === 1 ? 'bg-emerald-400 text-black hover:bg-emerald-300' : 'border border-zinc-700 text-white hover:border-emerald-400/60 hover:text-emerald-200'}`}>ابدأ التجربة <ArrowLeft className="h-4 w-4" /></Link>
        </article>)}</div> : <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950/45 p-7 text-center"><p className="text-lg font-black text-white">أنشئ حسابك التجريبي الآن</p><p className="mt-2 text-sm font-semibold text-zinc-400">ستظهر الباقات المتاحة في صفحة الحساب والفوترة بعد التسجيل.</p>
          <Link href="/register" className="mt-5 inline-flex rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-black hover:bg-emerald-300">ابدأ مجاناً</Link>
        </div>}
      </div></section>

    <section id="referral" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10"><div className="rounded-3xl border border-emerald-400/25 bg-[#10251d] p-7 sm:p-10 lg:p-14"><div className="grid gap-10 lg:grid-cols-[1fr_1fr]"><div><h2 className="text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">كبر متجرك، وخذ مكافأة على الدعوات الحقيقية.</h2><p className="mt-5 max-w-xl text-base font-semibold leading-8 text-zinc-300">لكل تاجر رابط إحالة خاص. عندما ينشئ صديقك متجره من الرابط ثم يجدّد اشتراكه، تُضاف عمولتك إلى محفظة الإحالة ويمكنك استخدامها في تجديد اشتراكك أو طلب سحبها.</p><div className="mt-7 flex flex-wrap gap-3"><div className="inline-flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-zinc-950/35 px-4 py-3"><UsersRound className="h-5 w-5 text-emerald-300" /><span className="text-sm font-black text-white">{referralEnabled && referralRate !== null ? `العمولة الافتراضية الحالية: ${money(referralRate)}%` : 'العمولة تُدار من إعدادات المنصة'}</span></div>{referralEnabled && referralDiscount && referralDiscount > 0 ? <div className="inline-flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-zinc-950/35 px-4 py-3"><CreditCard className="h-5 w-5 text-emerald-300" /><span className="text-sm font-black text-white">خصم للمدعو: {money(referralDiscount)} ج.م من أول اشتراك مدفوع</span></div> : null}</div></div><ol className="space-y-4">{[['شارك رابطك', 'من تبويب نظام الإحالة داخل حسابك.'], ['ينشئ صديقك متجره', 'يبدأ هو أيضاً بتجربة مجانية لمدة 14 يوماً، ويحفظ النظام رمز الإحالة تلقائياً حتى التسجيل.'], ['تُسجل العمولة عند الدفع', 'يُطبق خصم المدعو مرة واحدة على أول فاتورة مدفوعة، ثم تظهر عمولتك في محفظة الإحالة.']].map(([title, copy]) => <li key={title} className="rounded-2xl border border-emerald-400/15 bg-zinc-950/30 p-5"><h3 className="text-base font-black text-white">{title}</h3><p className="mt-2 text-sm font-semibold leading-7 text-zinc-400">{copy}</p></li>)}</ol></div></div></section>

    <section id="faq" className="border-t border-zinc-800 py-20 sm:py-28"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:px-10"><div><CircleHelp className="h-7 w-7 text-emerald-300" /><h2 className="mt-6 text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">أسئلة سريعة قبل أن تبدأ.</h2><p className="mt-5 text-base font-semibold leading-8 text-zinc-400">إذا احتجت مساعدة بعد إنشاء الحساب، ستجد مركز الدعم داخل لوحة متجرك.</p></div><div className="divide-y divide-zinc-800 border-y border-zinc-800">{[['هل أحتاج إلى الدفع لإنشاء الحساب؟', 'لا. تبدأ بتجربة مجانية لمدة 14 يوماً دون بطاقة أو دفع عند التسجيل. بعد ذلك تجدّد باقتك من رصيد محفظة المنصة.'], ['هل أستطيع التسجيل من دون رمز إحالة؟', 'نعم. رمز الإحالة اختياري، لكنه يربط حسابك بصاحب الدعوة إن سجلت من خلاله.'], ['كيف يحصل التاجر على عمولة الإحالة؟', 'تُحتسب العمولة عند دفع التاجر المدعو لفاتورة تجديد اشتراك المنصة، وليس عند التسجيل المجاني.'], ['هل البوت إلزامي لتشغيل المتجر؟', 'لا. يمكنك إدارة المنصة كاملة من لوحة التحكم، ثم ربط بوت تيليجرام عندما تحتاجه.']].map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-black text-white"><span>{question}</span><ChevronLeft className="h-5 w-5 shrink-0 text-emerald-300 transition-transform group-open:-rotate-90" /></summary><p className="max-w-2xl pt-3 text-sm font-semibold leading-7 text-zinc-400">{answer}</p></details>)}</div></div></section>

    <footer className="border-t border-zinc-800 bg-[#060b09]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-black"><PackageCheck className="h-4 w-4" /></span>
          <div><p className="font-black text-white">Nazzemly — نظّملي</p><p className="mt-1 text-xs font-semibold text-zinc-500">إدارة الاشتراكات الرقمية للتجار.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm font-bold"><Link href="/register" className="text-emerald-200 hover:text-emerald-100">ابدأ التجربة المجانية</Link><Link href="/login" className="text-zinc-400 hover:text-white">تسجيل الدخول</Link><a href="#faq" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white"><MessageCircle className="h-4 w-4" />الدعم من داخل المنصة</a></div>
      </div>
    </footer>
  </main>;
}
