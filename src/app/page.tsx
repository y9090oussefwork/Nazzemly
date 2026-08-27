import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronLeft,
  CircleHelp,
  CreditCard,
  FileText,
  Globe2,
  PackageCheck,
  Sparkles,
  Store,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { SiteHeader } from '@/components/public/site-header';

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

const capabilities = [
  { icon: WalletCards, title: 'طلبات وتنفيذ بترتيب واحد', body: 'كل طلب يبدأ واضحًا، ثم يتحول إلى اشتراك أو متابعة تفعيل. تعرف دائمًا ما يحتاج تدخلًا الآن.' },
  { icon: Bot, title: 'بوت للبيع والدعم', body: 'اعرض خدماتك واستقبل بيانات التحويل والطلبات من تيليجرام، ثم تابعها من لوحة واحدة.' },
  { icon: UsersRound, title: 'ملف كامل لكل عميل', body: 'اشتراكاته ومدفوعاته وملاحظاتك وتاريخه التجاري في مكان واحد سهل الرجوع إليه.' },
  { icon: CreditCard, title: 'محفظة وتجديد مفهوم', body: 'اشحن رصيدك يدويًا، تابع حالة اشتراكك، وجدّد الباقة والمدة التي تناسب متجرك.' },
  { icon: FileText, title: 'بياناتك منظمة وقابلة للتصدير', body: 'راجع الأداء واحتفظ بنسخة من بيانات متجرك عندما تحتاج إليها.' },
];

const faqs = [
  ['هل أحتاج إلى بطاقة عند التسجيل؟', 'لا. تبدأ تجربة مجانية لمدة 14 يومًا، ثم تختار الباقة المناسبة وتجدد من محفظة المنصة.'],
  ['هل أحتاج إلى بوت تيليجرام لتشغيل المتجر؟', 'لا. يمكنك إدارة عملك كاملًا من اللوحة، ويكون البوت قناة إضافية للبيع والدعم عندما تكون جاهزًا.'],
  ['هل يمكنني إضافة فريق إلى متجري؟', 'نعم. أضف أعضاء فريقك وحدد صلاحياتهم من الإعدادات حسب مهامهم.'],
];

const operatingAreas = [
  ['العملاء', 'ملف واحد لكل عميل: بياناته، ملاحظاتك، اشتراكاته، مدفوعاته وسجل التواصل.'],
  ['الخدمات والمخزون', 'باقات متعددة، أسعار واضحة، حسابات خاصة أو مشتركة، ومخزون يعرف التاجر المتاح منه فورًا.'],
  ['الطلبات والتفعيل', 'تتابع الطلب من تأكيد التحويل إلى التسليم، أو تجمع البيانات اللازمة للتفعيل وتحدّث العميل بالحالة.'],
  ['التجديد والضمان', 'تنبيهات قبل الانتهاء، تواصل سريع، تجديد منظم، وتوثيق حالات الضمان والاستبدال عند الحاجة.'],
];

