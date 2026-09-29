import type { Metadata } from 'next';
import { OffersSection } from '@/features/business-dashboard/sections/panels';

export const metadata: Metadata = { title: 'Offers' };

export default function Page() {
  return <OffersSection />;
}
