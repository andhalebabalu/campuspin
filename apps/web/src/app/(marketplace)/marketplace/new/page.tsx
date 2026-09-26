import type { Metadata } from 'next';
import { ListingForm } from '@/features/marketplace/components/listing-form';

export const metadata: Metadata = {
  title: 'Sell something',
  robots: { index: false, follow: false },
};

export default function NewListingPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <ListingForm />
    </div>
  );
}
