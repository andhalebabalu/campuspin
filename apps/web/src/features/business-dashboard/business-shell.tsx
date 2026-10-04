'use client';

import type { BusinessCapability, BusinessProfile } from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell, type ShellGroup } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { GROUP_ORDER, MODULES, moduleAllowed, moduleOf } from './modules';
import { DASHBOARD } from './routes';
import { useWorkspaceState } from './workspace';

function groupsFor(
  capabilities: readonly BusinessCapability[],
  newEnquiries: number,
): ShellGroup[] {
  return GROUP_ORDER.map((group) => ({
    label: group,
    items: MODULES.filter(
      (module) => module.group === group && moduleAllowed(module, capabilities),
    ).map((module) => ({
      href: module.href,
      label: module.label,
      icon: module.icon,
      exact: module.exact,
      ...(module.href === DASHBOARD.enquiries ? { badge: newEnquiries } : {}),
    })),
  })).filter((group) => group.items.length > 0);
}

/** A module the business's type does not include: said plainly, never a blank page. */
function NotAvailable({ label }: { label: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon name="ban" className="size-6" />
      </span>
      <h1 className="text-xl font-bold text-ink">{label} is not part of your business</h1>
      <p className="text-sm text-body">
        Modules depend on your type of business. If you think you need this one, contact the
        CampusPin team.
      </p>
      <Link href={DASHBOARD.home} className="text-sm font-semibold text-action">
        Back to your dashboard
      </Link>
    </div>
  );
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
      <UserAvatar name={user.name} url={user.avatarUrl} />
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
  const pathname = usePathname();
  const current = moduleOf(pathname);
  const blocked =
    ready && current && !moduleAllowed(current, ready.capabilities.capabilities) ? current : null;
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
      groups={groupsFor(
        ready?.capabilities.capabilities ?? [],
        ready?.dashboard.stats.enquiries.new ?? 0,
      )}
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
      ) : blocked ? (
        <NotAvailable label={blocked.label} />
      ) : (
        children
      )}
    </AppShell>
  );
}
