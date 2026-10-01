'use client';

import { ApiClientError } from '@platform/api-client';
import {
  adminUpdateBusinessRequestSchema,
  type AdminBusinessDetail,
  type AdminPlan,
  type AuditEntry,
  type PlaceDetail,
  type PublicBusiness,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ROUTES } from '@/constants/routes';
import { BusinessPageView } from '@/features/business-page/components/business-page-view';
import { env } from '@/lib/env';
import { firstFieldErrors, flattenZodErrors } from '@/lib/forms/errors';
import { adminCrmService } from '@/services/admin-crm.service';
import { businessPagesService } from '@/services/business.service';
import { placesService } from '@/services/places.service';
import { ReasonDialog, dateFormat, errorMessage, type ReasonRequest } from './admin-ui';
import { BusinessStatusBadges } from './business-badges';
import { CapabilityPanel } from './capability-panel';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'listings', label: 'Listings' },
  { id: 'capabilities', label: 'Type & capabilities' },
  { id: 'page', label: 'Webpage preview' },
  { id: 'history', label: 'History' },
  { id: 'edit', label: 'Edit' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function Panel({
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
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words text-ink">{children ?? '—'}</dd>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  BUSINESS_VERIFIED: 'Verified',
  BUSINESS_UNVERIFIED: 'Verification removed',
  BUSINESS_REJECTED: 'Rejected',
  BUSINESS_SUSPENDED: 'Suspended',
  BUSINESS_REINSTATED: 'Reinstated',
  BUSINESS_EDITED_BY_STAFF: 'Edited by staff',
  BUSINESS_PROFILE_UPDATED: 'Profile updated by owner',
  BUSINESS_OWNER_TRANSFERRED: 'Owner changed',
  BUSINESS_PLAN_ASSIGNED: 'Plan changed',
  PLACE_UPDATED: 'Listing edited',
  PLACE_ACTIVATED: 'Listing published',
  PLACE_DEACTIVATED: 'Listing unpublished',
  PLACE_IMAGE_ADDED: 'Photo added',
  PLACE_IMAGE_REMOVED: 'Photo removed',
  PLACE_IMAGE_UPDATED: 'Photo changed',
};

function History({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted">Nothing recorded yet.</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-5">
      {entries.map((entry) => {
        const reason = typeof entry.metadata?.reason === 'string' ? entry.metadata.reason : null;
        return (
          <li key={entry.id} className="relative">
            <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-surface bg-primary-500" />
            <p className="text-sm font-medium text-ink">
              {ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, ' ').toLowerCase()}
              {entry.entityType === 'Place' && (
                <span className="font-normal text-muted"> · listing</span>
              )}
            </p>
            <p className="text-xs text-muted">
              {dateTime.format(new Date(entry.createdAt))} ·{' '}
              {entry.actor ? entry.actor.name : 'System'}
            </p>
            {reason && (
              <p className="mt-1 rounded-lg bg-subtle px-3 py-1.5 text-sm text-body">“{reason}”</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The public page exactly as students see it (only while it is live). */
function PagePreview({ business }: { business: AdminBusinessDetail }) {
  const [data, setData] = useState<{ business: PublicBusiness; place: PlaceDetail } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!business.isPublic) return;
    const controller = new AbortController();
    businessPagesService
      .get(business.slug, controller.signal)
      .then(async (result) => {
        const main = result.data.branches[0];
        if (!main) throw new Error('no branch');
        const place = await placesService.getBySlug(main.slug, controller.signal);
        setData({ business: result.data, place: place.data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [business.isPublic, business.slug]);

  if (!business.isPublic) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-body">
        The page is not live, so students see nothing at its link. It goes live once the business is
        active, not rejected, and at least one listing is approved.
      </p>
    );
  }
  if (failed) return <p className="text-sm text-danger-700">Could not load the page.</p>;
  if (!data) return <Skeleton className="h-[32rem] w-full rounded-2xl" />;
  const url = new URL(ROUTES.businessPage(business.slug), env.NEXT_PUBLIC_SITE_URL).toString();
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <BusinessPageView place={data.place} business={data.business} pageUrl={url} preview />
    </div>
  );
}

function PlanPanel({
  business,
  onSaved,
}: {
  business: AdminBusinessDetail;
  onSaved: (next: AdminBusinessDetail) => void;
}) {
  const toast = useToast();
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [planKey, setPlanKey] = useState(business.subscription.plan.key);
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    adminCrmService
      .plans(controller.signal)
      .then((result) => setPlans(result.data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const result = await adminCrmService.assignPlan(business.id, {
        planKey,
        ...(endsAt ? { endsAt } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSaved(result.data);
      setNote('');
      toast.show('Plan updated');
    } catch (caught) {
      toast.show(errorMessage(caught, 'Could not change the plan.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const { subscription } = business;
  return (
    <Panel title="Subscription">
      <p className="text-lg font-bold text-ink">{subscription.plan.name}</p>
      <p className="text-sm text-muted">
        {subscription.isDefault
          ? 'Default plan: every business is on it unless staff assign another.'
          : `Since ${dateFormat.format(new Date(subscription.startedAt ?? ''))}${subscription.endsAt ? `, until ${dateFormat.format(new Date(subscription.endsAt))}` : ''}`}
      </p>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <label className="text-sm font-medium text-ink" htmlFor="plan">
          Change plan (no payment is taken)
        </label>
        <select
          id="plan"
          value={planKey}
          onChange={(event) => setPlanKey(event.target.value)}
          className="h-10 rounded-lg border border-control bg-surface px-3 text-sm"
        >
          {(plans ?? []).map((plan) => (
            <option key={plan.key} value={plan.key}>
              {plan.name}
              {plan.isAvailable ? '' : ' (not on sale)'}
            </option>
          ))}
        </select>
        {!plans?.find((plan) => plan.key === planKey)?.isDefault && (
          <input
            type="date"
            aria-label="Ends on (optional)"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className="h-10 rounded-lg border border-control bg-surface px-3 text-sm"
          />
        )}
        <input
          type="text"
          maxLength={500}
          placeholder="Note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="h-10 rounded-lg border border-control bg-surface px-3 text-sm"
        />
        <Button
          size="sm"
          onClick={() => void save()}
          loading={busy}
          disabled={!plans || (planKey === subscription.plan.key && !endsAt)}
        >
          Apply plan
        </Button>
      </div>
    </Panel>
  );
}

function TransferPanel({
  business,
  onSaved,
}: {
  business: AdminBusinessDetail;
  onSaved: (next: AdminBusinessDetail) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function transfer() {
    if (
      !window.confirm(`Give ${business.businessName} to ${email}? The current owner loses access.`)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminCrmService.transfer(business.id, email.trim(), reason.trim());
      onSaved(result.data);
      setEmail('');
      setReason('');
      toast.show('Owner changed');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.fieldErrors
          ? (Object.values(caught.fieldErrors)[0]?.[0] ?? caught.message)
          : errorMessage(caught, 'Could not transfer.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Transfer ownership">
      <p className="mb-3 text-sm text-body">
        For a new owner, or a business run from a student account. The new owner must have a
        business account with no other business.
      </p>
      <div className="flex flex-col gap-2">
        <input
          type="email"
          placeholder="New owner's email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 rounded-lg border border-control bg-surface px-3 text-sm"
        />
        <input
          type="text"
          placeholder="Reason"
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-10 rounded-lg border border-control bg-surface px-3 text-sm"
        />
        {error && <p className="text-sm text-danger-700">{error}</p>}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void transfer()}
          loading={busy}
          disabled={!email.trim() || !reason.trim()}
        >
          Transfer
        </Button>
      </div>
    </Panel>
  );
}

const EDIT_FIELDS = [
  ['businessName', 'Business name'],
  ['city', 'City'],
  ['phone', 'Phone'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'Public email'],
  ['website', 'Website'],
  ['instagramUrl', 'Instagram'],
  ['facebookUrl', 'Facebook'],
] as const;
type EditField = (typeof EDIT_FIELDS)[number][0] | 'description';

function EditPanel({
  business,
  onSaved,
}: {
  business: AdminBusinessDetail;
  onSaved: (next: AdminBusinessDetail) => void;
}) {
  const toast = useToast();
  const initial = (): Record<EditField, string> => ({
    businessName: business.businessName,
    city: business.city ?? '',
    phone: business.phone ?? '',
    whatsapp: business.whatsapp ?? '',
    email: business.email ?? '',
    website: business.website ?? '',
    instagramUrl: business.instagramUrl ?? '',
    facebookUrl: business.facebookUrl ?? '',
    description: business.description ?? '',
  });
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const before = initial();
    const changes: Record<string, string | null> = {};
    for (const key of Object.keys(values) as EditField[]) {
      if (values[key].trim() === before[key].trim()) continue;
      changes[key] =
        key !== 'businessName' && key !== 'city' && values[key].trim() === ''
          ? null
          : values[key].trim();
    }
    if (Object.keys(changes).length === 0) return;
    const parsed = adminUpdateBusinessRequestSchema.safeParse(changes);
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      onSaved((await adminCrmService.update(business.id, parsed.data)).data);
      toast.show('Business updated');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors)
        setErrors(firstFieldErrors(caught.fieldErrors));
      else toast.show(errorMessage(caught, 'Could not save.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Edit business profile">
      <p className="mb-4 text-sm text-muted">
        Corrections are recorded in the history with your name.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {EDIT_FIELDS.map(([key, label]) => (
          <Input
            key={key}
            label={label}
            value={values[key]}
            error={errors[key]}
            onChange={(event) =>
              setValues((current) => ({ ...current, [key]: event.target.value }))
            }
          />
        ))}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="admin-description" className="text-sm font-medium text-ink">
            Description
          </label>
          <textarea
            id="admin-description"
            rows={4}
            value={values.description}
            maxLength={2000}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
            className="rounded-md border border-control bg-surface px-3.5 py-2.5 text-base text-ink"
          />
          {errors.description && <p className="text-sm text-danger-700">{errors.description}</p>}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => void save()} loading={busy}>
          Save changes
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setValues(initial());
            setErrors({});
          }}
        >
          Reset
        </Button>
      </div>
    </Panel>
  );
}

/** One business, everything staff need to decide about it. */
export function BusinessDetailScreen({ businessId }: { businessId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [business, setBusiness] = useState<AdminBusinessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<Tab>('overview');
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const refresh = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    adminCrmService
      .business(businessId, controller.signal)
      .then((result) => {
        setBusiness(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(caught, 'Could not load this business.'));
      });
    return () => controller.abort();
  }, [businessId, reload]);

  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (!business) return <Skeleton className="h-[36rem] w-full rounded-2xl" />;

  const decide = (
    action: 'verify' | 'unverify' | 'reject' | 'suspend' | 'reinstate',
    title: string,
    description: string,
    required: boolean,
    danger = false,
  ) =>
    setDialog({
      title,
      description,
      confirmLabel: title.replace(/\?$/, '').split(' ')[0] ?? 'Confirm',
      required,
      danger,
      onConfirm: async (reason) => {
        await adminCrmService.decide(business.id, action, reason || undefined);
        toast.show('Done');
        refresh();
      },
    });

  const remove = () =>
    setDialog({
      title: `Delete ${business.businessName}?`,
      description:
        'This cannot be undone. The owner keeps their account but no longer has a business.',
      confirmLabel: 'Delete',
      required: false,
      danger: true,
      onConfirm: async () => {
        await adminCrmService.remove(business.id);
        toast.show('Business deleted');
        router.push(ROUTES.adminBusinesses);
      },
    });

  return (
    <div>
      <Link
        href={ROUTES.adminBusinesses}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-action"
      >
        <Icon name="arrowLeft" className="size-4" /> Businesses
      </Link>

      <div className="mb-6 flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-50 text-2xl font-bold text-primary-700">
            {business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
              <img src={business.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              business.businessName.charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-ink">{business.businessName}</h1>
            <p className="text-sm text-muted">
              {[business.category?.name, business.city].filter(Boolean).join(' · ') ||
                'No category yet'}
              {' · '}
              {business.isPublic ? (
                <a
                  href={ROUTES.businessPage(business.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-action"
                >
                  /business/{business.slug}
                </a>
              ) : (
                <span>/business/{business.slug}</span>
              )}
            </p>
            <div className="mt-2">
              <BusinessStatusBadges business={business} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {business.verificationStatus === 'VERIFIED' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                decide('unverify', 'Remove verification?', 'The Verified badge disappears.', false)
              }
            >
              Unverify
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                decide('verify', 'Verify this business?', 'Students see a Verified badge.', false)
              }
            >
              <Icon name="check" className="size-4" /> Verify
            </Button>
          )}
          {business.verificationStatus !== 'REJECTED' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                decide(
                  'reject',
                  'Reject this business?',
                  'Its page and listings are hidden; the owner sees your reason.',
                  true,
                  true,
                )
              }
            >
              Reject
            </Button>
          )}
          {business.status === 'SUSPENDED' || business.verificationStatus === 'REJECTED' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                decide(
                  'reinstate',
                  'Reinstate this business?',
                  'Its hidden listings come back.',
                  false,
                )
              }
            >
              Reinstate
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                decide(
                  'suspend',
                  'Suspend this business?',
                  'Its page and listings are hidden and its dashboard frozen; the owner sees your reason.',
                  true,
                  true,
                )
              }
            >
              Suspend
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setTab('edit')}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!business.deletable}
            title={business.deleteBlockedBecause ?? undefined}
            onClick={remove}
            className="text-danger-700"
          >
            Delete
          </Button>
        </div>
      </div>
      {business.statusReason && (
        <p className="mb-4 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Reason on record: “{business.statusReason}”
        </p>
      )}
      {!business.deletable && business.deleteBlockedBecause && (
        <p className="mb-4 text-xs text-muted">
          Delete is unavailable: {business.deleteBlockedBecause}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Business"
        className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-subtle p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${tab === item.id ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'}`}
          >
            {item.label}
            {item.id === 'listings' && ` (${business.listings.length})`}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ['Live listings', `${business.liveListingCount}/${business.listingCount}`],
                  [
                    'Reviews',
                    business.reviews.count > 0
                      ? `${business.reviews.count} · ★ ${business.reviews.averageRating.toFixed(1)}`
                      : '0',
                  ],
                  ['Page views (30 d)', String(business.analytics.pageViews)],
                  ['Open reports', String(business.openReports)],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-line bg-surface p-4 shadow-xs"
                >
                  <p className="text-xl font-bold text-ink">{value}</p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>
            <Panel title="Business profile">
              <dl className="divide-y divide-line">
                <Row label="Description">{business.description}</Row>
                <Row label="Phone">{business.phone}</Row>
                <Row label="WhatsApp">{business.whatsapp}</Row>
                <Row label="Public email">{business.email}</Row>
                <Row label="Website">{business.website}</Row>
                <Row label="Instagram">{business.instagramUrl}</Row>
                <Row label="Facebook">{business.facebookUrl}</Row>
                <Row label="Verified on">
                  {business.verifiedAt ? dateFormat.format(new Date(business.verifiedAt)) : null}
                </Row>
                <Row label="Created">{dateFormat.format(new Date(business.createdAt))}</Row>
              </dl>
              {(business.coverUrl ?? business.logoUrl) && (
                <div className="mt-4 flex gap-3">
                  {[business.logoUrl, business.coverUrl].filter(Boolean).map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
                    <img
                      key={url}
                      src={url ?? ''}
                      alt=""
                      className="h-20 rounded-lg border border-line object-cover"
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
          <div className="flex flex-col gap-6">
            <Panel title="Owner">
              <p className="font-semibold text-ink">{business.owner.name}</p>
              <p className="text-sm text-body">{business.owner.email}</p>
              <dl className="mt-3 divide-y divide-line">
                <Row label="Account">
                  {business.owner.roles
                    .map((role) => role.replace(/_/g, ' ').toLowerCase())
                    .join(', ')}
                </Row>
                <Row label="Status">{business.owner.status.toLowerCase()}</Row>
                <Row label="Joined">{dateFormat.format(new Date(business.owner.createdAt))}</Row>
                <Row label="Last active">
                  {business.owner.lastActiveAt
                    ? dateFormat.format(new Date(business.owner.lastActiveAt))
                    : 'Never'}
                </Row>
              </dl>
              {business.owner.roles.includes('STUDENT') && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-600">
                  This business is owned by a student account. Transfer it to a business account
                  below.
                </p>
              )}
            </Panel>
            <PlanPanel business={business} onSaved={setBusiness} />
            <TransferPanel business={business} onSaved={setBusiness} />
          </div>
        </div>
      )}

      {tab === 'listings' &&
        (business.listings.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">
            No listings yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line bg-subtle/60 text-xs font-semibold tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Rating</th>
                  <th className="px-3 py-3">Enquiries</th>
                  <th className="px-3 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {business.listings.map((listing) => (
                  <tr key={listing.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={ROUTES.adminPlace(listing.id)}
                        className="font-semibold text-ink hover:text-primary-700"
                      >
                        {listing.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {listing.primaryCategory?.name ?? ''} · {listing.city}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-body">
                      {listing.status.toLowerCase()}
                      {listing.review?.note && (
                        <span className="block text-xs text-muted">“{listing.review.note}”</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-body">
                      {listing.ratingCount > 0
                        ? `★ ${listing.ratingAverage.toFixed(1)} (${listing.ratingCount})`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-body">{listing.enquiryCount}</td>
                    <td className="px-3 py-3 text-body">
                      {dateFormat.format(new Date(listing.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === 'capabilities' && <CapabilityPanel businessId={business.id} />}

      {tab === 'page' && <PagePreview business={business} />}

      {tab === 'history' && (
        <Panel title="Verification & activity history">
          <History entries={business.history} />
          {business.subscriptionHistory.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Plan history</h3>
              <ul className="flex flex-col gap-1 text-sm text-body">
                {business.subscriptionHistory.map((sub) => (
                  <li key={sub.startedAt}>
                    {sub.plan.name} · {dateFormat.format(new Date(sub.startedAt))} to{' '}
                    {sub.endedAt
                      ? dateFormat.format(new Date(sub.endedAt))
                      : sub.endsAt
                        ? dateFormat.format(new Date(sub.endsAt))
                        : 'now'}{' '}
                    ({sub.status.toLowerCase()}){sub.note && ` · ${sub.note}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {tab === 'edit' && (
        <EditPanel
          key={business.id + business.businessName}
          business={business}
          onSaved={setBusiness}
        />
      )}

      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
