'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';

const LINK =
  'inline-flex h-10 items-center rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover';

/**
 * The marketplace is for verified students only: buyers and sellers are always real students of a
 * known college. Everyone else sees why, and how to get in. The API enforces this regardless.
 */
export function VerifiedGate({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const pathname = usePathname();

  if (status === 'loading') return <Skeleton className="h-96 w-full" />;
  if (status === 'unauthenticated') {
    return (
      <EmptyState
        title="Buy and sell with verified students"
        description="Books, notes, cycles, hostel essentials — from students of your college and colleges nearby. Sign in to continue."
        action={
          <Link href={`${ROUTES.login}?next=${encodeURIComponent(pathname)}`} className={LINK}>
            Sign in
          </Link>
        }
      />
    );
  }
  if (!user?.student.verified) {
    return (
      <EmptyState
        title="Verified students only"
        description="Verify your college to browse, sell and message. It keeps the marketplace free of strangers and scams."
        action={
          <Link href={ROUTES.meVerification} className={LINK}>
            Verify my college
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
