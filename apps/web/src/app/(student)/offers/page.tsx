import type { Metadata } from 'next';
import { NearbyOffers } from '@/features/offers/components/nearby-offers';

export const metadata: Metadata = {
  title: 'Student offers',
  description: 'Offers for CampusPin students at places near your college.',
};

export default function OffersPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <NearbyOffers />
    </main>
  );
}
