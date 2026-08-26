import { Suspense, type ReactNode } from 'react';
import DashboardShell from './dashboard-shell';

// Authenticated pages must never be cached by a CDN. Besides protecting tenant
// data, this prevents browsers from submitting stale Server Action references
// after a deployment.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function DashboardShellFallback() {
  return <main className="min-h-[100dvh] bg-zinc-950 p-6"><div className="mx-auto max-w-7xl space-y-5 animate-pulse"><div className="h-14 rounded-2xl bg-zinc-900" /><div className="h-80 rounded-2xl bg-zinc-900" /></div></main>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<DashboardShellFallback />}><DashboardShell>{children}</DashboardShell></Suspense>;
}
