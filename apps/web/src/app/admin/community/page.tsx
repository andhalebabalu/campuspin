import type { Metadata } from 'next';
import { CommunityModerationScreen } from '@/features/admin/components/community-moderation-screen';
import type { AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Community moderation' };

export default async function AdminCommunityPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { reported } = await searchParams;
  return <CommunityModerationScreen initialReported={reported === 'true'} />;
}
