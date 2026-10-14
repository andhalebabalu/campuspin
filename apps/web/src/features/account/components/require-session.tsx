'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
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
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-3xl border border-line bg-surface px-6 py-10 text-center shadow-[0_24px_60px_-28px_rgb(4_35_73/0.3)]">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Icon name="user" className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-extrabold text-primary-800">{title}</h2>
          <p className="text-sm text-body">{description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={`${ROUTES.signIn}?next=${encodeURIComponent(pathname)}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-accent-600 px-6 text-sm font-semibold text-white shadow-md shadow-accent-600/25 transition-colors hover:bg-accent-650"
          >
            Sign in
          </Link>
          <Link
            href={ROUTES.register}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-primary-800/70 px-6 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50"
          >
            Create a free account
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
