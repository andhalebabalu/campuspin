'use client';

import { ApiClientError } from '@platform/api-client';
import { INSIGHT_RANGES, type BusinessInsights, type InsightRange } from '@platform/contracts';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/shared/skeleton';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { ordersService } from '@/services/orders.service';

const RANGE_LABELS: Record<InsightRange, string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
};
const MENU_LABELS: Record<BusinessInsights['todaysMenu'], string> = {
  NONE: 'Not added',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  REMOVED: 'Removed',
};

export type DashboardTarget =
  'orders' | 'requests' | 'bookings' | 'menu' | 'offers' | 'reviews' | 'qr';

function Tile({
  icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
}) {
  const body = (
    <Card hover={!!onClick} className="flex h-full flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-sm text-body">
        <Icon name={icon} className="size-4 text-accent-600" />
        {label}
      </span>
      <span className="text-2xl font-bold text-ink">{value}</span>
      {detail && <span className="text-xs text-muted">{detail}</span>}
    </Card>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left">
      {body}
    </button>
  ) : (
    body
  );
}

/** Real counts for today / 7 / 30 days: orders, requests, bookings, menu, offers, views, scans, reviews. */
export function InsightsPanel({ onOpen }: { onOpen: (target: DashboardTarget) => void }) {
  const [range, setRange] = useState<InsightRange>('today');
  const [data, setData] = useState<{ range: InsightRange; value: BusinessInsights } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const current = data?.range === range ? data.value : null;

  useEffect(() => {
    const controller = new AbortController();
    ordersService
      .insights(range, controller.signal)
      .then((result) => {
        setData({ range, value: result.data });
        setFailed(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setFailed(caught instanceof ApiClientError ? caught.message : 'Could not load numbers.');
      });
    return () => controller.abort();
  }, [range]);

  return (
    <section className="flex flex-col gap-3" aria-label="Business numbers">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">At a glance</h2>
        <div className="flex gap-1 rounded-full bg-subtle p-1 text-xs font-semibold">
          {INSIGHT_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`rounded-full px-3 py-1 ${range === value ? 'bg-surface text-ink shadow-xs' : 'text-muted'}`}
            >
              {RANGE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>
      {failed ? (
        <p className="text-sm text-danger-700">{failed}</p>
      ) : !current ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            icon="utensils"
            label="Orders"
            value={String(current.orders)}
            detail={`${current.activeOrders} in progress now`}
            onClick={() => onOpen('orders')}
          />
          <Tile
            icon="bell"
            label="Requests"
            value={String(current.requests)}
            detail={`${current.pendingRequests} waiting now`}
            onClick={() => onOpen('requests')}
          />
          <Tile
            icon="calendar"
            label="Bookings"
            value={String(current.bookings)}
            detail={`${current.upcomingBookings} upcoming`}
            onClick={() => onOpen('bookings')}
          />
          <Tile
            icon="book"
            label="Today's menu"
            value={MENU_LABELS[current.todaysMenu]}
            onClick={() => onOpen('menu')}
          />
          <Tile
            icon="tag"
            label="Offer redemptions"
            value={String(current.offerRedemptions)}
            detail={`${current.activeOffers} active offers`}
            onClick={() => onOpen('offers')}
          />
          <Tile
            icon="users"
            label="Profile views"
            value={String(current.profileViews)}
            detail={`${current.savedBy} students saved you`}
          />
          <Tile
            icon="qr"
            label="QR scans"
            value={String(current.qrScans)}
            onClick={() => onOpen('qr')}
          />
          <Tile
            icon="star"
            label="New reviews"
            value={String(current.reviews)}
            onClick={() => onOpen('reviews')}
          />
        </div>
      )}
    </section>
  );
}
