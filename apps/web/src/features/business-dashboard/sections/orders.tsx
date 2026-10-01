'use client';

import type { BusinessOrder, OrderStatus, PaymentStatus } from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { Pagination, useAdminList } from '@/features/admin/components/admin-ui';
import { OrdersPanel } from '@/features/business/components/orders-panel';
import { commerceService } from '@/services/commerce.service';
import { DASHBOARD } from '../routes';
import {
  EmptyBlock,
  InvoiceBadge,
  OrderStatusBadge,
  PaymentBadge,
  Tabs,
  dateTime,
  rupees,
} from '../ui';
import { useWorkspace } from '../workspace';

type View =
  'live' | 'all' | 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'live', label: 'Live board' },
  { id: 'all', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'ACCEPTED', label: 'Accepted' },
  { id: 'PREPARING', label: 'Preparing' },
  { id: 'READY', label: 'Ready' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

/** One order as a card: readable on a phone without sideways scrolling. */
export function OrderRow({ order }: { order: BusinessOrder }) {
  const { can } = useWorkspace();
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <li>
      <Link
        href={DASHBOARD.order(order.id)}
        className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Icon name={order.kind === 'PRINT' ? 'printer' : 'utensils'} className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">
              {order.code} · {order.student.name}
            </p>
            <p className="truncate text-sm text-muted">
              {[
                order.table,
                `${count} ${count === 1 ? 'item' : 'items'}`,
                dateTime.format(new Date(order.createdAt)),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <OrderStatusBadge status={order.status} label={order.statusLabel} />
          {can('PAYMENT') && <PaymentBadge status={order.paymentStatus} />}
          {order.invoice && <InvoiceBadge status={order.invoice.status} />}
          <span className="ml-auto font-bold text-ink sm:ml-2 sm:w-20 sm:text-right">
            {rupees(order.total)}
          </span>
        </div>
      </Link>
    </li>
  );
}

export function OrdersSection() {
  const [view, setView] = useState<View>('live');
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, from placed to completed. Completing an order issues its invoice."
      />
      <Tabs tabs={VIEWS} value={view} onChange={setView} label="Orders" />
      {view === 'live' ? (
        <OrdersPanel />
      ) : (
        <OrderList key={view} status={view === 'all' ? undefined : view} />
      )}
    </>
  );
}

export function OrderList({
  status,
  paymentStatus,
  emptyTitle = 'No orders yet',
}: {
  status?: Exclude<View, 'live' | 'all'>;
  paymentStatus?: PaymentStatus;
  emptyTitle?: string;
}) {
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) =>
      status === 'CANCELLED'
        ? Promise.all([
            commerceService.orders({ scope: 'all', status: 'CANCELLED', page }, signal),
            commerceService.orders({ scope: 'all', status: 'REJECTED', page }, signal),
          ]).then(([cancelled, rejected]) => ({
            data: [...cancelled.data, ...rejected.data].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
            meta: cancelled.meta,
          }))
        : commerceService.orders(
            {
              scope: 'all',
              ...(status ? { status: status as OrderStatus } : {}),
              ...(paymentStatus ? { paymentStatus } : {}),
              page,
            },
            signal,
          ),
    [status, paymentStatus, page],
  );

  if (list.error) return <ErrorState message={list.error.message} onRetry={list.reload} />;
  if (!list.items) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (list.items.length === 0) {
    return (
      <EmptyBlock
        icon="cart"
        title={emptyTitle}
        text="Orders from students appear here as they come in."
      />
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {list.items.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </>
  );
}
