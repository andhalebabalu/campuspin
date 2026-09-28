import type { Metadata } from 'next';
import { RequireSession } from '@/features/account/components/require-session';
import { SavedPlaces } from '@/features/services/components/saved-places';

export const metadata: Metadata = {
  title: 'Saved places',
  robots: { index: false, follow: false },
};

export default function SavedPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Saved places</h1>
      <RequireSession title="Sign in to see your saved places">
        <SavedPlaces />
      </RequireSession>
    </main>
  );
}
