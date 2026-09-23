'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
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
      <EmptyState
        title="Sign in to suggest a place"
        description="Suggesting a place is only for signed-in accounts, so staff know who to follow up with."
        action={
          <Link
            href={`${ROUTES.login}?next=${encodeURIComponent(ROUTES.suggestPlace)}`}
            className="inline-flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white transition-colors hover:bg-action-hover"
          >
            Sign in
          </Link>
        }
      />
    );
  }

  return <SuggestPlaceForm />;
}
