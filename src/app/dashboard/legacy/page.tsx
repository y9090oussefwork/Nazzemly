import { redirect } from 'next/navigation';

export default function LegacyCompatibilityRedirect() {
  redirect('/dashboard');
}