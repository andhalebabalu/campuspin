import type { Metadata } from 'next';
import { MarketplaceModerationScreen } from '@/features/admin/components/marketplace-moderation-screen';
import type { AdminSearchParams } from '@/features/admin/lib/params';

export const metadata: Metadata = { title: 'Marketplace moderation' };

export default async function AdminMarketplacePage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const { reported } = await searchParams;
  return <MarketplaceModerationScreen initialReported={reported === 'true'} />;
}
