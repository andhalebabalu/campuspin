'use client';

import { FeatureGate } from '@/components/shared/feature-gate';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { SuggestPlaceForm } from './suggest-place-form';

/**
 * Suggesting a place is the first page that genuinely needs a session to be USED, not just read for
 * display (see the "no per-request 401 -> refresh -> retry" note in the README): a signed-out visitor
 * is sent to sign in, with `?next=` bringing them straight back here afterwards.
 */
export function SuggestPlaceGate() {
  const { status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <FeatureGate
        eyebrow="Suggest a place"
        title="Sign in to suggest a place"
        description="Suggesting a place is only for signed-in accounts, so our staff know who to follow up with."
        points={[
          {
            icon: 'pin',
            title: 'Add what is missing',
            body: 'A mess, PG, library or shop near your college.',
          },
          {
            icon: 'userCheck',
            title: 'Reviewed by staff',
            body: 'We check every suggestion before it goes live.',
          },
          {
            icon: 'users',
            title: 'Help your juniors',
            body: 'The next batch finds it on day one.',
          },
          { icon: 'bell', title: 'Hear back', body: 'You are told when your place is approved.' },
        ]}
        image="/images/amenities/mess.jpg"
        primary={{
          href: `${ROUTES.login}?next=${encodeURIComponent(ROUTES.suggestPlace)}`,
          label: 'Sign in',
        }}
        secondary={{ href: ROUTES.register, label: 'Create a free account' }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <SuggestPlaceForm />
    </div>
  );
}
