'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon, type IconName } from '@/components/ui/icon';
import { useSession } from '@/lib/auth/session-context';
import { InsightsPanel, type DashboardTarget } from '@/features/business/components/insights-panel';
import { Delta, DailyBars, ShareBars } from '../charts';
import { DASHBOARD, TAB_TO_SECTION } from '../routes';
import { ACTION_ROWS, useAnalytics } from '../use-analytics';
import { useOwnedPlace } from '../use-owned-place';
import { mainListing, useWorkspace } from '../workspace';
import { PublicLinkCard } from './public-link';

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  delta,
  tone,
}: {
  icon: IconName;
  label: string;
  value: number | string;
  delta?: ReactNode;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <span className={`flex size-9 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="size-[18px]" />
      </span>
      <div>
        <p className="text-2xl font-bold text-ink">{value}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-body">{label}</p>
          {delta}
        </div>
      </div>
    </div>
  );
}

/** Suspended / rejected / not yet live: said plainly at the top, with what to do. */
function StatusBanner() {
  const { dashboard, listings } = useWorkspace();
  const { profile, stats } = dashboard;
  let banner: { tone: string; icon: IconName; title: string; body: ReactNode } | null = null;
  if (profile.status === 'SUSPENDED') {
    banner = {
      tone: 'border-danger-600/30 bg-danger-50',
      icon: 'ban',
      title: 'Your business is suspended',
      body: (
        <>
          Your page and listings are hidden from students.
          {profile.statusReason && <> Reason: “{profile.statusReason}”.</>} Contact CampusPin
          support to resolve it.
        </>
      ),
    };
  } else if (profile.verificationStatus === 'REJECTED') {
    banner = {
      tone: 'border-danger-600/30 bg-danger-50',
      icon: 'alert',
      title: 'Your business was not approved',
      body: (
        <>
          {profile.statusReason ? <>Reason: “{profile.statusReason}”. </> : null}
          Update your details and contact support to be reviewed again.
        </>
      ),
    };
  } else if (!profile.isPublic) {
    banner = {
      tone: 'border-amber-600/30 bg-amber-50',
      icon: 'clock',
      title:
        listings.length === 0 ? 'Add your place to go live' : 'Your page is waiting for review',
      body:
        listings.length === 0 ? (
          <>
            Add your place with its exact location and a few photos. Our team reviews it, then your
            page goes live at your CampusPin link.{' '}
            <Link href={DASHBOARD.newListing} className="font-semibold underline">
              Add your place
            </Link>
          </>
        ) : stats.listings.underReview > 0 ? (
          'Our team is reviewing your listing, usually within a day. You can prepare your page meanwhile.'
        ) : (
          'None of your listings is live yet. Check Listings for the review notes.'
        ),
    };
  }
  if (!banner) return null;
  return (
    <div className={`mb-6 flex gap-3 rounded-2xl border p-4 ${banner.tone}`}>
      <Icon name={banner.icon} className="mt-0.5 size-5 text-ink" />
      <div className="text-sm text-ink">
        <p className="font-semibold">{banner.title}</p>
        <p className="mt-0.5 text-body">{banner.body}</p>
      </div>
    </div>
  );
}

/** What is still missing from a good page, computed from the real data (nothing to tick by hand). */
function Checklist() {
  const { dashboard, listings } = useWorkspace();
  const main = mainListing(listings);
  const { place } = useOwnedPlace(main?.id);
  const { profile } = dashboard;
  const steps = [
    {
      done: listings.length > 0,
      label: 'Add your place and its location',
      href: DASHBOARD.newListing,
    },
    { done: !!profile.logoUrl, label: 'Upload your logo', href: DASHBOARD.profile },
    { done: !!profile.coverUrl, label: 'Add a cover image', href: DASHBOARD.profile },
    { done: !!profile.description, label: 'Describe your business', href: DASHBOARD.profile },
    {
      done: !!(profile.phone || profile.whatsapp),
      label: 'Add a phone or WhatsApp number',
      href: DASHBOARD.profile,
    },
    {
      done: (place?.images.length ?? 0) >= 3,
      label: 'Add at least 3 photos',
      href: DASHBOARD.photos,
    },
    {
      done: (place?.hours.length ?? 0) > 0,
      label: 'Set your opening hours',
      href: DASHBOARD.hours,
    },
  ];
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  return (
    <Panel
      title="Complete your page"
      action={
        <span className="text-sm font-medium text-muted">
          {done} of {steps.length} done
        </span>
      }
    >
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-subtle">
        <div
          className="h-full rounded-full bg-accent-600"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-subtle"
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full ${step.done ? 'bg-accent-600 text-white' : 'border-2 border-line'}`}
              >
                {step.done && <Icon name="check" className="size-3" />}
              </span>
              <span className={step.done ? 'text-muted line-through' : 'text-ink'}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Overview() {
  const router = useRouter();
  const { user } = useSession();
  const { dashboard } = useWorkspace();
  const { data, error } = useAnalytics(30);
  const { profile, stats } = dashboard;
  const firstName = user?.name.split(' ')[0] ?? '';

  const last7 = data?.daily.slice(-7).map((day) => ({ day: day.day, value: day.PAGE_VIEW })) ?? [];
  const noEvents = data ? Object.values(data.totals).every((value) => value === 0) : false;

  return (
    <>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''} 👋`}
        description="Manage your business presence on CampusPin."
        actions={
          <Link
            href={DASHBOARD.newListing}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover"
          >
            <Icon name="plus" className="size-4" /> Add a listing
          </Link>
        }
      />
      <StatusBanner />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        {data ? (
          <>
            <StatTile
              icon="eye"
              label="Page views"
              value={data.totals.PAGE_VIEW}
              tone="bg-primary-50 text-primary-600"
              delta={<Delta now={data.totals.PAGE_VIEW} before={data.previousTotals.PAGE_VIEW} />}
            />
            <StatTile
              icon="phone"
              label="Calls"
              value={data.totals.PHONE_CLICK}
              tone="bg-primary-50 text-primary-600"
              delta={
                <Delta now={data.totals.PHONE_CLICK} before={data.previousTotals.PHONE_CLICK} />
              }
            />
            <StatTile
              icon="whatsapp"
              label="WhatsApp"
              value={data.totals.WHATSAPP_CLICK}
              tone="bg-accent-50 text-accent-700"
              delta={
                <Delta
                  now={data.totals.WHATSAPP_CLICK}
                  before={data.previousTotals.WHATSAPP_CLICK}
                />
              }
            />
            <StatTile
              icon="navigation"
              label="Directions"
              value={data.totals.DIRECTION_CLICK}
              tone="bg-amber-50 text-amber-600"
              delta={
                <Delta
                  now={data.totals.DIRECTION_CLICK}
                  before={data.previousTotals.DIRECTION_CLICK}
                />
              }
            />
            <StatTile
              icon="share"
              label="Shares"
              value={data.totals.SHARE_CLICK}
              tone="bg-violet-50 text-violet-600"
              delta={
                <Delta now={data.totals.SHARE_CLICK} before={data.previousTotals.SHARE_CLICK} />
              }
            />
            <StatTile
              icon="star"
              label="Reviews"
              value={stats.reviews.count}
              tone="bg-amber-50 text-amber-600"
              delta={
                stats.reviews.count > 0 ? (
                  <span className="text-xs text-muted">
                    ★ {stats.reviews.averageRating.toFixed(1)}
                  </span>
                ) : undefined
              }
            />
          </>
        ) : error ? (
          <p className="col-span-full rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
            Analytics are not available right now.{' '}
            {profile.status !== 'ACTIVE' && 'They return once your business is active.'}
          </p>
        ) : (
          Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        Last 30 days, counted from real visits to your page.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Page views — last 7 days" className="lg:col-span-2">
          {!data ? (
            <Skeleton className="h-48 w-full" />
          ) : noEvents ? (
            <EmptyAnalytics />
          ) : (
            <DailyBars days={last7} label="Page views, last 7 days" />
          )}
        </Panel>
        <Panel title="Customer actions">
          {!data ? (
            <Skeleton className="h-48 w-full" />
          ) : noEvents ? (
            <p className="text-sm text-muted">
              Calls, WhatsApp messages and directions appear here.
            </p>
          ) : (
            <ShareBars
              rows={ACTION_ROWS.map((row) => ({
                label: row.label,
                value: data.totals[row.key],
                color: row.color,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Checklist />
        </div>
        <PublicLinkCard compact />
      </div>

      <div className="mt-6">
        <InsightsPanel
          onOpen={(target: DashboardTarget) =>
            router.push(TAB_TO_SECTION[target] ?? DASHBOARD.home)
          }
        />
      </div>
    </>
  );
}

export function EmptyAnalytics() {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <Icon name="chart" className="size-5" />
      </span>
      <p className="font-semibold text-ink">No analytics yet</p>
      <p className="max-w-xs text-sm text-muted">
        Analytics will appear once students start visiting your page. Share your business page to
        get your first visitors.
      </p>
      <Link href={DASHBOARD.share} className="mt-1 text-sm font-semibold text-action">
        Share your page →
      </Link>
    </div>
  );
}
