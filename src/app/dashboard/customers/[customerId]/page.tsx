import CustomerProfile from '../customer-profile';

export default async function CustomerProfilePage({ params }: PageProps<'/dashboard/customers/[customerId]'>) {
  const { customerId } = await params;
  return <CustomerProfile customerId={customerId} />;
}
