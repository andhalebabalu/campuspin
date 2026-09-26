import { REVIEW_STATUSES } from '@platform/contracts';
import type { Metadata } from 'next';
import { ReviewsScreen } from '@/features/admin/components/reviews-screen';
import { pickParam, type AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Reviews' };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { status } = await searchParams;
  return <ReviewsScreen initialStatus={pickParam(REVIEW_STATUSES, status)} />;
}
