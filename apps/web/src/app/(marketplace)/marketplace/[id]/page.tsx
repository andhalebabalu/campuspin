import type { Metadata } from 'next';
import { ListingDetail } from '@/features/marketplace/components/listing-detail';

export const metadata: Metadata = { title: 'Listing', robots: { index: false, follow: false } };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetail listingId={id} />;
}
