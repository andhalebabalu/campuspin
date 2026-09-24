'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';

const LINK_CLASSES =
  'inline-flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white transition-colors hover:bg-action-hover';

/**
 * Shows its children only to a signed-in business owner. This is UX only: every `/business/*` API
 * call is checked by the server, which is what actually protects the data.
 */
export function BusinessGate({ next, children }: { next: string; children: ReactNode }) {
  const { status, user } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <EmptyState
        title="Sign in to your business account"
        description="Your dashboard shows your listings, student enquiries and reviews."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={`${ROUTES.login}?next=${encodeURIComponent(next)}`}
              className={LINK_CLASSES}
            >
              Sign in
            </Link>
            <Link
              href={ROUTES.registerBusiness}
              className="inline-flex h-11 items-center justify-center rounded-md border border-control px-5 text-sm font-medium text-ink hover:bg-subtle"
            >
              Create a business account
            </Link>
          </div>
        }
      />
    );
  }

  if (!user.roles.includes('BUSINESS_OWNER')) {
    return (
      <EmptyState
        title="This dashboard is for business accounts"
        description="You're signed in with a student account. To list a business, sign out and create a business account."
        action={
          <Link href={ROUTES.search} className={LINK_CLASSES}>
            Discover places instead
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
