'use client';

import { ApiClientError } from '@platform/api-client';
import {
  FINAL_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  type Order,
  type OrderStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { openPrivateFile } from '@/features/files/private-file';
import { ordersService } from '@/services/orders.service';
import { rupees } from '../lib/use-cart';

/** How often an open order is re-read while the page is open. */
const POLL_MS = 10_000;

const STEPS: Record<Order['kind'], OrderStatus[]> = {
  FOOD: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'],
  PRINT: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'],
};

export function statusTone(status: OrderStatus): BadgeTone {
  if (status === 'READY') return 'success';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'danger';
  if (status === 'COMPLETED' || status === 'SERVED') return 'neutral';
  return 'accent';
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Live status of one order, refreshed every few seconds until it is finished. */
export function OrderTracking({ orderId }: { orderId: string }) {
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      ordersService
        .myOrder(orderId, signal)
        .then((result) => {
          setOrder(result.data);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (!signal?.aborted)
            setError(caught instanceof Error ? caught : new Error('Could not load the order.'));
        }),
    [orderId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const finished = order ? FINAL_ORDER_STATUSES.includes(order.status) : false;
  useEffect(() => {
    if (!order || finished) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [order, finished, load]);

  if (error && !order) {
    if (error instanceof ApiClientError && error.status === 404) {
      return <EmptyState title="Order not found" description="It may belong to another account." />;
    }
    return <ErrorState message={error.message} onRetry={() => void load()} />;
  }
  if (!order) return <Skeleton className="h-96 w-full" />;

  const labels = ORDER_STATUS_LABELS[order.kind];
  const steps = STEPS[order.kind];
  const reached = new Set(order.history.map((entry) => entry.status));
  const stopped = order.status === 'CANCELLED' || order.status === 'REJECTED';

  async function cancel() {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    try {
      const result = await ordersService.cancelMine(order!.id);
      setOrder(result.data);
      toast.show('Order cancelled');
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'Could not cancel.', 'error');
      void load();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Order {order.code}</p>
            <Link
              href={ROUTES.placeDetail(order.place.slug)}
              className="text-2xl font-bold text-ink hover:text-primary-800"
            >
              {order.place.name}
            </Link>
            {order.table && <p className="text-sm text-body">{order.table}</p>}
          </div>
          <Badge tone={statusTone(order.status)}>{order.statusLabel}</Badge>
        </div>

        {!stopped ? (
          <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
            {steps.map((step) => {
              const done = reached.has(step) || order.status === step;
              return (
                <li key={step} className="flex flex-col gap-1.5">
                  <span
                    className={`h-1.5 rounded-full ${done ? 'bg-accent-600' : 'bg-neutral-200'}`}
                  />
                  <span className={`text-xs ${done ? 'font-medium text-ink' : 'text-muted'}`}>
                    {labels[step]}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rounded-md bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {order.status === 'REJECTED'
              ? 'The business could not take this order.'
              : 'This order was cancelled.'}
            {order.statusReason ? ` ${order.statusReason}` : ''}
          </p>
        )}

        {!finished && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="clock" className="size-4" /> Updates automatically
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-semibold text-ink">Items</h2>
        <ul className="divide-y divide-line">
          {order.items.map((line, index) => (
            <li key={`${line.name}-${index}`} className="flex justify-between gap-3 py-2.5 text-sm">
              <span>
                <span className="font-medium text-ink">
                  {line.quantity} × {line.name}
                </span>
                {line.options.length > 0 && (
                  <span className="block text-xs text-muted">
                    {line.options.map((option) => option.name).join(', ')}
                  </span>
                )}
              </span>
              <span className="text-ink">{rupees(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
          {order.discount > 0 && (
            <div className="flex justify-between text-success-700">
              <dt>Student offer</dt>
              <dd>−{rupees(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-ink">
            <dt>Total</dt>
            <dd>{rupees(order.total)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Payment</dt>
            <dd>{PAYMENT_LABELS[order.paymentMethod]}</dd>
          </div>
        </dl>
        {order.note && <p className="text-sm text-body">Note: {order.note}</p>}
        {order.print && (
          <p className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-800">
            {order.print.fileName} · {order.print.pageCount} pages × {order.print.copies} ·{' '}
            {order.print.color ? 'colour' : 'B/W'} · {order.print.paperSize}
            {order.print.doubleSided ? ' · double-sided' : ''}
            {order.print.binding ? ' · binding' : ''}
            {order.print.lamination ? ' · lamination' : ''}
            {order.print.pickupAt
              ? ` · pickup ${new Date(order.print.pickupAt).toLocaleString('en-IN')}`
              : ''}
          </p>
        )}
        {order.print && !finished && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              void openPrivateFile(
                () => ordersService.myDocument(order.id),
                order.print?.fileName,
              ).catch(() => toast.show('The file could not be opened.', 'error'))
            }
          >
            <Icon name="download" className="size-4" /> My file
          </Button>
        )}
      </Card>

      {order.history.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-3 font-semibold text-ink">Timeline</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {order.history.map((entry) => (
              <li key={`${entry.status}-${entry.at}`} className="flex justify-between">
                <span className="text-ink">{labels[entry.status]}</span>
                <span className="text-muted">{timeFormat.format(new Date(entry.at))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {order.cancellable && (
          <Button variant="secondary" loading={cancelling} onClick={() => void cancel()}>
            Cancel order
          </Button>
        )}
        {order.status === 'COMPLETED' && (
          <Link
            href={ROUTES.placeReview(order.place.slug)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-action px-5 text-sm font-medium text-white"
          >
            <Icon name="star" className="size-4" /> Review {order.place.name}
          </Link>
        )}
        <Link
          href={ROUTES.orders}
          className="inline-flex h-11 items-center px-2 text-sm font-medium text-primary-700"
        >
          All my orders
        </Link>
      </div>
    </div>
  );
}
