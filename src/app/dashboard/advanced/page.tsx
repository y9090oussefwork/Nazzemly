import { redirect } from 'next/navigation';

export default function SettingsCompatibilityRedirect() {
  redirect('/dashboard/manage?tab=settings');
}