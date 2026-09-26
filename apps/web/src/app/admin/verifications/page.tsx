import { STUDENT_VERIFICATION_STATUSES } from '@platform/contracts';
import type { Metadata } from 'next';
import { VerificationsScreen } from '@/features/admin/components/verifications-screen';
import { pickParam, type AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Student verifications' };

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { status } = await searchParams;
  // The review queue opens on pending requests; `?status=all` shows everything.
  const initial =
    status === undefined ? 'PENDING' : pickParam(STUDENT_VERIFICATION_STATUSES, status);
  return <VerificationsScreen initialStatus={initial} />;
}
