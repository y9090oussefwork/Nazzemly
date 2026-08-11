'use client';

import { HelpCircle } from 'lucide-react';

export default function HelpTip({ text }: { text: string }) {
  return (
    <span className="group/help relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        aria-label={`شرح: ${text}`}
        className="grid h-7 w-7 place-items-center rounded-full text-zinc-500 outline-none transition-[color,background-color,transform] duration-150 hover:bg-zinc-800 hover:text-emerald-300 focus-visible:bg-zinc-800 focus-visible:text-emerald-300 active:scale-[0.97]"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] hidden rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-right text-xs font-medium leading-6 text-zinc-200 shadow-2xl group-hover/help:block group-focus-within/help:block sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-72"
      >
        {text}
      </span>
    </span>
  );
}
