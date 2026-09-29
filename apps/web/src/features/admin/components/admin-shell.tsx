'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { LoginForm } from '@/features/auth/components/login-form';
import { useSession } from '@/lib/auth/session-context';
import { ADMIN_SECTIONS, can, isStaff } from '../lib/access';

const LINK_CLASSES =
  'inline-flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white transition-colors hover:bg-action-hover';

/**
 * The admin panel's frame: staff-only gate, a sidebar with the sections the signed-in staff member
 * may use, and the page. UX only: every `/admin/*` API call is authorised by the server.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const pathname = usePathname();

  if (status === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="hidden h-96 w-56 lg:block" />
        <Skeleton className="h-96 flex-1" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-ink">Staff sign-in</h1>
          <p className="text-body">The admin panel is for the CampusPin team.</p>
        </div>
        <LoginForm next={pathname || ROUTES.admin} />
      </main>
    );
  }

  if (!isStaff(user)) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16">
        <EmptyState
          title="No admin access"
          description="Your account is not a staff account."
          action={
            <Link href={ROUTES.home} className={LINK_CLASSES}>
              Go home
            </Link>
          }
        />
      </main>
    );
  }

  const sections = ADMIN_SECTIONS.filter(
    (section) => !section.permission || can(user, section.permission),
  );
  const active = (href: string) =>
    href === ROUTES.admin
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">
      <aside className="shrink-0 lg:w-56">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Admin ·{' '}
          {user.roles
            .filter((role) => role !== 'STUDENT')
            .join(', ')
            .replace(/_/g, ' ')}
        </p>
        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active(section.href) ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active(section.href)
                  ? 'bg-primary-50 text-primary-800'
                  : 'text-body hover:bg-subtle hover:text-ink'
              }`}
            >
              <Icon name={section.icon} className="size-4" />
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
