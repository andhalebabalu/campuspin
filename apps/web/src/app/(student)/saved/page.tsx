import type { Metadata } from 'next';
import { PageHero } from '@/components/shared/page-hero';
import { RequireSession } from '@/features/account/components/require-session';
import { SavedPlaces } from '@/features/services/components/saved-places';

export const metadata: Metadata = {
  title: 'Saved places',
  robots: { index: false, follow: false },
};

export default function SavedPage() {
  return (
    <main className="flex-1 pb-16">
      <PageHero
        compact
        eyebrow="Your account"
        eyebrowIcon="bookmark"
        title={
          <>
            Saved <span className="text-accent-600">places</span>
          </>
        }
        lead="The places you bookmarked, all in one list."
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <RequireSession title="Sign in to see your saved places">
          <SavedPlaces />
        </RequireSession>
      </div>
    </main>
  );
}
