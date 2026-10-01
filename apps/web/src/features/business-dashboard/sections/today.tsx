'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessCapability, BusinessSummary } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import type { IconName } from '@/components/ui/icon';
import { commerceService } from '@/services/commerce.service';
import { DASHBOARD } from '../routes';
import {
  EmptyBlock,
  PaymentBadge,
  Pill,
  QuickAction,
  StatCard,
  Tabs,
  dateTime,
  rupees,
} from '../ui';
import { useWorkspace } from '../workspace';

type Range = 'today' | '7d' | '30d';
const RANGE_LABEL: Record<Range, string> = {
  today: "Today's",
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

interface Card {
  key: string;
  icon: IconName;
  label: string;
  value: (summary: BusinessSummary) => number | string | null;
  tone: string;
  href?: string;
}

/**
 * Every card the overview can show, with the section of the summary it reads. A card whose section
 * is null (the business lacks that capability) never appears, so each business sees only what
 * matters to it.
 */
const CARDS: readonly Card[] = [
  {
    key: 'orders',
    icon: 'cart',
    label: 'Orders',
    value: (s) => s.orders?.total ?? null,
    tone: 'bg-primary-50 text-primary-600',
    href: DASHBOARD.orders,
  },
  {
    key: 'pending',
    icon: 'clock',
    label: 'Pending',
    value: (s) => s.orders?.pending ?? null,
    tone: 'bg-amber-50 text-amber-600',
    href: DASHBOARD.orders,
  },
  {
    key: 'completed',
    icon: 'check',
    label: 'Completed',
    value: (s) => s.orders?.completed ?? null,
    tone: 'bg-success-50 text-success-700',
    href: DASHBOARD.orders,
  },
  {
    key: 'cancelled',
    icon: 'ban',
    label: 'Cancelled',
    value: (s) => s.orders?.cancelled ?? null,
    tone: 'bg-danger-50 text-danger-700',
    href: DASHBOARD.orders,
  },
  {
    key: 'revenue',
    icon: 'trending',
    label: 'Revenue (completed)',
    value: (s) => (s.revenue ? rupees(s.revenue.completed) : null),
    tone: 'bg-accent-50 text-accent-700',
  },
  {
    key: 'paid',
    icon: 'card',
    label: 'Paid',
    value: (s) => (s.revenue ? rupees(s.revenue.paid) : null),
    tone: 'bg-accent-50 text-accent-700',
    href: DASHBOARD.payments,
  },
  {
    key: 'unpaid',
    icon: 'card',
    label: 'Completed, not paid',
    value: (s) => s.payments?.unpaidCompleted ?? null,
    tone: 'bg-amber-50 text-amber-600',
    href: DASHBOARD.payments,
  },
  {
    key: 'invoices',
    icon: 'file',
    label: 'Invoices issued',
    value: (s) => s.invoices?.issued ?? null,
    tone: 'bg-violet-50 text-violet-600',
    href: DASHBOARD.invoices,
  },
  {
    key: 'tables',
    icon: 'utensils',
    label: 'Tables in use',
    value: (s) => (s.tables ? `${s.tables.occupied}/${s.tables.total}` : null),
    tone: 'bg-teal-50 text-teal-600',
    href: DASHBOARD.tables,
  },
  {
    key: 'enquiries',
    icon: 'chat',
    label: 'Enquiries',
    value: (s) => s.enquiries?.total ?? null,
    tone: 'bg-primary-50 text-primary-600',
    href: DASHBOARD.enquiries,
  },
  {
    key: 'enquiriesNew',
    icon: 'bell',
    label: 'Unanswered enquiries',
    value: (s) => s.enquiries?.pending ?? null,
    tone: 'bg-amber-50 text-amber-600',
    href: DASHBOARD.enquiries,
  },
  {
    key: 'upcoming',
    icon: 'calendar',
    label: 'Upcoming bookings',
    value: (s) => s.bookings?.upcoming ?? null,
    tone: 'bg-primary-50 text-primary-600',
    href: DASHBOARD.bookings,
  },
  {
    key: 'bookingsPending',
    icon: 'clock',
    label: 'Bookings to confirm',
    value: (s) => s.bookings?.pending ?? null,
    tone: 'bg-amber-50 text-amber-600',
    href: DASHBOARD.bookings,
  },
  {
    key: 'bookingsDone',
    icon: 'check',
    label: 'Completed bookings',
    value: (s) => s.bookings?.completed ?? null,
    tone: 'bg-success-50 text-success-700',
    href: DASHBOARD.bookings,
  },
  {
    key: 'requests',
    icon: 'wrench',
    label: 'Open requests',
    value: (s) => s.requests?.open ?? null,
    tone: 'bg-violet-50 text-violet-600',
    href: DASHBOARD.requests,
  },
];

const QUICK: ReadonlyArray<{
  requires: BusinessCapability[];
  href: string;
  icon: IconName;
  label: string;
}> = [
  { requires: ['ORDER_MANAGEMENT'], href: DASHBOARD.orders, icon: 'cart', label: 'Open orders' },
  { requires: ['TABLE_ORDER'], href: DASHBOARD.tables, icon: 'utensils', label: 'Tables' },
  {
    requires: ['ORDER_MANAGEMENT'],
    href: `${DASHBOARD.services}?view=daily`,
    icon: 'receipt',
    label: "Today's menu",
  },
  { requires: ['INVOICE'], href: DASHBOARD.invoices, icon: 'file', label: 'Invoices' },
  {
    requires: ['BOOKING', 'APPOINTMENT'],
    href: DASHBOARD.bookings,
    icon: 'calendar',
    label: 'Bookings',
  },
  { requires: ['ENQUIRY'], href: DASHBOARD.enquiries, icon: 'chat', label: 'Enquiries' },
  { requires: ['SERVICE_REQUEST'], href: DASHBOARD.requests, icon: 'wrench', label: 'Requests' },
];

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "What does this business need to see today?", built from its capabilities. */
export function TodayPanel() {
  const { can, capabilities } = useWorkspace();
  const [range, setRange] = useState<Range>('today');
  const [state, setState] = useState<{
    range: Range;
    data?: BusinessSummary;
    error?: string;
  } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .summary(range, controller.signal)
      .then((result) => setState({ range, data: result.data }))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setState({
            range,
            error:
              caught instanceof ApiClientError ? caught.message : 'Could not load your numbers.',
          });
      });
    return () => controller.abort();
  }, [range, tick]);

  if (capabilities.capabilities.length === 0) return null; // suspended: nothing to run
  const current = state?.range === range ? state : null;
  const summary = current?.data;
  const cards = summary ? CARDS.filter((card) => card.value(summary) !== null) : [];
  const quick = QUICK.filter((action) => can(...action.requires));

  return (
    <>
      {quick.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {quick.map((action) => (
            <QuickAction
              key={action.href}
              href={action.href}
              icon={action.icon}
              label={action.label}
            />
          ))}
        </div>
      )}
      <Section
        title={`${RANGE_LABEL[range]} activity`}
        action={
          <div className="w-full sm:w-auto [&>div]:mb-0">
            <Tabs
              tabs={[
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 days' },
                { id: '30d', label: '30 days' },
              ]}
              value={range}
              onChange={setRange}
              label="Range"
            />
          </div>
        }
      >
        {current?.error ? (
          <ErrorState message={current.error} onRetry={() => setTick((t) => t + 1)} />
        ) : !summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <EmptyBlock
            icon="chart"
            title="No data available"
            text="Numbers appear here once students use your business on CampusPin."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((card) => (
              <StatCard
                key={card.key}
                icon={card.icon}
                label={card.label}
                value={card.value(summary) ?? 0}
                tone={card.tone}
                href={card.href}
              />
            ))}
          </div>
        )}
      </Section>

      {can('ORDER_MANAGEMENT') && summary && (
        <Section
          title="Recent orders"
          action={
            <Link href={DASHBOARD.orders} className="text-sm font-semibold text-action">
              All orders →
            </Link>
          }
        >
          {summary.recentOrders.length === 0 ? (
            <EmptyBlock
              icon="cart"
              title="No orders yet"
              text="Switch on ordering in Services & menu, then share your page or put QR codes on your tables."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={DASHBOARD.order(order.id)}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface p-3.5 shadow-xs hover:shadow-md"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {order.code} · {order.customer}
                      </span>
                      <span className="block text-xs text-muted">
                        {dateTime.format(new Date(order.createdAt))}
                      </span>
                    </span>
                    <Pill
                      tone={
                        order.status === 'COMPLETED'
                          ? 'green'
                          : order.status === 'CANCELLED' || order.status === 'REJECTED'
                            ? 'red'
                            : order.status === 'PENDING'
                              ? 'amber'
                              : 'blue'
                      }
                    >
                      {order.statusLabel}
                    </Pill>
                    {can('PAYMENT') && <PaymentBadge status={order.paymentStatus} />}
                    {order.invoice && <Pill tone="grey">{order.invoice.number}</Pill>}
                    <span className="w-20 text-right font-bold text-ink">
                      {rupees(order.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
