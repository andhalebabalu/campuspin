import { REPORT_STATUSES } from '@platform/contracts';
import type { Metadata } from 'next';
import { ReportsScreen } from '@/features/admin/components/reports-screen';
import { pickParam, type AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Reports' };

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { status } = await searchParams;
  // The queue opens on open reports; `?status=all` shows everything.
  const initial = status === undefined ? 'PENDING' : pickParam(REPORT_STATUSES, status);
  return <ReportsScreen initialStatus={initial} />;
}