export default async function Home() {
  const { plans, referralEnabled, referralRate, referralDiscount } = await getMarketingData();

  return (
    <main dir="rtl" className="public-shell min-h-dvh overflow-x-clip bg-[#07110e] text-zinc-100">
      <SiteHeader />

      <section className="relative isolate overflow-hidden border-b border-white/8">
        <span aria-hidden className="absolute -right-40 top-4 -z-10 size-[34rem] rounded-full border border-emerald-300/10" />
        <span aria-hidden className="absolute bottom-0 left-[18%] -z-10 h-px w-[58%] bg-emerald-300/15" />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/8 px-3 py-2 text-xs font-black text-emerald-100"><Sparkles className="size-4 text-emerald-300" />تجربة مجانية لمدة 14 يومًا</div>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.12] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">تشغيل تجارتك الرقمية،<br />بوضوح من أول طلب.</h1>
            <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-zinc-300 sm:text-lg">نظّملي يجمع العملاء والطلبات والاشتراكات والتجديدات في مساحة تشغيل واحدة، لتعرف الخطوة التالية دون فتح ملفات أو البحث في المحادثات.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-6 text-base font-black text-[#062116] transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 active:translate-y-px">أنشئ متجرك مجانًا <ArrowLeft className="size-5" /></Link>
              <a href="#workflow" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-6 text-base font-black text-white transition hover:border-emerald-300/60 hover:text-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">شاهد كيف يعمل <ChevronLeft className="size-5" /></a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-zinc-400">
              {['بدون دفع عند التسجيل', 'واجهة عربية سهلة', 'ابدأ خلال دقائق'].map((item) => <span key={item} className="inline-flex items-center gap-2"><Check className="size-4 text-emerald-300" strokeWidth={2.5} />{item}</span>)}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="overflow-hidden rounded-2xl border border-emerald-300/20 bg-[#0b1913] shadow-[0_28px_70px_rgba(0,0,0,0.26)]">
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6"><div><p className="text-sm font-black text-white">مسار الطلب في نظّملي</p><p className="mt-1 text-xs font-semibold text-zinc-400">مثال توضيحي لطريقة العمل داخل المنصة</p></div><Store className="size-5 text-emerald-300" /></div>
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    ['طلب جديد', '01', 'bg-[#101d18] text-zinc-100'],
                    ['بانتظار التفعيل', '01', 'bg-[#16251e] text-emerald-100'],
                    ['اشتراك نشط', '28', 'bg-emerald-400 text-[#062116]'],
                  ].map(([label, count, style]) => <div key={label} className={`rounded-xl p-3 sm:p-4 ${style}`}><p className="text-[10px] font-extrabold sm:text-xs">{label}</p><p className="mt-3 font-[family-name:var(--font-geist-sans)] text-2xl font-black tabular-nums sm:text-3xl">{count}</p></div>)}
                </div>
                <div className="mt-4 border border-white/8 bg-[#09130f] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black text-white">GPT Plus Shared</p><p className="mt-1 text-xs font-semibold text-zinc-400">طلب عميل جديد، تم تسجيل التحويل</p></div><span className="shrink-0 rounded-md bg-emerald-400/12 px-2 py-1 text-[10px] font-black text-emerald-200">جاهز للتنفيذ</span></div>
                  <div className="mt-5 grid grid-cols-[auto_1fr] items-center gap-3 border-t border-white/8 pt-4"><span className="grid size-9 place-items-center rounded-lg bg-emerald-300/10 text-emerald-200"><Bot className="size-4" /></span><p className="text-xs font-bold leading-6 text-zinc-300">يُرسل البوت بيانات الطلب للوحة، لتكمل التسليم أو تتابع التفعيل.</p></div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-3 border border-emerald-300/25 bg-[#10251b] px-4 py-3 shadow-[0_18px_34px_rgba(0,0,0,0.22)]"><p className="text-[10px] font-bold text-emerald-200">الخطوة التالية</p><p className="mt-1 text-xs font-black text-white">اعتماد الطلب وتسليم الخدمة</p></div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[0.76fr_1.24fr] lg:gap-16">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <h2 className="max-w-md text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">مساحة تشغيل واحدة لكل ما يخص متجرك.</h2>
            <p className="mt-5 max-w-md text-base font-semibold leading-8 text-zinc-400">بدل أن تلاحق التفاصيل بين جداول ومحادثات، اعمل من تدفق واضح يحافظ على سياق العميل والخدمة والدفع.</p>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 text-sm font-black text-emerald-200 transition hover:text-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">ابدأ بمتجر تجريبي <ArrowLeft className="size-4" /></Link>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {capabilities.map((feature, index) => {
              const Icon = feature.icon;
              return <article key={feature.title} className="grid gap-4 py-6 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-6"><span className="grid size-10 place-items-center rounded-lg bg-emerald-400/10 text-emerald-200"><Icon className="size-5" /></span><div><h3 className="text-lg font-black text-white">{feature.title}</h3><p className="mt-2 max-w-xl text-sm font-semibold leading-7 text-zinc-400">{feature.body}</p></div><span className="font-[family-name:var(--font-geist-sans)] text-sm font-black tabular-nums text-emerald-300/70">0{index + 1}</span></article>;
            })}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-white/8 bg-[#091913] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-2xl"><h2 className="text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">لا تحتاج إلى خبرة تقنية لتبدأ.</h2><p className="mt-5 text-base font-semibold leading-8 text-zinc-300">تبدأ من الأساسيات التي يحتاجها متجرك، ثم تتوسع في البوت والفريق والحملات عندما تصبح مستعدًا.</p></div>
          <ol className="mt-12 grid gap-0 border border-white/10 sm:grid-cols-3">
            {[
              ['أنشئ متجرك', 'اكتب اسم نشاطك وأنشئ حسابك. تبدأ التجربة مباشرة لمدة 14 يومًا.'],
              ['أضف خدماتك', 'أضف الباقات والمخزون وطريقة تسليم كل خدمة كما تعمل بها فعليًا.'],
              ['شغّل المبيعات', 'تابع الطلبات والعملاء من اللوحة، واربط البوت عندما تكون جاهزًا.'],
            ].map(([title, body], index) => <li key={title} className="border-b border-white/10 p-6 last:border-b-0 sm:border-b-0 sm:border-l sm:last:border-l-0 sm:p-7"><span className="font-[family-name:var(--font-geist-sans)] text-sm font-black text-emerald-300">0{index + 1}</span><h3 className="mt-8 text-xl font-black text-white">{title}</h3><p className="mt-3 text-sm font-semibold leading-7 text-zinc-400">{body}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.04fr_0.96fr] lg:items-start lg:gap-16">
          <div>
            <h2 className="max-w-2xl text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">من الخدمة إلى التجديد، لا تفقد أي تفصيلة.</h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-zinc-400">نظّملي مصمم لتجارة الاشتراكات الرقمية فعلًا، لذلك لا يكتفي بتسجيل العميل أو الفاتورة. يربط ما تبيعه بما يحتاجه العميل وما يجب أن يفعله فريقك بعدها.</p>
            <div className="mt-8 border-y border-white/10"><div className="grid grid-cols-[auto_1fr] items-center gap-4 py-5"><span className="grid size-10 place-items-center rounded-lg bg-emerald-400/10 text-emerald-200"><PackageCheck className="size-5" /></span><p className="text-sm font-black leading-7 text-zinc-200">حدد لكل خدمة طريقة تسليمها: تفعيل يدوي، بيانات حساب، رابط، دعوة بريد أو طلب معلومات من العميل.</p></div><div className="grid grid-cols-[auto_1fr] items-center gap-4 border-t border-white/10 py-5"><span className="grid size-10 place-items-center rounded-lg bg-emerald-400/10 text-emerald-200"><Bot className="size-5" /></span><p className="text-sm font-black leading-7 text-zinc-200">اجعل البوت قناة بيع ودعم اختيارية، بينما يبقى كل شيء قابلًا للإدارة من لوحة متجرك.</p></div></div>
          </div>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {operatingAreas.map(([title, body]) => <article key={title} className="grid grid-cols-[minmax(7rem,0.42fr)_1fr] gap-5 py-6 sm:gap-8"><h3 className="text-base font-black text-emerald-200">{title}</h3><p className="text-sm font-semibold leading-7 text-zinc-400">{body}</p></article>)}
          </div>
        </div>
      </section>

      <section id="storefront" className="border-y border-emerald-300/15 bg-[#0c2119] py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.96fr_1.04fr] lg:items-center lg:px-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100"><Globe2 className="size-4" />ميزة قيد التطوير</div>
            <h2 className="mt-6 max-w-xl text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">موقع خدمات خاص بكل تاجر.</h2>
            <p className="mt-5 max-w-xl text-base font-semibold leading-8 text-emerald-50/80">نعمل على إضافة واجهة متجر عامة لكل تاجر، تعرض نشاطه وخدماته وأسعاره وطرق التواصل والأسئلة الشائعة. ستتصل بالخدمات والباقات الموجودة لديه، لتكون امتدادًا طبيعيًا للبوت ولوحة التحكم.</p>
            <p className="mt-6 max-w-xl border-r border-emerald-300/40 pr-4 text-sm font-bold leading-7 text-emerald-100">هذه الميزة غير مفعّلة الآن ولن تظهر للتجار قبل اكتمالها واختبارها. عند الإطلاق، سيحصل كل تاجر على رابط متجر ويمكنه ربط دومينه الخاص لاحقًا.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-emerald-200/15 bg-[#08150f] shadow-[0_26px_62px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div className="flex items-center gap-2 text-sm font-black text-white"><Store className="size-4 text-emerald-300" />متجر التاجر</div><span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[10px] font-black text-amber-100">قيد التطوير</span></div>
            <div className="p-5 sm:p-6"><div className="border-b border-white/8 pb-5"><p className="text-xl font-black text-white">واجهة واضحة لخدمات التاجر</p><p className="mt-2 text-sm font-semibold text-zinc-400">اسم النشاط، وصفه، وسائل التواصل، وخدماته في مكان عام واحد.</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="border border-white/8 bg-[#0b1b14] p-4"><p className="text-sm font-black text-white">الخدمات والباقات</p><p className="mt-2 text-xs font-semibold leading-6 text-zinc-400">تصنيفات، أسعار، مدة الاشتراك وتوفر الخدمة.</p></div><div className="border border-white/8 bg-[#0b1b14] p-4"><p className="text-sm font-black text-white">التواصل والشراء</p><p className="mt-2 text-xs font-semibold leading-6 text-zinc-400">زر بوت أو واتساب، وطرق دفع ومعلومات دعم التاجر.</p></div></div><div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4 text-xs font-bold text-zinc-500"><span>تصور للميزة القادمة</span><span className="text-emerald-200">سيتم إطلاقها بعد الاختبار</span></div></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <div className="max-w-2xl"><h2 className="text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">اختر باقة تتماشى مع مرحلة متجرك.</h2><p className="mt-5 text-base font-semibold leading-8 text-zinc-400">ابدأ التجربة بلا دفع. عند الانتهاء، تجدّد من محفظة المنصة بالباقة والمدة التي تختارها.</p></div>
        {plans.length ? <div className="mt-12 grid gap-4 lg:grid-cols-3">{plans.map((plan, index) => <article key={plan.code} className={`flex min-h-96 flex-col rounded-xl border p-6 ${index === 1 ? 'border-emerald-300/45 bg-[#10241b]' : 'border-white/10 bg-[#0b1612]'}`}><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-black text-white">{plan.name}</h3><p className="mt-2 text-sm font-bold text-zinc-400">حتى {money(plan.maxCustomers)} عميل و{money(plan.maxUsers)} مستخدم</p></div>{index === 1 ? <span className="rounded-md bg-emerald-400 px-2.5 py-1 text-[10px] font-black text-[#062116]">اختيار شائع</span> : null}</div><div className="mt-9"><span className="font-[family-name:var(--font-geist-sans)] text-4xl font-black tabular-nums text-white">{money(plan.priceMonthly)}</span><span className="mr-1 text-sm font-bold text-zinc-400">ج.م شهريًا</span>{plan.priceYearly ? <p className="mt-2 text-xs font-bold text-emerald-200">سنويًا: {money(plan.priceYearly)} ج.م</p> : null}</div><ul className="mt-7 space-y-3 text-sm font-semibold text-zinc-300">{plan.features.slice(0, 4).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-300" strokeWidth={2.5} />{feature}</li>)}<li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-300" strokeWidth={2.5} />حتى {money(plan.maxMessages)} رسالة</li></ul><Link href="/register" className={`mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 active:translate-y-px ${index === 1 ? 'bg-emerald-400 text-[#062116] hover:bg-emerald-300' : 'border border-zinc-700 text-white hover:border-emerald-300/60 hover:text-emerald-100'}`}>ابدأ التجربة <ArrowLeft className="size-4" /></Link></article>)}</div> : <div className="mt-12 border border-white/10 bg-[#0b1612] p-8 text-center"><p className="text-lg font-black text-white">أنشئ حسابك التجريبي الآن</p><p className="mt-2 text-sm font-semibold text-zinc-400">ستظهر الباقات المتاحة في صفحة الحساب والفوترة بعد التسجيل.</p><Link href="/register" className="mt-5 inline-flex rounded-lg bg-emerald-400 px-5 py-3 text-sm font-black text-[#062116] transition hover:bg-emerald-300">ابدأ مجانًا</Link></div>}
      </section>

      <section id="referral" className="border-y border-emerald-300/15 bg-[#10251b] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-10">
          <div><h2 className="max-w-xl text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">دعوة مفيدة لصديقك، ومكافأة مستمرة لك.</h2><p className="mt-5 max-w-xl text-base font-semibold leading-8 text-emerald-50/80">أنشئ متجرك، شارك رابط الإحالة الخاص بك، وتابع الدعوات والأرباح داخل حسابك.</p><Link href="/register" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-lg bg-emerald-400 px-5 text-sm font-black text-[#062116] transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 active:translate-y-px">أنشئ حسابك وابدأ <ArrowLeft className="size-4" /></Link></div>
          <div className="border border-emerald-200/15 bg-[#0b1712] p-6 sm:p-7"><p className="text-sm font-black text-emerald-100">برنامج الإحالة داخل المنصة</p><div className="mt-7 grid gap-5 sm:grid-cols-2"><div><p className="font-[family-name:var(--font-geist-sans)] text-3xl font-black text-emerald-300">{referralEnabled && referralRate !== null ? `${money(referralRate)}%` : 'متاح'}</p><p className="mt-2 text-xs font-bold leading-6 text-zinc-400">نسبة المكافأة تحددها إدارة المنصة وتظهر لك في محفظة الإحالات.</p></div><div><p className="font-[family-name:var(--font-geist-sans)] text-3xl font-black text-emerald-300">{referralEnabled && referralDiscount !== null ? `${money(referralDiscount)} ج.م` : 'عرض'}</p><p className="mt-2 text-xs font-bold leading-6 text-zinc-400">خصم تسجيل عبر الإحالة، إن كان مفعّلًا، يطبق تلقائيًا على أول اشتراك مدفوع.</p></div></div></div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16"><div><h2 className="text-3xl font-black leading-[1.2] tracking-[-0.035em] text-white sm:text-5xl">أسئلة قبل أن تبدأ.</h2><p className="mt-5 max-w-md text-base font-semibold leading-8 text-zinc-400">وضوح كامل من أول خطوة. وإذا احتجت مساعدة، تجد الدعم من داخل حسابك.</p></div><div className="divide-y divide-white/10 border-y border-white/10">{faqs.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-black text-white marker:content-none"><span>{question}</span><CircleHelp className="size-5 shrink-0 text-emerald-300 transition-transform duration-200 group-open:rotate-12" /></summary><p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-zinc-400">{answer}</p></details>)}</div></div>
      </section>

      <section className="border-t border-white/8 bg-[#08130f]"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-5 py-10 sm:px-8 md:flex-row md:items-end lg:px-10"><div><p className="text-2xl font-black text-white">جاهز لتنظيم تجارتك؟</p><p className="mt-2 text-sm font-semibold text-zinc-400">ابدأ التجربة المجانية، ثم جهّز متجرك بالترتيب الذي يناسبك.</p></div><Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-emerald-400 px-5 text-sm font-black text-[#062116] transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 active:translate-y-px">أنشئ متجرك <ArrowLeft className="size-4" /></Link></div></section>

      <footer className="border-t border-white/8 bg-[#06100c]"><div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto_auto] lg:px-10"><div><p className="font-[family-name:var(--font-geist-sans)] text-lg font-extrabold tracking-[-0.04em] text-white">Nazzemly</p><p className="mt-2 text-sm font-bold text-emerald-200">نظّملي</p><p className="mt-4 max-w-xs text-xs font-semibold leading-6 text-zinc-500">منصة تشغيل بسيطة لإدارة الخدمات والاشتراكات الرقمية.</p></div><div><p className="text-xs font-black text-zinc-500">استكشف</p><div className="mt-3 grid gap-2 text-sm font-bold text-zinc-300"><a href="#features" className="hover:text-emerald-200">المزايا</a><a href="#pricing" className="hover:text-emerald-200">الباقات</a><a href="#referral" className="hover:text-emerald-200">الإحالة</a></div></div><div><p className="text-xs font-black text-zinc-500">الحساب</p><div className="mt-3 grid gap-2 text-sm font-bold text-zinc-300"><Link href="/login" className="hover:text-emerald-200">تسجيل الدخول</Link><Link href="/register" className="hover:text-emerald-200">إنشاء متجر</Link></div></div></div><div className="border-t border-white/8"><div className="mx-auto max-w-7xl px-5 py-5 text-xs font-semibold text-zinc-600 sm:px-8 lg:px-10">© {new Date().getFullYear()} Nazzemly. جميع الحقوق محفوظة.</div></div></footer>
    </main>
  );
}
