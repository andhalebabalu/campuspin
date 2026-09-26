'use client';

import type { AdminDashboard, PermissionKey } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { adminService } from '@/services/admin.service';
import { can } from '../lib/access';
import { AdminHeader, errorMessage } from './admin-ui';

interface Queue {
  label: string;
  detail: string;
  count: number;
  href: string;
  icon: IconName;
  permission: PermissionKey;
}

/** The admin home: what needs a decision (linked to its screen), then platform totals. */
export function AdminHome() {
  const { user } = useSession();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    adminService
      .dashboard(controller.signal)
      .then((result) => {
        setData(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(caught, 'Could not load the overview.'));
      });
    return () => controller.abort();
  }, [reload]);

  if (error) return <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />;
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const queues = (
    [
      {
        label: 'Student verifications',
        detail: 'ID photos waiting for a decision',
        count: data.queues.pendingStudentVerifications,
        href: `${ROUTES.adminVerifications}?status=PENDING`,
        icon: 'graduation',
        permission: 'verifications.review' as const,
      },
      {
        label: 'Places to review',
        detail: 'Student suggestions and business listings',
        count: data.queues.pendingSubmissions,
        href: `${ROUTES.adminSubmissions}?status=PENDING`,
        icon: 'check',
        permission: 'submissions.review' as const,
      },
      {
        label: 'Hidden reviews',
        detail: 'Restore them or remove them for good',
        count: data.queues.hiddenReviews,
        href: `${ROUTES.adminReviews}?status=HIDDEN`,
        icon: 'star',
        permission: 'reviews.moderate' as const,
      },
      {
        label: 'Unverified businesses',
        detail: 'Check and verify business accounts',
        count: data.queues.unverifiedBusinesses,
        href: `${ROUTES.adminBusinesses}?verification=PENDING`,
        icon: 'store',
        permission: 'businesses.manage' as const,
      },
      {
        label: 'Suspended accounts',
        detail: 'Review and reactivate',
        count: data.queues.suspendedUsers,
        href: `${ROUTES.adminUsers}?status=SUSPENDED`,
        icon: 'shield',
        permission: 'users.read' as const,
      },
    ] satisfies Queue[]
  ).filter((queue) => can(user, queue.permission));

  const totals: Array<[string, number]> = [
    ['Users', data.totals.users],
    ['Students', data.totals.students],
    ['Verified students', data.totals.verifiedStudents],
    ['Businesses', data.totals.businesses],
    ['Live places', data.totals.livePlaces],
    ['Active colleges', data.totals.activeColleges],
    ['Reviews (7 days)', data.totals.reviewsLast7Days],
    ['Enquiries (7 days)', data.totals.enquiriesLast7Days],
  ];

  return (
    <div className="flex flex-col gap-8">
      <AdminHeader
        title={`Welcome, ${user?.name.split(' ')[0] ?? 'admin'}`}
        description="What needs your attention today."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {queues.map((queue) => (
          <Link key={queue.label} href={queue.href}>
            <Card hover className="flex h-full items-start gap-4 p-5">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${queue.count > 0 ? 'bg-accent-50 text-accent-700' : 'bg-subtle text-muted'}`}
              >
                <Icon name={queue.icon} className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-3xl font-bold text-ink">{queue.count}</span>
                <span className="font-medium text-ink">{queue.label}</span>
                <span className="text-sm text-muted">{queue.detail}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Platform</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {totals.map(([label, value]) => (
            <Card key={label} className="flex flex-col gap-0.5 p-4">
              <span className="text-2xl font-bold text-ink">{value}</span>
              <span className="text-xs text-muted">{label}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
