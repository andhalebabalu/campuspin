'use client';

import { ApiClientError } from '@platform/api-client';
import type { Invoice, InvoiceStatus, TableStatus } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import {
  Pagination,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  useAdminList,
} from '@/features/admin/components/admin-ui';
import { BookingsPanel } from '@/features/business/components/bookings-panel';
import { RequestsPanel } from '@/features/business/components/requests-panel';
import { InvoiceView } from '@/features/invoices/invoice-view';
import { commerceService } from '@/services/commerce.service';
import { DASHBOARD } from '../routes';
import { EmptyBlock, InvoiceBadge, Pill, StatCard, Tabs, dateTime, rupees } from '../ui';
import { useWorkspace } from '../workspace';
import { OrderList } from './orders';

// ── Invoices ─────────────────────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all' | 'custom';
const PERIODS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom dates' },
];

export function InvoicesSection() {
  const [period, setPeriod] = useState<Period>('month');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) =>
      commerceService.invoices(
        {
          period,
          page,
          ...(status ? { status } : {}),
          ...(q ? { q } : {}),
          ...(period === 'custom' && range.from ? { from: range.from } : {}),
          ...(period === 'custom' && range.to ? { to: range.to } : {}),
        },
        signal,
      ),
    [period, status, q, range, page],
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="One invoice for every completed order, numbered in order."
      />
      <Tabs
        tabs={PERIODS}
        value={period}
        onChange={(next) => {
          setPeriod(next);
          setPage(1);
        }}
        label="Period"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="mb-4 flex flex-wrap gap-2"
      >
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Invoice or order number"
          aria-label="Search invoices"
          className={`${SEARCH_CLASSES} min-w-0 flex-1 basis-48`}
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as InvoiceStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">Any status</option>
          <option value="ISSUED">Issued (unpaid)</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {period === 'custom' && (
          <>
            <input
              type="date"
              aria-label="From"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className={SELECT_CLASSES}
            />
            <input
              type="date"
              aria-label="To"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className={SELECT_CLASSES}
            />
          </>
        )}
      </form>
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : list.items.length === 0 ? (
        <EmptyBlock
          icon="file"
          title="No invoices yet"
          text="Invoices are issued automatically when you complete an order."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={DASHBOARD.invoice(invoice.id)}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs hover:shadow-md sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Icon name="file" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{invoice.number}</p>
                    <p className="truncate text-sm text-muted">
                      Order {invoice.orderCode} · {invoice.customer.name} ·{' '}
                      {dateTime.format(new Date(invoice.issuedAt))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <InvoiceBadge status={invoice.status} />
                  <span className="ml-auto font-bold text-ink sm:w-20 sm:text-right">
                    {rupees(invoice.total)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </>
  );
}

export function InvoiceSection({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .invoice(invoiceId, controller.signal)
      .then((result) => {
        setInvoice(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof ApiClientError ? caught.message : 'Could not load the invoice.',
          );
      });
    return () => controller.abort();
  }, [invoiceId, reload]);
  return (
    <>
      <Link
        href={DASHBOARD.invoices}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-action"
      >
        <Icon name="arrowLeft" className="size-4" /> Invoices
      </Link>
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((count) => count + 1)} />
      ) : !invoice ? (
        <Skeleton className="h-[36rem] w-full rounded-2xl" />
      ) : (
        <>
          <InvoiceView invoice={invoice} loadPdf={() => commerceService.invoicePdf(invoice.id)} />
          <Link
            href={DASHBOARD.order(invoice.order.id)}
            className="mt-4 inline-block text-sm font-medium text-action"
          >
            Open order {invoice.order.code} →
          </Link>
        </>
      )}
    </>
  );
}

// ── Payments ─────────────────────────────────────────────────────────────────────────────────────

export function PaymentsSection() {
  const [view, setView] = useState<'unpaid' | 'paid'>('unpaid');
  return (
    <>
      <PageHeader
        title="Payments"
        description="Record how each order was paid (cash, UPI or card). CampusPin does not take payments online yet."
      />
      <Tabs
        tabs={[
          { id: 'unpaid', label: 'Waiting for payment' },
          { id: 'paid', label: 'Paid' },
        ]}
        value={view}
        onChange={setView}
        label="Payments"
      />
      <p className="mb-3 text-sm text-muted">Open an order to record its payment.</p>
      <OrderList
        key={view}
        paymentStatus={view === 'unpaid' ? 'UNPAID' : 'PAID'}
        emptyTitle={view === 'unpaid' ? 'Nothing waiting for payment' : 'No paid orders yet'}
      />
    </>
  );
}

// ── Tables ───────────────────────────────────────────────────────────────────────────────────────

const TABLE_STYLE: Record<
  TableStatus['status'],
  { label: string; tone: 'green' | 'amber' | 'blue' | 'grey'; box: string }
> = {
  AVAILABLE: { label: 'Available', tone: 'green', box: 'border-line' },
  ORDER_PENDING: {
    label: 'Order pending',
    tone: 'amber',
    box: 'border-amber-600/40 bg-amber-50/40',
  },
  OCCUPIED: { label: 'Occupied', tone: 'blue', box: 'border-primary-300 bg-primary-50/40' },
  ORDER_COMPLETED: { label: 'Order completed', tone: 'grey', box: 'border-line bg-subtle/50' },
};

export function TablesSection() {
  const [tables, setTables] = useState<TableStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    commerceService
      .tables(controller.signal)
      .then((result) => {
        setTables(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof ApiClientError ? caught.message : 'Could not load the tables.',
          );
      });
    return () => controller.abort();
  }, [tick]);

  // Live: refresh every 10 seconds while the page is open.
  useEffect(() => {
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <>
      <PageHeader
        title="Tables"
        description="What is happening at each table right now. Updates every 10 seconds."
        actions={
          <Link
            href={DASHBOARD.qr}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            <Icon name="qr" className="size-4" /> Add tables & QR codes
          </Link>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !tables ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : tables.length === 0 ? (
        <EmptyBlock
          icon="utensils"
          title="No tables yet"
          text="Add your tables and print their QR codes: students order from their seat."
          action={
            <Link href={DASHBOARD.qr} className="mt-1 text-sm font-semibold text-action">
              Add tables →
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(TABLE_STYLE) as Array<TableStatus['status']>).map((key) => (
              <StatCard
                key={key}
                icon="utensils"
                label={TABLE_STYLE[key].label}
                value={tables.filter((t) => t.status === key).length}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((table) => {
              const style = TABLE_STYLE[table.status];
              return (
                <li
                  key={table.id}
                  className={`flex flex-col gap-2 rounded-2xl border p-4 ${style.box}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{table.label}</span>
                  </div>
                  <span className="self-start">
                    <Pill tone={style.tone}>{style.label}</Pill>
                  </span>
                  {table.currentOrder ? (
                    <Link
                      href={DASHBOARD.order(table.currentOrder.id)}
                      className="text-sm text-action"
                    >
                      {table.currentOrder.code} · {rupees(table.currentOrder.total)}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">No order</span>
                  )}
                  <span className="text-xs text-muted">{table.place.name}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

// ── Bookings and requests (existing panels, now their own modules) ───────────────────────────────

export function BookingsSection() {
  const { listings } = useWorkspace();
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Slots, seats and rooms students booked. Confirm, complete or cancel them."
      />
      <BookingsPanel listings={listings} />
    </>
  );
}

export function RequestsSection() {
  const { listings } = useWorkspace();
  return (
    <>
      <PageHeader
        title="Requests"
        description="Table requests and jobs students asked for. Refreshes by itself."
      />
      <RequestsPanel listings={listings} />
    </>
  );
}
