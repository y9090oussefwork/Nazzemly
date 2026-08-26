export default function CustomerProfileLoading() {
  return <main className="mx-auto max-w-7xl space-y-5" dir="rtl"><div className="h-10 w-44 animate-pulse rounded-lg bg-zinc-800" />{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/45" />)}</main>;
}
