import type { Metadata } from 'next';
import { MyListings } from '@/features/marketplace/components/my-listings';

export const metadata: Metadata = { title: 'My listings', robots: { index: false, follow: false } };

export default function MyListingsPage() {
  return <MyListings />;
}
