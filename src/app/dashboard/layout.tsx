import { Suspense, type ReactNode } from 'react';
import DashboardShell from './dashboard-shell';

function DashboardShellFallback() {
  return <main className="min-h-[100dvh] bg-zinc-950 p-6"><div className="mx-auto max-w-7xl space-y-5 animate-pulse"><div className="h-14 rounded-2xl bg-zinc-900" /><div className="h-80 rounded-2xl bg-zinc-900" /></div></main>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<DashboardShellFallback />}><DashboardShell>{children}</DashboardShell></Suspense>;
}