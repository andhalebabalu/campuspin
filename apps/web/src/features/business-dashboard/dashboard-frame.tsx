'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { LoginForm } from '@/features/auth/components/login-form';
import { useSession } from '@/lib/auth/session-context';
import { BusinessShell } from './business-shell';
import { DASHBOARD } from './routes';
import { WorkspaceProvider } from './workspace';

const LINK =
  'inline-flex h-11 items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white hover:bg-action-hover';

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-16">
      <Link href={ROUTES.home} className="flex items-center gap-2 font-bold text-ink">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app icon, a static file. */}
        <img src="/icon.png" alt="" className="size-8 rounded-lg" /> CampusPin Business
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}

/**
 * The whole dashboard: business accounts get their workspace; everyone else is told why not. UX
 * only: every `/business/*` API call is checked by the server regardless.
 */
export function DashboardFrame({ children }: { children: ReactNode }) {
  const { status, user } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh bg-canvas">
        <Skeleton className="hidden h-dvh w-64 rounded-none lg:block" />
        <div className="flex-1 p-8">
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <Centered>
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">Sign in to your business</h1>
          <p className="text-sm text-body">
            New to CampusPin?{' '}
            <Link href={ROUTES.registerBusiness} className="font-medium text-action">
              Create a business account
            </Link>
          </p>
        </div>
        <LoginForm next={DASHBOARD.home} />
      </Centered>
    );
  }

  if (!user.roles.includes('BUSINESS_OWNER')) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-ink">This dashboard is for business accounts</h1>
        <p className="mt-2 text-sm text-body">
          You are signed in with a {user.roles.includes('STUDENT') ? 'student' : 'staff'} account.
          Student and business accounts are separate: to list a business, create a business account
          with another email.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={ROUTES.home} className={LINK}>
            Go to CampusPin
          </Link>
          <Link
            href={ROUTES.registerBusiness}
            className="inline-flex h-11 items-center rounded-md border border-control px-5 text-sm font-medium text-ink hover:bg-subtle"
          >
            Create a business account
          </Link>
        </div>
      </Centered>
    );
  }

  return (
    <WorkspaceProvider>
      <BusinessShell>{children}</BusinessShell>
    </WorkspaceProvider>
  );
}
