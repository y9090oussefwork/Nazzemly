export default function RenewalsLoading() {
  return (
    <main className="space-y-6" dir="rtl" aria-busy="true">
      <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-zinc-950/70" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-zinc-950/70" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-white/10 bg-zinc-950/70" />
    </main>
  );
}
