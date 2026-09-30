'use client';

import {
  BUSINESS_STATUSES,
  VERIFICATION_STATUSES,
  type AdminBusiness,
  type BusinessStatus,
  type CategoryGroup,
  type VerificationStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { adminService } from '@/services/admin.service';
import { adminCrmService } from '@/services/admin-crm.service';
import { categoriesService } from '@/services/categories.service';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';
import { BusinessStatusBadges } from './business-badges';

type Sort = 'newest' | 'oldest' | 'name';

interface Filters {
  q: string;
  categoryId: string;
  city: string;
  status: BusinessStatus | '';
  verification: VerificationStatus | '';
  from: string;
  to: string;
  sort: Sort;
}

/** The actions a business row offers, depending on where it stands. */
function RowMenu({
  business,
  onAction,
}: {
  business: AdminBusiness;
  onAction: (action: 'verify' | 'unverify' | 'reject' | 'suspend' | 'reinstate' | 'delete') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const items: Array<[Parameters<typeof onAction>[0], string, boolean?]> = [];
  if (business.verificationStatus !== 'VERIFIED') items.push(['verify', 'Verify']);
  else items.push(['unverify', 'Remove verification']);
  if (business.verificationStatus !== 'REJECTED') items.push(['reject', 'Reject', true]);
  if (business.status === 'SUSPENDED' || business.verificationStatus === 'REJECTED') {
    items.push(['reinstate', 'Reinstate']);
  } else {
    items.push(['suspend', 'Suspend', true]);
  }
  items.push(['delete', 'Delete', true]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${business.businessName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-ink"
      >
        <Icon name="more" className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={ROUTES.adminBusiness(business.id)}
            className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-subtle"
          >
            View & edit
          </Link>
          {items.map(([action, label, danger]) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAction(action);
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle ${danger ? 'text-danger-700' : 'text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Businesses as a CRM table: search, filters, bulk decisions, and one-click actions per row. */
export function BusinessesScreen({
  initialVerification,
  initialStatus = '',
}: {
  initialVerification: VerificationStatus | '';
  initialStatus?: BusinessStatus | '';
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState({ q: '', city: '' });
  const [filters, setFilters] = useState<Filters>({
    q: '',
    categoryId: '',
    city: '',
    status: initialStatus,
    verification: initialVerification,
    from: '',
    to: '',
    sort: 'newest',
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    categoriesService
      .list(controller.signal)
      .then((result) => setCategories(result.data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const list = useAdminList(
    (signal) =>
      adminService.businesses(
        {
          page,
          sort: filters.sort,
          ...(filters.q ? { q: filters.q } : {}),
          ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
          ...(filters.city ? { city: filters.city } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.verification ? { verification: filters.verification } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
        },
        signal,
      ),
    [filters, page],
  );

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    setSelected(new Set());
  };
  const activeFilters = [
    filters.q,
    filters.categoryId,
    filters.city,
    filters.status,
    filters.verification,
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  function act(
    business: AdminBusiness,
    action: Parameters<Parameters<typeof RowMenu>[0]['onAction']>[0],
  ) {
    const name = business.businessName;
    const run = async (reason: string) => {
      if (action === 'delete') {
        await adminCrmService.remove(business.id);
        toast.show(`${name} deleted`);
        list.reload();
        return;
      }
      const result = await adminCrmService.decide(business.id, action, reason || undefined);
      list.replace((item) => item.id === business.id, result.data);
      toast.show(`${name}: done`);
    };
    const copy = {
      verify: {
        title: `Verify ${name}?`,
        description: 'Students see a Verified badge on its page.',
        confirmLabel: 'Verify',
        required: false,
      },
      unverify: {
        title: `Remove ${name}’s verification?`,
        description: 'The Verified badge disappears; the page stays live.',
        confirmLabel: 'Remove',
        required: false,
      },
      reject: {
        title: `Reject ${name}?`,
        description: 'Its page and listings are hidden. The owner sees your reason.',
        confirmLabel: 'Reject',
        required: true,
        danger: true,
      },
      suspend: {
        title: `Suspend ${name}?`,
        description:
          'Its page and listings are hidden and its dashboard frozen. The owner sees your reason.',
        confirmLabel: 'Suspend',
        required: true,
        danger: true,
      },
      reinstate: {
        title: `Reinstate ${name}?`,
        description:
          'A suspended business becomes active again; a rejected one goes back to review. Its hidden listings come back.',
        confirmLabel: 'Reinstate',
        required: false,
      },
      delete: {
        title: `Delete ${name}?`,
        description:
          'Only possible for a business with no listings, orders or other history, and cannot be undone. Otherwise suspend it.',
        confirmLabel: 'Delete for good',
        required: false,
        danger: true,
      },
    }[action];
    setDialog({ ...copy, onConfirm: run });
  }

  function bulk(action: 'verify' | 'suspend' | 'reinstate') {
    const ids = [...selected];
    setDialog({
      title: `${action === 'verify' ? 'Verify' : action === 'suspend' ? 'Suspend' : 'Reinstate'} ${ids.length} business${ids.length === 1 ? '' : 'es'}?`,
      description: 'Businesses that cannot change are skipped, and you are told why.',
      confirmLabel: 'Apply',
      required: action === 'suspend',
      danger: action === 'suspend',
      onConfirm: async (reason) => {
        const result = await adminCrmService.bulk(ids, action, reason || undefined);
        toast.show(
          `${result.data.done.length} updated${result.data.skipped.length ? `, ${result.data.skipped.length} skipped (${result.data.skipped[0]?.reason ?? ''})` : ''}`,
        );
        setSelected(new Set());
        list.reload();
      },
    });
  }

  const rows = list.items ?? [];
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));

  return (
    <div>
      <AdminHeader
        title={
          filters.verification === 'PENDING' && !filters.status
            ? 'Business verification'
            : 'Businesses'
        }
        description="Every business account: who owns it, where it stands, and what staff decided."
        action={
          <Link
            href={`${ROUTES.adminBusinesses}/ownership`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            <Icon name="userCheck" className="size-4" /> Ownership check
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilters((current) => ({ ...current, q: draft.q.trim(), city: draft.city.trim() }));
            setPage(1);
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-0 flex-1 basis-60">
            <Icon
              name="search"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={draft.q}
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
              placeholder="Business, slug, owner name or email"
              aria-label="Search businesses"
              className={`${SEARCH_CLASSES} w-full pl-9`}
            />
          </div>
          <input
            type="text"
            value={draft.city}
            onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
            placeholder="City"
            aria-label="City"
            className={`${SEARCH_CLASSES} w-36`}
          />
          <Button type="submit" size="sm" className="h-10">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Category"
            value={filters.categoryId}
            onChange={(event) => setFilter('categoryId', event.target.value)}
            className={SELECT_CLASSES}
          >
            <option value="">All categories</option>
            {categories.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.children.map((leaf) => (
                  <option key={leaf.id} value={leaf.id}>
                    {leaf.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(event) => setFilter('status', event.target.value as BusinessStatus | '')}
            className={SELECT_CLASSES}
          >
            <option value="">Any status</option>
            {BUSINESS_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select
            aria-label="Verification"
            value={filters.verification}
            onChange={(event) =>
              setFilter('verification', event.target.value as VerificationStatus | '')
            }
            className={SELECT_CLASSES}
          >
            <option value="">Any verification</option>
            {VERIFICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-body">
            From
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => setFilter('from', event.target.value)}
              className={SELECT_CLASSES}
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-body">
            to
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => setFilter('to', event.target.value)}
              className={SELECT_CLASSES}
            />
          </label>
          <select
            aria-label="Sort"
            value={filters.sort}
            onChange={(event) => setFilter('sort', event.target.value as Sort)}
            className={SELECT_CLASSES}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft({ q: '', city: '' });
                setFilters({
                  q: '',
                  categoryId: '',
                  city: '',
                  status: '',
                  verification: '',
                  from: '',
                  to: '',
                  sort: filters.sort,
                });
                setPage(1);
              }}
              className="text-sm font-medium text-action"
            >
              Clear filters ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => bulk('verify')}
            className="rounded-lg px-3 py-1.5 font-medium hover:bg-white/10"
          >
            Verify
          </button>
          <button
            type="button"
            onClick={() => bulk('reinstate')}
            className="rounded-lg px-3 py-1.5 font-medium hover:bg-white/10"
          >
            Reinstate
          </button>
          <button
            type="button"
            onClick={() => bulk('suspend')}
            className="rounded-lg px-3 py-1.5 font-medium text-danger-50 hover:bg-white/10"
          >
            Suspend
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-lg px-3 py-1.5 hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      )}

      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No businesses match"
          description={
            activeFilters ? 'Try fewer filters.' : 'Business accounts appear here as they sign up.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-line bg-subtle/60 text-xs font-semibold tracking-wide text-muted uppercase">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allChecked}
                      onChange={() =>
                        setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)))
                      }
                      className="size-4 accent-primary-600"
                    />
                  </th>
                  <th className="px-3 py-3">Business</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="w-12 px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((business) => (
                  <tr
                    key={business.id}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button, a, input')) return;
                      router.push(ROUTES.adminBusiness(business.id));
                    }}
                    className={`cursor-pointer transition-colors hover:bg-subtle/60 ${selected.has(business.id) ? 'bg-primary-50/50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${business.businessName}`}
                        checked={selected.has(business.id)}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(business.id)) next.delete(business.id);
                            else next.add(business.id);
                            return next;
                          })
                        }
                        className="size-4 accent-primary-600"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-50 font-bold text-primary-700">
                          {business.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
                            <img src={business.logoUrl} alt="" className="size-full object-cover" />
                          ) : (
                            business.businessName.charAt(0).toUpperCase()
                          )}
                        </span>
                        <span className="min-w-0">
                          <Link
                            href={ROUTES.adminBusiness(business.id)}
                            className="block truncate font-semibold text-ink hover:text-primary-700"
                          >
                            {business.businessName}
                          </Link>
                          <span className="block truncate text-xs text-muted">
                            {business.liveListingCount}/{business.listingCount} listings live
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[12rem] px-3 py-3">
                      <span className="block truncate text-ink">{business.owner.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {business.owner.email}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-body">{business.category?.name ?? '—'}</td>
                    <td className="px-3 py-3 text-body">{business.city ?? '—'}</td>
                    <td className="px-3 py-3">
                      <BusinessStatusBadges business={business} />
                    </td>
                    <td className="px-3 py-3 text-body">{business.plan.name}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-body">
                      {dateFormat.format(new Date(business.createdAt))}
                    </td>
                    <td className="px-3 py-3">
                      <RowMenu business={business} onAction={(action) => act(business, action)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination
        meta={list.meta}
        page={page}
        onPage={(next) => {
          setPage(next);
          setSelected(new Set());
        }}
      />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
