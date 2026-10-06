import type { Metadata } from 'next';
import { SuggestPlaceGate } from '@/features/submissions/components/suggest-place-gate';
import { BRAND } from '@/constants/brand';

export const metadata: Metadata = {
  title: 'Suggest a place',
  description: `Know a place ${BRAND.name} is missing? Suggest it for staff review.`,
  robots: { index: false, follow: true },
};

export default function SuggestPlacePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Suggest a place</h1>
        <p className="text-body">
          Know a mess, PG, library or shop near your college that isn&apos;t listed yet? Tell us
          about it and we&apos;ll review it.
        </p>
      </div>

      <SuggestPlaceGate />
    </main>
  );
}
