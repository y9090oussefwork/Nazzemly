import MerchantOwnerProfile from './merchant-owner-profile';

export const dynamic = 'force-dynamic';

export default async function MerchantOwnerProfilePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <MerchantOwnerProfile tenantId={tenantId} />;
}
