'use client';

import { ApiClientError } from '@platform/api-client';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  type BusinessOrder,
  type OrderStatus,
} from '@platform/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { rupees } from '@/features/orders/lib/use-cart';
import { statusTone } from '@/features/orders/components/order-tracking';
import { openPrivateFile } from '@/features/files/private-file';
import { ordersService } from '@/services/orders.service';

/** The board refreshes this often while it is on screen. */
const POLL_MS = 5_000;
type Scope = 'active' | 'today' | 'all';

/** The button for each move, per kind (a print job is "processing", not "preparing"). */
const ACTION_LABEL: Record<OrderStatus, string> = {
  PENDING: '',
  ACCEPTED: 'Accept',
  PREPARING: 'Start preparing',
  READY: 'Mark ready',
  SERVED: 'Mark served',
  COMPLETED: 'Complete',
  CANCELLED: 'Cancel',
  REJECTED: 'Reject',
};

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

function minutesAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function OrderTicket({
  order,
  onChanged,
}: {
  order: BusinessOrder;
  onChanged: (order: BusinessOrder) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<OrderStatus | null>(null);

  async function move(status: OrderStatus) {
    let reason: string | undefined;
    if (status === 'REJECTED' || status === 'CANCELLED') {
      const answer = window.prompt(
        `${ACTION_LABEL[status]} order ${order.code}? Tell the student why (optional):`,
        '',
      );
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setBusy(status);
    try {
      const result = await ordersService.updateStatus(order.id, status, reason);
      onChanged(result.data);
      toast.show(`${order.code}: ${ORDER_STATUS_LABELS[order.kind][status]}`);
    } catch (caught) {
      toast.show(
        caught instanceof ApiClientError ? caught.message : 'Could not update the order.',
        'error',
      );
    } finally {
      setBusy(null);
    }
  }

  const forward = order.nextStatuses.filter(
    (status) => status !== 'REJECTED' && status !== 'CANCELLED',
  );
  const stop = order.nextStatuses.filter(
    (status) => status === 'REJECTED' || status === 'CANCELLED',
  );

  return (
    <Card
      className={`flex flex-col gap-3 p-4 ${order.status === 'PENDING' ? 'border-amber-600 ring-1 ring-amber-600/30' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-ink">{order.table ?? 'Pickup'}</p>
          <p className="text-xs text-muted">
            {order.code} · {order.student.name} · {minutesAgo(order.createdAt)}
          </p>
        </div>
        <Badge tone={statusTone(order.status)}>{order.statusLabel}</Badge>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {order.items.map((line, index) => (
          <li key={`${line.name}-${index}`}>
            <span className="font-semibold text-ink">{line.quantity} ×</span> {line.name}
            {line.options.length > 0 && (
              <span className="text-muted">
                {' '}
                ({line.options.map((option) => option.name).join(', ')})
              </span>
            )}
          </li>
        ))}
      </ul>
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
      {order.print &&
        order.status !== 'COMPLETED' &&
        order.status !== 'CANCELLED' &&
        order.status !== 'REJECTED' && (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() =>
              void openPrivateFile(
                () => ordersService.businessDocument(order.id),
                order.print?.fileName,
              ).catch(() => toast.show('The file could not be opened.', 'error'))
            }
          >
            <Icon name="download" className="size-4" /> Download PDF
          </Button>
        )}
      {order.note && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-600">
          Note: {order.note}
        </p>
      )}
      <p className="text-sm text-body">
        <span className="font-semibold text-ink">{rupees(order.total)}</span> ·{' '}
        {PAYMENT_LABELS[order.paymentMethod]}
      </p>
      {order.nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {forward.map((status) => (
            <Button
              key={status}
              size="sm"
              loading={busy === status}
              onClick={() => void move(status)}
            >
              {ACTION_LABEL[status]}
            </Button>
          ))}
          {stop.map((status) => (
            <Button
              key={status}
              size="sm"
              variant="ghost"
              loading={busy === status}
              onClick={() => void move(status)}
            >
              {ACTION_LABEL[status]}
            </Button>
          ))}
        </div>
      )}
      {order.statusReason && <p className="text-xs text-muted">Reason: {order.statusReason}</p>}
    </Card>
  );
}

/**
 * The live order board. New orders appear within a few seconds (it polls while the tab is visible)
 * and a short sound plays for each new one when the browser allows it.
 */
export function OrdersPanel({ onNewCount }: { onNewCount?: (pending: number) => void }) {
  const [scope, setScope] = useState<Scope>('active');
  const [orders, setOrders] = useState<{ scope: Scope; items: BusinessOrder[] } | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const current = orders?.scope === scope ? orders.items : null;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await ordersService.businessOrders({ scope, page: 1 }, signal);
        const pending = result.data.filter((order) => order.status === 'PENDING');
        if (
          seen.current &&
          scope === 'active' &&
          pending.some((order) => !seen.current!.has(order.id))
        ) {
          chime();
        }
        seen.current = new Set(result.data.map((order) => order.id));
        onNewCount?.(pending.length);
        setOrders({ scope, items: result.data });
        setError(null);
        setUpdatedAt(new Date());
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load orders.' },
        );
      }
    },
    [scope, onNewCount],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['active', 'today', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                scope === value
                  ? 'border-primary-700 bg-primary-50 text-primary-800'
                  : 'border-line text-body hover:bg-subtle'
              }`}
            >
              {value === 'active' ? 'In progress' : value === 'today' ? 'Today' : 'All'}
            </button>
          ))}
        </div>
        {updatedAt && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-2 animate-pulse rounded-full bg-accent-600" /> Live · updated{' '}
            {timeFormat.format(updatedAt)}
          </p>
        )}
      </div>

      {error && !current ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      ) : !current ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : current.length === 0 ? (
        <EmptyState
          title={scope === 'active' ? 'No orders in progress' : 'No orders yet'}
          description="New orders appear here within a few seconds. Switch on Order Food under Services and print your table QR codes to start."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {current.map((order) => (
            <OrderTicket
              key={order.id}
              order={order}
              onChanged={(next) =>
                setOrders((state) =>
                  state
                    ? {
                        ...state,
                        items: state.items.map((item) => (item.id === next.id ? next : item)),
                      }
                    : state,
                )
              }
            />
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Icon name="info" className="size-3.5" /> Students pay you directly: at the counter or in
        cash at the table.
      </p>
    </div>
  );
}

/** A short two-tone beep through Web Audio (no sound file); silently skipped when not allowed. */
function chime() {
  try {
    const context = new AudioContext();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.15);
    });
  } catch {
    // Autoplay rules or no audio: the board still updates.
  }
}
