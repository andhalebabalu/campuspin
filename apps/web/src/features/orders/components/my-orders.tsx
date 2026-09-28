'use client';

import { ApiClientError } from '@platform/api-client';
import type { Order, PageMeta } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { ordersService } from '@/services/orders.service';
import { rupees } from '../lib/use-cart';
import { statusTone } from './order-tracking';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function OrderCard({ order }: { order: Order }) {
  const count = order.items.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <Link href={ROUTES.order(order.id)} className="block">
      <Card hover className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{order.place.name}</p>
          <p className="text-sm text-body">
            {order.code} · {count} {count === 1 ? 'item' : 'items'} · {rupees(order.total)}
            {order.table ? ` · ${order.table}` : ''}
          </p>
          <p className="text-xs text-muted">{dateFormat.format(new Date(order.createdAt))}</p>
        </div>
        <Badge tone={statusTone(order.status)}>{order.statusLabel}</Badge>
      </Card>
    </Link>
  );
}

type Tab = 'food' | 'print';

/**
 * The student's orders hub. Food and print orders here; bookings, service requests and offer codes
 * are added as tabs by `extraTabs`.
 */
export function MyOrders({
  extraTabs = [],
}: {
  extraTabs?: Array<{ id: string; label: string; render: () => ReactNode }>;
}) {
  const [tab, setTab] = useState<string>('food');
  const [orders, setOrders] = useState<{
    key: string;
    items: Order[];
    meta: PageMeta | null;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const kind = tab === 'print' ? 'PRINT' : 'FOOD';
  const key = `${tab}|${page}`;
  const current = orders?.key === key ? orders : null;

  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    if (tab !== 'food' && tab !== 'print') return;
    const controller = new AbortController();
    ordersService
      .myOrders({ kind, page }, controller.signal)
      .then((result) => {
        setOrders({ key, items: result.data, meta: result.meta ?? null });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your orders.' },
        );
      });
    return () => controller.abort();
  }, [tab, kind, page, key, reload]);

  const tabs: Array<{ id: string; label: string }> = [
    { id: 'food' as Tab, label: 'Food orders' },
    { id: 'print' as Tab, label: 'Print orders' },
    ...extraTabs.map(({ id, label }) => ({ id, label })),
  ];
  const extra = extraTabs.find((item) => item.id === tab);

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
              setPage(1);
            }}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === item.id
                ? 'border-accent-600 text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {extra ? (
        extra.render()
      ) : error ? (
        <ErrorState message={error.message} requestId={error.requestId} onRetry={retry} />
      ) : !current ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : current.items.length === 0 ? (
        <EmptyState
          title={tab === 'print' ? 'No print orders yet' : 'No food orders yet'}
          description={
            tab === 'print'
              ? 'Send a PDF to a xerox shop near you and pick it up when it is ready.'
              : 'Scan the CampusPin code on a restaurant table, or order for pickup from a place page.'
          }
          action={
            <Link
              href={ROUTES.serviceType(tab === 'print' ? 'PRINT' : 'ORDER_FOOD')}
              className="text-sm font-semibold text-primary-700"
            >
              Find places
            </Link>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {current.items.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} />
              </li>
            ))}
          </ul>
          {current.meta && current.meta.totalPages > 1 && (
            <div className="flex justify-between">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Newer
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= current.meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Older
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
