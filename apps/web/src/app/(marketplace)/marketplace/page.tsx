import type { Metadata } from 'next';
import { MarketplaceBrowse } from '@/features/marketplace/components/marketplace-browse';

export const metadata: Metadata = {
  title: 'Student marketplace',
  description:
    'Buy and sell books, notes, cycles and hostel essentials with verified students nearby.',
};

export default function MarketplacePage() {
  return <MarketplaceBrowse />;
}
