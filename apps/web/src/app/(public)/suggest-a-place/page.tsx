import type { Metadata } from 'next';
import { PageHero } from '@/components/shared/page-hero';
import { SuggestPlaceGate } from '@/features/submissions/components/suggest-place-gate';
import { BRAND } from '@/constants/brand';

export const metadata: Metadata = {
  title: 'Suggest a place',
  description: `Know a place ${BRAND.name} is missing? Suggest it for staff review.`,
  robots: { index: false, follow: true },
};

export default function SuggestPlacePage() {
  return (
    <main className="flex-1 pb-16">
      <PageHero
        eyebrow="Help your campus"
        eyebrowIcon="plus"
        title={
          <>
            Suggest a <span className="text-accent-600">place</span>
          </>
        }
        lead="Know a mess, PG, library or shop near your college that isn’t listed yet? Tell us about it and we’ll review it."
      />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <SuggestPlaceGate />
      </div>
    </main>
  );
}
