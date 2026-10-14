'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { FeatureGate, type GatePoint } from '@/components/shared/feature-gate';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';

const POINTS: GatePoint[] = [
  { icon: 'book', title: 'Books & notes', body: 'Last year’s books and notes from seniors.' },
  { icon: 'bike', title: 'Cycles & gear', body: 'Cycles, calculators, lab coats and more.' },
  {
    icon: 'chat',
    title: 'Chat in the app',
    body: 'Talk to the seller; your number stays private.',
  },
  {
    icon: 'shield',
    title: 'Only real students',
    body: 'Every buyer and seller is a verified student.',
  },
];

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
      <FeatureGate
        eyebrow="Student marketplace"
        title="Buy and sell with verified students"
        description="Books, notes, cycles and hostel essentials from students of your college and colleges nearby. Sign in to start."
        points={POINTS}
        image="/images/amenities/stationery.jpg"
        primary={{ href: `${ROUTES.login}?next=${encodeURIComponent(pathname)}`, label: 'Sign in' }}
        secondary={{ href: ROUTES.registerStudent, label: 'Create a free account' }}
      />
    );
  }
  if (!user?.student.verified) {
    return (
      <FeatureGate
        eyebrow="One step left"
        title="Verified students only"
        description="Verify your college to browse, sell and message. It keeps the marketplace free of strangers and scams."
        points={POINTS}
        image="/images/amenities/stationery.jpg"
        primary={{ href: ROUTES.meVerification, label: 'Verify my college', icon: 'graduation' }}
        note="Your ID photo is seen only by our review staff and deleted after review."
      />
    );
  }
  return <>{children}</>;
}
