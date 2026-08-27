import { Boxes } from 'lucide-react';
import Link from 'next/link';

type SiteBrandProps = {
  compact?: boolean;
  href?: string;
};

export function SiteBrand({ compact = false, href = '/' }: SiteBrandProps) {
  return (
    <Link
      href={href}
      aria-label="Nazzemly نظّملي، الصفحة الرئيسية"
      className="group inline-flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-[#062116] shadow-[0_12px_26px_rgba(52,211,153,0.18)] transition-transform duration-200 group-hover:-translate-y-0.5">
        <Boxes className="size-5" strokeWidth={2.2} />
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block font-[family-name:var(--font-geist-sans)] text-[1.05rem] font-extrabold tracking-[-0.04em] text-white">Nazzemly</span>
          <span className="mt-1 block text-xs font-extrabold text-emerald-200">نظّملي</span>
        </span>
      ) : null}
    </Link>
  );
}
