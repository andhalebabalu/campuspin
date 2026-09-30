'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell, type ShellGroup } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { LoginForm } from '@/features/auth/components/login-form';
import { useSession } from '@/lib/auth/session-context';
import { ADMIN_GROUPS, can, isStaff } from '../lib/access';

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-16">
      <Link href={ROUTES.home} className="flex items-center gap-2 font-bold text-ink">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app icon, a static file. */}
        <img src="/icon.png" alt="" className="size-8 rounded-lg" /> CampusPin Admin
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}

/**
 * The admin panel's frame: staff-only gate, a grouped sidebar with the sections the signed-in
 * staff member may use, and the page. UX only: every `/admin/*` API call is authorised by the server.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh bg-canvas">
        <Skeleton className="hidden h-dvh w-64 rounded-none lg:block" />
        <div className="flex-1 p-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <Centered>
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">Staff sign-in</h1>
          <p className="text-sm text-body">The admin panel is for the CampusPin team.</p>
        </div>
        <LoginForm next={pathname || ROUTES.admin} />
      </Centered>
    );
  }

  if (!isStaff(user)) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-ink">No admin access</h1>
        <p className="mt-2 text-sm text-body">Your account is not a staff account.</p>
        <Link
          href={ROUTES.home}
          className="mt-6 inline-flex h-11 items-center rounded-md bg-action px-5 text-sm font-medium text-white hover:bg-action-hover"
        >
          Go home
        </Link>
      </Centered>
    );
  }

  const groups: ShellGroup[] = ADMIN_GROUPS.map((group) => ({
    label: group.label,
    items: group.sections
      .filter((section) => !section.permission || can(user, section.permission))
      .map((section) => ({
        href: section.href,
        label: section.label,
        icon: section.icon,
        exact: section.href === ROUTES.admin,
      })),
  })).filter((group) => group.items.length > 0);

  const roleLabel = user.roles
    .filter((role) => role !== 'STUDENT' && role !== 'BUSINESS_OWNER')
    .map((role) => role.replace(/_/g, ' ').toLowerCase())
    .join(', ');

  return (
    <AppShell
      title="Admin"
      homeHref={ROUTES.admin}
      groups={groups}
      topBar={
        <>
          <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 capitalize">
            {roleLabel}
          </span>
          <span className="flex-1" />
          <Link
            href={ROUTES.home}
            className="hidden h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-subtle sm:inline-flex"
          >
            <Icon name="external" className="size-4" /> View site
          </Link>
        </>
      }
      account={(collapsed) => (
        <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : ''}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
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
            onClick={() => void logout().then(() => router.push(ROUTES.home))}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-danger-700"
          >
            <Icon name="logout" className="size-[18px]" />
          </button>
        </div>
      )}
    >
      {children}
    </AppShell>
  );
}
