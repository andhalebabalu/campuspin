import { VERIFICATION_STATUSES } from '@platform/contracts';
import type { Metadata } from 'next';
import { BusinessesScreen } from '@/features/admin/components/businesses-screen';
import { pickParam, type AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Businesses' };

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { verification } = await searchParams;
  return <BusinessesScreen initialVerification={pickParam(VERIFICATION_STATUSES, verification)} />;
}
