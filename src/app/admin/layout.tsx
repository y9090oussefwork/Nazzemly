import type { ReactNode } from 'react';

// Keep the super-admin area dynamic so deployments cannot leave stale action
// references in a cached HTML response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
