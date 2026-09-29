import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/app-shell';
import { DASHBOARD } from '@/features/business-dashboard/routes';
import { SuggestPlaceForm } from '@/features/submissions/components/suggest-place-form';

export const metadata: Metadata = { title: 'Add a listing' };

export default function NewListingPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={DASHBOARD.listings}
        className="mb-4 inline-block text-sm font-medium text-action hover:text-action-hover"
      >
        ← Back to listings
      </Link>
      <PageHeader
        title="Add a listing"
        description="Drop the pin on your exact entrance so students can find you, and add a few photos. Our team checks every new listing before it goes live, usually within a day."
      />
      <SuggestPlaceForm variant="business" />
    </div>
  );
}
