'use client';

import type { BusinessProfile } from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell, type ShellGroup } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { DASHBOARD } from './routes';
import { useWorkspaceState } from './workspace';

function groupsFor(newEnquiries: number): ShellGroup[] {
  return [
    {
      label: 'Overview',
      items: [{ href: DASHBOARD.home, label: 'Dashboard', icon: 'grid', exact: true }],
    },
    {
      label: 'My business',
      items: [
        { href: DASHBOARD.profile, label: 'Business profile', icon: 'store' },
        { href: DASHBOARD.publicPage, label: 'Public page', icon: 'globe' },
        { href: DASHBOARD.services, label: 'Services & menu', icon: 'receipt' },
        { href: DASHBOARD.photos, label: 'Photos', icon: 'image' },
        { href: DASHBOARD.hours, label: 'Opening hours', icon: 'clock' },
        { href: DASHBOARD.location, label: 'Location', icon: 'pin' },
        { href: DASHBOARD.listings, label: 'Listings', icon: 'layers' },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { href: DASHBOARD.reviews, label: 'Reviews', icon: 'star' },
        { href: DASHBOARD.enquiries, label: 'Enquiries', icon: 'chat', badge: newEnquiries },
        { href: DASHBOARD.offers, label: 'Offers', icon: 'tag' },
        { href: DASHBOARD.orders, label: 'Orders & bookings', icon: 'cart' },
        { href: DASHBOARD.qr, label: 'QR codes', icon: 'qr' },
      ],
    },
    {
      label: 'Growth',
      items: [
        { href: DASHBOARD.analytics, label: 'Analytics', icon: 'chart' },
        { href: DASHBOARD.share, label: 'Share page', icon: 'share' },
      ],
    },
    {
      label: 'Account',
      items: [
        { href: DASHBOARD.subscription, label: 'Subscription', icon: 'card' },
        { href: DASHBOARD.settings, label: 'Settings', icon: 'settings' },
        { href: DASHBOARD.help, label: 'Help & support', icon: 'help' },
      ],
    },
  ];
}

/** 🟢 Verified / 🟡 Pending / 🔴 Rejected or suspended: always what staff actually decided. */
export function StatusBadge({ profile }: { profile: BusinessProfile }) {
  const [tone, label] =
    profile.status === 'SUSPENDED'
      ? ['bg-danger-50 text-danger-700', 'Suspended']
      : profile.status === 'INACTIVE'
        ? ['bg-subtle text-body', 'Closed']
        : profile.verificationStatus === 'VERIFIED'
          ? ['bg-success-50 text-success-700', 'Verified business']
          : profile.verificationStatus === 'REJECTED'
            ? ['bg-danger-50 text-danger-700', 'Not approved']
            : ['bg-amber-50 text-amber-600', 'Verification pending'];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

function Account({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useSession();
  const router = useRouter();
  if (!user) return null;
  const signOut = async () => {
    await logout();
    router.push(ROUTES.businessLogin);
  };
  return (
    <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : ''}`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
        {user.name.charAt(0).toUpperCase()}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-xs text-muted">{user.email}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label="Sign out"
        title="Sign out"
        className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-danger-700"
      >
        <Icon name="logout" className="size-[18px]" />
      </button>
    </div>
  );
}

/** The business dashboard frame: sidebar, top bar with status and the public page, the section. */
export function BusinessShell({ children }: { children: ReactNode }) {
  const { state, retry } = useWorkspaceState();
  const ready = state.status === 'ready' ? state : null;
  const profile = ready?.dashboard.profile;

  const topBar = profile ? (
    <>
      <span className="min-w-0 truncate text-sm font-semibold text-ink sm:text-base">
        {profile.businessName}
      </span>
      <StatusBadge profile={profile} />
      <span className="flex-1" />
      {profile.isPublic ? (
        <a
          href={ROUTES.businessPage(profile.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-subtle sm:inline-flex"
        >
          <Icon name="external" className="size-4" /> View public page
        </a>
      ) : (
        <Link
          href={DASHBOARD.preview}
          className="hidden h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-subtle sm:inline-flex"
        >
          <Icon name="eye" className="size-4" /> Preview
        </Link>
      )}
    </>
  ) : (
    <Skeleton className="h-5 w-48" />
  );

  return (
    <AppShell
      title="Business"
      homeHref={DASHBOARD.home}
      groups={groupsFor(ready?.dashboard.stats.enquiries.new ?? 0)}
      topBar={topBar}
      account={(collapsed) => <Account collapsed={collapsed} />}
    >
      {state.status === 'error' ? (
        <ErrorState message={state.message} requestId={state.requestId} onRetry={retry} />
      ) : state.status === 'loading' ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-9 w-72" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
