'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';

/** Renders `children` only for a signed-in member; otherwise a sign-in prompt that returns here. */
export function RequireSession({
  children,
  title = 'Sign in to continue',
  description = 'This page is for signed-in members.',
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { status } = useSession();
  const pathname = usePathname();

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return (
      <EmptyState
        title={title}
        description={description}
        action={
          <Link
            href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`}
            className="inline-flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white hover:bg-action-hover"
          >
            Sign in
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
