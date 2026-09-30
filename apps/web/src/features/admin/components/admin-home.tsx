'use client';

import type { AdminDashboard, PermissionKey } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { DailyBars, ShareBars } from '@/components/shared/charts';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { adminService } from '@/services/admin.service';
import { can } from '../lib/access';
import { AdminHeader, errorMessage } from './admin-ui';

type SeriesKey = Exclude<keyof AdminDashboard['series'][number], 'day'>;

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
  href,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone: string;
  href?: string;
}) {
  const body = (
    <div className="flex h-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-md">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold text-ink">{value.toLocaleString('en-IN')}</span>
        <span className="block truncate text-sm text-body">{label}</span>
      </span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const CHARTS: ReadonlyArray<{ key: SeriesKey; label: string; color: string }> = [
  { key: 'studentSignups', label: 'Student registrations', color: 'bg-primary-500' },
  { key: 'businessSignups', label: 'Business registrations', color: 'bg-accent-600' },
  { key: 'placesPublished', label: 'Listings published', color: 'bg-amber-600' },
  { key: 'marketplaceListings', label: 'Buy & Sell listings', color: 'bg-violet-600' },
  { key: 'communityPosts', label: 'Community posts', color: 'bg-teal-600' },
  { key: 'businessVerifications', label: 'Businesses verified', color: 'bg-rose-600' },
];

/** The admin home: platform numbers, 30-day activity, verification, and what needs a decision. */
export function AdminHome() {
  const { user } = useSession();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [chart, setChart] = useState<SeriesKey>('studentSignups');

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
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const { totals, queues, series } = data;
  const selected = CHARTS.find((item) => item.key === chart) ?? CHARTS[0]!;
  const chartTotal = series.reduce((sum, day) => sum + day[selected.key], 0);
  const queueItems = (
    [
      {
        label: 'Businesses to verify',
        count: queues.unverifiedBusinesses,
        href: `${ROUTES.adminBusinesses}?verification=PENDING`,
        icon: 'store',
        permission: 'businesses.manage',
      },
      {
        label: 'Places to review',
        count: queues.pendingSubmissions,
        href: `${ROUTES.adminSubmissions}?status=PENDING`,
        icon: 'check',
        permission: 'submissions.review',
      },
      {
        label: 'Open reports',
        count: queues.openReports,
        href: `${ROUTES.adminReports}?status=PENDING`,
        icon: 'flag',
        permission: 'community.moderate',
      },
      {
        label: 'Student verifications',
        count: queues.pendingStudentVerifications,
        href: `${ROUTES.adminVerifications}?status=PENDING`,
        icon: 'graduation',
        permission: 'verifications.review',
      },
      {
        label: 'Hidden reviews',
        count: queues.hiddenReviews,
        href: `${ROUTES.adminReviews}?status=HIDDEN`,
        icon: 'star',
        permission: 'reviews.moderate',
      },
      {
        label: 'Suspended accounts',
        count: queues.suspendedUsers,
        href: `${ROUTES.adminUsers}?status=SUSPENDED`,
        icon: 'ban',
        permission: 'users.read',
      },
    ] satisfies Array<{
      label: string;
      count: number;
      href: string;
      icon: IconName;
      permission: PermissionKey;
    }>
  ).filter((queue) => can(user, queue.permission));

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title={`Welcome, ${user?.name.split(' ')[0] ?? 'admin'}`}
        description="The platform at a glance. Every number is counted from the database."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Kpi
          icon="graduation"
          label="Total students"
          value={totals.students}
          tone="bg-primary-50 text-primary-600"
          href={`${ROUTES.adminUsers}?role=STUDENT`}
        />
        <Kpi
          icon="store"
          label="Total businesses"
          value={totals.businesses}
          tone="bg-accent-50 text-accent-700"
          href={ROUTES.adminBusinesses}
        />
        <Kpi
          icon="shield"
          label="Verified businesses"
          value={totals.verifiedBusinesses}
          tone="bg-success-50 text-success-700"
          href={`${ROUTES.adminBusinesses}?verification=VERIFIED`}
        />
        <Kpi
          icon="clock"
          label="Pending businesses"
          value={totals.pendingBusinesses}
          tone="bg-amber-50 text-amber-600"
          href={`${ROUTES.adminBusinesses}?verification=PENDING`}
        />
        <Kpi
          icon="pin"
          label="Active listings"
          value={totals.livePlaces}
          tone="bg-teal-50 text-teal-600"
          href={ROUTES.adminPlaces}
        />
        <Kpi
          icon="chats"
          label="Community posts"
          value={totals.communityPosts}
          tone="bg-violet-50 text-violet-600"
          href={ROUTES.adminCommunity}
        />
        <Kpi
          icon="tag"
          label="Buy & Sell listings"
          value={totals.marketplaceListings}
          tone="bg-rose-50 text-rose-600"
          href={ROUTES.adminMarketplace}
        />
        <Kpi
          icon="star"
          label="Reviews"
          value={totals.reviews}
          tone="bg-amber-50 text-amber-600"
          href={ROUTES.adminReviews}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title={`${selected.label} — last 30 days`}
            action={
              <select
                aria-label="Chart"
                value={chart}
                onChange={(event) => setChart(event.target.value as SeriesKey)}
                className="h-9 rounded-lg border border-control bg-surface px-2.5 text-sm text-ink"
              >
                {CHARTS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            }
          >
            {chartTotal === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
                <Icon name="chart" className="size-7 text-muted" />
                <p className="font-medium text-ink">Nothing in the last 30 days</p>
                <p className="text-sm text-muted">
                  The chart fills in as {selected.label.toLowerCase()} happen.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-body">
                  {chartTotal.toLocaleString('en-IN')} in total
                </p>
                <DailyBars
                  days={series.map((day) => ({ day: day.day, value: day[selected.key] }))}
                  label={selected.label}
                  color={selected.color}
                />
              </>
            )}
          </Panel>
        </div>
        <Panel title="Business verification">
          {totals.verifiedBusinesses +
            totals.pendingBusinesses +
            totals.rejectedBusinesses +
            totals.suspendedBusinesses ===
          0 ? (
            <p className="text-sm text-muted">No businesses yet.</p>
          ) : (
            <ShareBars
              rows={[
                { label: 'Verified', value: totals.verifiedBusinesses, color: 'bg-success-600' },
                { label: 'Pending', value: totals.pendingBusinesses, color: 'bg-amber-600' },
                { label: 'Rejected', value: totals.rejectedBusinesses, color: 'bg-danger-600' },
                { label: 'Suspended', value: totals.suspendedBusinesses, color: 'bg-neutral-500' },
              ]}
            />
          )}
        </Panel>
      </div>

      {queueItems.length > 0 && (
        <Panel title="Needs your attention">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {queueItems.map((queue) => (
              <li key={queue.label}>
                <Link
                  href={queue.href}
                  className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-subtle"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-lg ${queue.count > 0 ? 'bg-amber-50 text-amber-600' : 'bg-subtle text-muted'}`}
                  >
                    <Icon name={queue.icon} className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-ink">{queue.label}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${queue.count > 0 ? 'bg-ink text-white' : 'bg-subtle text-muted'}`}
                  >
                    {queue.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ['All users', totals.users],
            ['Verified students', totals.verifiedStudents],
            ['Active colleges', totals.activeColleges],
            ['Reviews (7 days)', totals.reviewsLast7Days],
            ['Enquiries (7 days)', totals.enquiriesLast7Days],
            ['Posts (7 days)', totals.communityPostsLast7Days],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xl font-bold text-ink">{value.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
