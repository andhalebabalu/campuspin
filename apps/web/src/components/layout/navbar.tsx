'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { BRAND } from '@/constants/brand';
import { useSession } from '@/lib/auth/session-context';

export function Navbar() {
  const { status, user, logout } = useSession();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={ROUTES.home} className="font-display text-lg font-bold text-ink">
          {BRAND.name}
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6">
          <Link href={ROUTES.colleges} className="text-sm font-medium text-body hover:text-ink">
            Colleges
          </Link>

          {status === 'loading' ? (
            <div className="h-9 w-20 animate-pulse rounded-md bg-neutral-100" />
          ) : status === 'authenticated' && user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-body sm:inline">
                Hi, {user.name.split(' ')[0]}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href={ROUTES.login} className="text-sm font-medium text-body hover:text-ink">
                Sign in
              </Link>
              <Link
                href={ROUTES.register}
                className="inline-flex h-9 items-center justify-center rounded-md bg-action px-3 text-sm font-medium text-white transition-colors hover:bg-action-hover"
              >
                Register
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
