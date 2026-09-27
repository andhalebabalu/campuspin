import type { Metadata } from 'next';
import { ListingLimitsScreen } from '@/features/admin/components/listing-limits-screen';

export const metadata: Metadata = { title: 'Listing limits' };

export default function AdminListingLimitsPage() {
  return <ListingLimitsScreen />;
}
