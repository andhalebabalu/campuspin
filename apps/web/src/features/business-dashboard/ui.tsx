import {
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type InvoiceStatus,
  type OrderStatus,
  type PaymentStatus,
} from '@platform/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';

/** Shared building blocks of the capability-driven dashboard. */

export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'bg-primary-50 text-primary-600',
  href,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
  href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition-shadow hover:shadow-md">
      <span className={`flex size-9 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="size-[18px]" />
      </span>
      <div>
        <p className="text-2xl font-bold text-ink">
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </p>
        <p className="text-sm text-body">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const PILL: Record<'green' | 'amber' | 'red' | 'blue' | 'grey', string> = {
  green: 'bg-success-50 text-success-700',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-danger-50 text-danger-700',
  blue: 'bg-primary-50 text-primary-700',
  grey: 'bg-subtle text-body',
};

export function Pill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${PILL[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

const ORDER_TONE: Record<OrderStatus, keyof typeof PILL> = {
  PENDING: 'amber',
  ACCEPTED: 'blue',
  PREPARING: 'blue',
  READY: 'blue',
  SERVED: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'red',
  REJECTED: 'red',
};

export function OrderStatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return <Pill tone={ORDER_TONE[status]}>{label}</Pill>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Pill tone={status === 'PAID' ? 'green' : status === 'REFUNDED' ? 'grey' : 'amber'}>
      {PAYMENT_STATUS_LABELS[status]}
    </Pill>
  );
}

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Pill
      tone={
        status === 'PAID'
          ? 'green'
          : status === 'CANCELLED'
            ? 'red'
            : status === 'DRAFT'
              ? 'grey'
              : 'blue'
      }
    >
      {INVOICE_STATUS_LABELS[status]}
    </Pill>
  );
}

/** "No orders yet" and friends: an icon, one line, and what to do next. */
export function EmptyBlock({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: IconName;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-subtle"
    >
      <Icon name={icon} className="size-4 text-primary-600" />
      {label}
    </Link>
  );
}

/** Tabs that live in the URL-less component state (keyboard-friendly, scrolls on phones). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-subtle p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${value === tab.id ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'}`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-primary-600 px-1.5 text-[11px] font-semibold text-white">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
