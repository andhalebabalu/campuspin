import type { Metadata } from 'next';
import Link from 'next/link';
import { BusinessGate } from '@/features/business/components/business-gate';
import { SuggestPlaceForm } from '@/features/submissions/components/suggest-place-form';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Add a listing',
  robots: { index: false, follow: false },
};

export default function NewListingPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={ROUTES.dashboard}
        className="mb-6 inline-block text-sm font-medium text-action hover:text-action-hover"
      >
        ← Back to dashboard
      </Link>
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Add a listing</h1>
        <p className="text-body">
          Drop the pin on your exact entrance so students can find you, and add a few photos. Our
          team checks every new listing before it goes live, usually within a day.
        </p>
      </div>

      <BusinessGate next={ROUTES.dashboardNewListing}>
        <SuggestPlaceForm variant="business" />
      </BusinessGate>
    </main>
  );
}
