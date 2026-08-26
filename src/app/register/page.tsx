import ReferralRegistration from './referral-registration';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return <ReferralRegistration referralCode={ref || ''} />;
}
