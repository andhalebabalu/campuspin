import { SUBMISSION_STATUSES } from '@platform/contracts';
import type { Metadata } from 'next';
import { SubmissionsScreen } from '@/features/admin/components/submissions-screen';
import { pickParam, type AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Submissions' };

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { status } = await searchParams;
  return <SubmissionsScreen initialStatus={pickParam(SUBMISSION_STATUSES, status)} />;
}
