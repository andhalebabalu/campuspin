import type { Metadata } from 'next';
import { ListingForm } from '@/features/marketplace/components/listing-form';

export const metadata: Metadata = {
  title: 'Edit listing',
  robots: { index: false, follow: false },
};

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <ListingForm listingId={id} />
    </div>
  );
}
