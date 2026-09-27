'use client';

import type { ActivityOverview, ActivityPeriod } from '@platform/contracts';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { adminAnalyticsService } from '@/services/admin-analytics.service';
import { ActivityChart } from './activity-chart';
import { AdminHeader, errorMessage } from './admin-ui';

const number = (value: number) => value.toLocaleString('en-IN');
const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Who uses CampusPin: visitors (every device, signed in or not), active members, how they split
 * between web and mobile and students and businesses, and the ratios that say how engaged they are.
 */
export function AnalyticsScreen() {
  const [data, setData] = useState<ActivityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    adminAnalyticsService
      .activity(controller.signal)
      .then((result) => {
        setData(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(caught, 'Could not load the analytics.'));
      })
      .finally(() => setRefreshing(false));
    return () => controller.abort();
  }, [tick]);

  const refresh = () => {
    setRefreshing(true);
    setTick((value) => value + 1);
  };

  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return <Skeleton className="h-[32rem] w-full" />;

  const [today, week, month] = data.periods as [ActivityPeriod, ActivityPeriod, ActivityPeriod];

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Analytics"
        description="Visitors are devices (web and app), counted once a day; active members are signed-in students and businesses. India time."
        action={
          <Button variant="secondary" size="sm" loading={refreshing} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Online now"
          value={number(data.onlineNow)}
          note="Members active in the last 5 minutes"
          live
        />
        <Tile
          label="Visitors today"
          value={number(today.visitors)}
          note={`${number(today.webVisitors)} web · ${number(today.mobileVisitors)} app`}
        />
        <Tile
          label="Active members today"
          value={number(today.activeUsers)}
          note={`${number(today.activeStudents)} students · ${number(today.activeBusinesses)} businesses`}
        />
        <Tile
          label="Members"
          value={number(data.totals.members)}
          note={`${number(data.totals.students)} students · ${number(data.totals.businesses)} businesses`}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-ink">Last 30 days</h2>
        <ActivityChart days={data.daily} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Ratio
          label="Active rate"
          value={data.ratios.activeRate30d}
          detail={`${number(month.activeUsers)} of ${number(data.totals.members)} members were active in the last 30 days.`}
        />
        <Ratio
          label="Stickiness (daily ÷ monthly active)"
          value={data.ratios.stickiness}
          detail="How often members come back: 100% would mean everyone is active every day."
        />
        <Ratio
          label="Signed-in visitors"
          value={data.ratios.signedInShare30d}
          detail={`${number(month.visitors - month.guestVisitors)} of ${number(month.visitors)} visitors in 30 days were signed in.`}
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-subtle text-left text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Period</th>
              <th className="px-4 py-2.5 text-right font-medium">Visitors</th>
              <th className="px-4 py-2.5 text-right font-medium">Web</th>
              <th className="px-4 py-2.5 text-right font-medium">Mobile app</th>
              <th className="px-4 py-2.5 text-right font-medium">Guests</th>
              <th className="px-4 py-2.5 text-right font-medium">Active members</th>
              <th className="px-4 py-2.5 text-right font-medium">Students</th>
              <th className="px-4 py-2.5 text-right font-medium">Businesses</th>
            </tr>
          </thead>
          <tbody>
            {[today, week, month].map((row) => (
              <tr key={row.key} className="border-t border-line text-ink">
                <td className="px-4 py-2.5 font-medium">{row.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{number(row.visitors)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{number(row.webVisitors)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {number(row.mobileVisitors)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{number(row.guestVisitors)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{number(row.activeUsers)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {number(row.activeStudents)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {number(row.activeBusinesses)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">
        Updated{' '}
        {new Date(data.generatedAt).toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
        })}
        . A device counts once per day; the same person on the web and the app counts as two
        visitors but one active member.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  live = false,
}: {
  label: string;
  value: string;
  note: string;
  live?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="inline-flex items-center gap-2 text-sm text-body">
        {live && <span aria-hidden className="size-2 animate-pulse rounded-full bg-success-600" />}
        {label}
      </span>
      <span className="text-3xl font-bold text-ink tabular-nums">{value}</span>
      <span className="text-xs text-muted">{note}</span>
    </Card>
  );
}

function Ratio({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="text-sm text-body">{label}</span>
      <span className="text-2xl font-bold text-ink tabular-nums">{percent(value)}</span>
      <div className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden>
        <div
          className="h-full rounded-full bg-action"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted">{detail}</span>
    </Card>
  );
}
