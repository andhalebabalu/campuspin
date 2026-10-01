'use client';

import { ApiClientError } from '@platform/api-client';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_LABELS,
  type BusinessOrder,
  type OrderStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { commerceService } from '@/services/commerce.service';
import { DASHBOARD } from '../routes';
import { InvoiceBadge, OrderStatusBadge, PaymentBadge, dateTime, rupees } from '../ui';
import { useWorkspace } from '../workspace';

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: 'Accept',
  PREPARING: 'Start preparing',
  READY: 'Mark ready',
  SERVED: 'Mark served',
  COMPLETED: 'Complete',
  REJECTED: 'Reject',
  CANCELLED: 'Cancel',
};

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const toast = useToast();
  const { can } = useWorkspace();
  const [order, setOrder] = useState<BusinessOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .order(orderId, controller.signal)
      .then((result) => {
        setOrder(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load the order.');
      });
    return () => controller.abort();
  }, [orderId, reload]);

  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!order) return <Skeleton className="h-96 w-full rounded-2xl" />;

  async function act(key: string, run: () => Promise<{ data: BusinessOrder }>, done: string) {
    setBusy(key);
    try {
      setOrder((await run()).data);
      toast.show(done);
    } catch (caught) {
      toast.show(caught instanceof ApiClientError ? caught.message : 'That did not work.', 'error');
      retry();
    } finally {
      setBusy(null);
    }
  }

  const move = (status: OrderStatus) => {
    let reason: string | undefined;
    if (status === 'REJECTED' || status === 'CANCELLED') {
      const answer = window.prompt('Tell the student why (optional):') ?? null;
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    void act(
      status,
      () => commerceService.moveOrder(order.id, status, reason),
      ORDER_STATUS_LABELS[order.kind][status],
    );
  };
  const labels = ORDER_STATUS_LABELS[order.kind];
  const primary = order.nextStatuses.filter(
    (status) => status !== 'REJECTED' && status !== 'CANCELLED',
  );
  const secondary = order.nextStatuses.filter(
    (status) => status === 'REJECTED' || status === 'CANCELLED',
  );
  const payable =
    can('PAYMENT') &&
    order.paymentStatus === 'UNPAID' &&
    order.status !== 'CANCELLED' &&
    order.status !== 'REJECTED';

  return (
    <div>
      <Link
        href={DASHBOARD.orders}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-action"
      >
        <Icon name="arrowLeft" className="size-4" /> Orders
      </Link>
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Order {order.code}</h1>
          <p className="text-sm text-muted">
            {order.place.name}
            {order.table ? ` · ${order.table}` : ''} · {dateTime.format(new Date(order.createdAt))}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <OrderStatusBadge status={order.status} label={order.statusLabel} />
            {can('PAYMENT') && <PaymentBadge status={order.paymentStatus} />}
          </div>
        </div>
        {(primary.length > 0 || secondary.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {primary.map((status) => (
              <Button
                key={status}
                onClick={() => move(status)}
                loading={busy === status}
                disabled={busy !== null}
              >
                {ACTION_LABELS[status] ?? labels[status]}
              </Button>
            ))}
            {secondary.map((status) => (
              <Button
                key={status}
                variant="secondary"
                onClick={() => move(status)}
                loading={busy === status}
                disabled={busy !== null}
              >
                {ACTION_LABELS[status] ?? labels[status]}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Items">
            <ul className="divide-y divide-line">
              {order.items.map((item, index) => (
                <li key={index} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {item.quantity} × {item.name}
                    </p>
                    {item.options.length > 0 && (
                      <p className="text-xs text-muted">
                        + {item.options.map((option) => option.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-ink">{rupees(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {order.print && (
              <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-sm text-body">
                {order.print.fileName} · {order.print.pageCount} pages · {order.print.copies} copies
                · {order.print.color ? 'colour' : 'black & white'}
              </p>
            )}
            <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{rupees(order.subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Discount</dt>
                  <dd>− {rupees(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-ink">
                <dt>Total</dt>
                <dd>{rupees(order.total)}</dd>
              </div>
            </dl>
            {order.note && <p className="mt-3 text-sm text-body">Note: “{order.note}”</p>}
          </Card>

          <Card title="Status timeline">
            <ol className="relative flex flex-col gap-3 border-l border-line pl-5">
              {order.history.map((entry, index) => (
                <li key={index} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-surface bg-primary-500" />
                  <span className="font-medium text-ink">{labels[entry.status]}</span>
                  <span className="text-muted"> · {dateTime.format(new Date(entry.at))}</span>
                </li>
              ))}
            </ol>
            {order.statusReason && (
              <p className="mt-3 text-sm text-body">Reason: “{order.statusReason}”</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Customer">
            <p className="font-medium text-ink">{order.student.name}</p>
            <p className="text-sm text-muted">Contact details stay private to CampusPin.</p>
          </Card>

          <Card title="Payment">
            <p className="text-sm text-body">
              {order.paymentStatus === 'PAID'
                ? `Paid${order.paidVia ? ` by ${PAYMENT_CHANNEL_LABELS[order.paidVia]}` : ''}${order.paidAt ? `, ${dateTime.format(new Date(order.paidAt))}` : ''}`
                : `Not paid yet · ${PAYMENT_LABELS[order.paymentMethod]}`}
            </p>
            {payable && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(['CASH', 'UPI', 'CARD'] as const).map((via) => (
                  <Button
                    key={via}
                    size="sm"
                    variant="secondary"
                    loading={busy === via}
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        via,
                        () => commerceService.recordPayment(order.id, via),
                        `Paid by ${PAYMENT_CHANNEL_LABELS[via]}`,
                      )
                    }
                  >
                    Paid · {PAYMENT_CHANNEL_LABELS[via]}
                  </Button>
                ))}
              </div>
            )}
            {!can('PAYMENT') && (
              <p className="mt-1 text-xs text-muted">Payments are not tracked for your business.</p>
            )}
          </Card>

          {can('INVOICE') && (
            <Card title="Invoice">
              {order.invoice ? (
                <Link
                  href={DASHBOARD.invoice(order.invoice.id)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 hover:bg-subtle"
                >
                  <span className="font-medium text-ink">{order.invoice.number}</span>
                  <InvoiceBadge status={order.invoice.status} />
                </Link>
              ) : (
                <p className="text-sm text-muted">
                  {order.status === 'CANCELLED' || order.status === 'REJECTED'
                    ? 'No invoice: the order was not completed.'
                    : 'Issued automatically when the order is completed.'}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
