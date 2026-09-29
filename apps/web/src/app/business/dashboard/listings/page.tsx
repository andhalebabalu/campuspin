import type { Metadata } from 'next';
import { ListingsSection } from '@/features/business-dashboard/sections/panels';

export const metadata: Metadata = { title: 'Listings' };

export default function Page() {
  return <ListingsSection />;
}
