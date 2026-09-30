'use client';

import {
  SUBSCRIPTION_STATUSES,
  type AdminBusinessAnalytics,
  type AdminPlan,
  type OwnershipIssue,
  type SubscriptionStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DailyBars, ShareBars } from '@/components/shared/charts';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { adminCrmService } from '@/services/admin-crm.service';
import {
  AdminHeader,
  Pagination,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  dateFormat,
  errorMessage,
  useAdminList,
} from './admin-ui';

const TABLE = 'w-full text-left text-sm';
const THEAD =
  'border-b border-line bg-subtle/60 text-xs font-semibold tracking-wide text-muted uppercase';

/** Loads one thing (not a list) with retry. */
function useLoad<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([...deps, tick]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((result) => setState({ key, data: result.data }))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setState({ key, error: errorMessage(caught, 'Could not load.') });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers the caller's deps.
  }, [key]);
  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    retry: () => setTick((t) => t + 1),
  };
}

const PROBLEM_LABELS: Record<OwnershipIssue['problem'], string> = {
  OWNER_IS_STUDENT: 'Owned by a student account',
  OWNER_IS_STAFF: 'Owned by a staff account',
  OWNER_NOT_BUSINESS: 'Owner lacks the business role',
};

export function OwnershipScreen() {
  const { data, error, retry } = useLoad((signal) => adminCrmService.ownershipCheck(signal), []);
  return (
    <div>
      <AdminHeader
        title="Ownership check"
        description="Student and business accounts are separate. Businesses listed here are run from the wrong kind of account; open one and transfer it to its owner's business account. Nothing is changed automatically."
      />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : data.length === 0 ? (
        <EmptyState
          title="Every business is owned by a business account"
          description="Nothing to migrate."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs">
          <table className={`${TABLE} min-w-[40rem]`}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Problem</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((issue) => (
                <tr key={issue.business.id}>
                  <td className="px-4 py-3 font-semibold text-ink">{issue.business.name}</td>
                  <td className="px-3 py-3 text-body">
                    {issue.owner.name}
                    <span className="block text-xs text-muted">{issue.owner.email}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">
                      {PROBLEM_LABELS[issue.problem]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={ROUTES.adminBusiness(issue.business.id)}
                      className="text-sm font-semibold text-action"
                    >
                      Open & transfer →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PlansScreen() {
  const { data, error, retry } = useLoad((signal) => adminCrmService.plans(signal), []);
  return (
    <div>
      <AdminHeader
        title="Plans"
        description="Listing is free. Paid plans are prepared for later and are not on sale: there is no payment gateway yet."
      />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.map((plan: AdminPlan) => (
            <div
              key={plan.key}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${plan.isDefault ? 'bg-primary-50 text-primary-700' : plan.isAvailable ? 'bg-success-50 text-success-700' : 'bg-subtle text-muted'}`}
                >
                  {plan.isDefault ? 'Default' : plan.isAvailable ? 'On sale' : 'Not on sale'}
                </span>
              </div>
              <p className="text-sm text-body">{plan.description}</p>
              <p className="text-sm text-ink">
                {plan.isDefault
                  ? 'Free'
                  : plan.priceMonthly !== null
                    ? `₹${plan.priceMonthly.toLocaleString('en-IN')} / month`
                    : 'No price set'}
              </p>
              <ul className="flex flex-col gap-1.5 text-sm text-body">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 size-4 text-accent-600" />
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="mt-auto border-t border-line pt-3 text-sm text-muted">
                {plan.isDefault
                  ? 'Every business without an assigned plan'
                  : `${plan.activeSubscriptions} business${plan.activeSubscriptions === 1 ? '' : 'es'} assigned`}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-muted">
        Assign a plan from a business’s page (Businesses → open one → Subscription).
      </p>
    </div>
  );
}

export function SubscriptionsScreen() {
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) => adminCrmService.subscriptions({ page, ...(status ? { status } : {}) }, signal),
    [status, page],
  );
  return (
    <div>
      <AdminHeader
        title="Subscriptions"
        description="Plans staff assigned to businesses. Every business not listed here is on the Free plan."
      />
      <div className="mb-4">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as SubscriptionStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">Any status</option>
          {SUBSCRIPTION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : !list.items ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No assigned plans" description="All businesses are on the Free plan." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs">
          <table className={`${TABLE} min-w-[44rem]`}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-3 py-3">Plan</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Period</th>
                <th className="px-3 py-3">Assigned by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.items.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={ROUTES.adminBusiness(sub.business.id)}
                      className="font-semibold text-ink hover:text-primary-700"
                    >
                      {sub.business.name}
                    </Link>
                    {sub.note && <span className="block text-xs text-muted">{sub.note}</span>}
                  </td>
                  <td className="px-3 py-3 text-body">{sub.plan.name}</td>
                  <td className="px-3 py-3 text-body">{sub.status.toLowerCase()}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-body">
                    {dateFormat.format(new Date(sub.startedAt))} –{' '}
                    {sub.endedAt
                      ? dateFormat.format(new Date(sub.endedAt))
                      : sub.endsAt
                        ? dateFormat.format(new Date(sub.endsAt))
                        : 'open'}
                  </td>
                  <td className="px-3 py-3 text-body">{sub.assignedBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </div>
  );
}

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function AuditLogScreen() {
  const [draft, setDraft] = useState({ action: '', entityType: '', actor: '' });
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    actor: '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useAdminList(
    (signal) =>
      adminCrmService.auditLogs(
        Object.fromEntries(
          Object.entries({ page, ...filters }).filter(([, value]) => value !== ''),
        ),
        signal,
      ),
    [filters, page],
  );
  return (
    <div>
      <AdminHeader
        title="Audit logs"
        description="Every staff and owner action, newest first. Entries cannot be edited or deleted."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({
            ...current,
            action: draft.action.trim().toUpperCase(),
            entityType: draft.entityType.trim(),
            actor: draft.actor.trim(),
          }));
          setPage(1);
        }}
        className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs"
      >
        <input
          value={draft.action}
          onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          placeholder="Action, e.g. BUSINESS_SUSPENDED"
          aria-label="Action"
          className={`${SEARCH_CLASSES} w-64`}
        />
        <input
          value={draft.entityType}
          onChange={(e) => setDraft((d) => ({ ...d, entityType: e.target.value }))}
          placeholder="Entity, e.g. BusinessProfile"
          aria-label="Entity type"
          className={`${SEARCH_CLASSES} w-48`}
        />
        <input
          value={draft.actor}
          onChange={(e) => setDraft((d) => ({ ...d, actor: e.target.value }))}
          placeholder="Who (name or email)"
          aria-label="Actor"
          className={`${SEARCH_CLASSES} w-48`}
        />
        <input
          type="date"
          aria-label="From"
          value={filters.from}
          onChange={(e) => {
            setFilters((f) => ({ ...f, from: e.target.value }));
            setPage(1);
          }}
          className={SELECT_CLASSES}
        />
        <input
          type="date"
          aria-label="To"
          value={filters.to}
          onChange={(e) => {
            setFilters((f) => ({ ...f, to: e.target.value }));
            setPage(1);
          }}
          className={SELECT_CLASSES}
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover"
        >
          Filter
        </button>
      </form>
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : !list.items ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No entries" description="Nothing matches these filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs">
          <table className={`${TABLE} min-w-[48rem]`}>
            <thead className={THEAD}>
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-3 py-3">Who</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">On</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.items.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-body">
                    {dateTime.format(new Date(entry.createdAt))}
                  </td>
                  <td className="px-3 py-3 text-body">
                    {entry.actor ? (
                      <>
                        {entry.actor.name}
                        <span className="block text-xs text-muted">{entry.actor.email}</span>
                      </>
                    ) : (
                      'System'
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <code className="rounded bg-subtle px-1.5 py-0.5 text-xs text-ink">
                      {entry.action}
                    </code>
                  </td>
                  <td className="px-3 py-3 text-body">
                    {entry.entityType === 'BusinessProfile' && entry.entityId ? (
                      <Link href={ROUTES.adminBusiness(entry.entityId)} className="text-action">
                        Business
                      </Link>
                    ) : (
                      entry.entityType
                    )}
                    {entry.entityId && (
                      <span className="block font-mono text-[11px] text-muted">
                        {entry.entityId}
                      </span>
                    )}
                    {open === entry.id && entry.metadata && (
                      <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-subtle p-2 text-xs whitespace-pre-wrap text-ink">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {entry.metadata && (
                      <button
                        type="button"
                        onClick={() => setOpen(open === entry.id ? null : entry.id)}
                        className="text-xs font-medium text-action"
                      >
                        {open === entry.id ? 'Hide' : 'Details'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </div>
  );
}

const RANGES = [7, 30, 90] as const;

export function BusinessAnalyticsScreen() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error, retry } = useLoad<AdminBusinessAnalytics>(
    (signal) => adminCrmService.businessAnalytics(days, signal),
    [days],
  );
  const empty = data ? data.daily.every((day) => day.pageViews === 0 && day.actions === 0) : false;
  return (
    <div>
      <AdminHeader
        title="Business analytics"
        description="Visits and taps on business pages across CampusPin, from anonymous page events."
        action={
          <div role="tablist" aria-label="Period" className="flex rounded-xl bg-subtle p-1">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={days === range}
                onClick={() => setDays(range)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === range ? 'bg-surface text-ink shadow-xs' : 'text-body'}`}
              >
                {range} days
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ['Page views', data.totals.pageViews],
                ['Calls', data.totals.calls],
                ['WhatsApp', data.totals.whatsapp],
                ['Directions', data.totals.directions],
                ['Shares', data.totals.shares],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
                <p className="text-2xl font-bold text-ink">{value.toLocaleString('en-IN')}</p>
                <p className="text-sm text-body">{label}</p>
              </div>
            ))}
          </div>
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <h2 className="mb-4 font-semibold text-ink">Page views per day</h2>
            {empty ? (
              <p className="py-10 text-center text-sm text-muted">
                No business page visits in this period yet.
              </p>
            ) : (
              <DailyBars
                days={data.daily.map((day) => ({ day: day.day, value: day.pageViews }))}
                label="Business page views per day"
              />
            )}
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="mb-4 font-semibold text-ink">Most visited business pages</h2>
              {data.top.length === 0 ? (
                <p className="text-sm text-muted">No visits yet.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-line">
                  {data.top.map((row, index) => (
                    <li key={row.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-5 text-muted">{index + 1}</span>
                      <Link
                        href={ROUTES.adminBusiness(row.id)}
                        className="min-w-0 flex-1 truncate font-medium text-ink hover:text-primary-700"
                      >
                        {row.name}
                      </Link>
                      <span className="text-body">{row.pageViews} views</span>
                      <span className="w-20 text-right text-muted">{row.actions} taps</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="mb-4 font-semibold text-ink">Businesses by category</h2>
              {data.byCategory.length === 0 ? (
                <p className="text-sm text-muted">No businesses yet.</p>
              ) : (
                <ShareBars
                  rows={data.byCategory
                    .slice(0, 8)
                    .map((row) => ({ label: row.name, value: row.count, color: 'bg-primary-500' }))}
                />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
