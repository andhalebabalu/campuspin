'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { BRAND } from '@/constants/brand';
import { isStaff } from '@/features/admin/lib/access';
import { useSession } from '@/lib/auth/session-context';
import { MessagesLink } from './messages-link';
import { NotificationBell } from './notification-bell';

const NAV_LINKS = [
  { href: ROUTES.search, label: 'Discover' },
  { href: ROUTES.colleges, label: 'Colleges' },
  { href: ROUTES.community, label: 'Community' },
  { href: ROUTES.marketplace, label: 'Marketplace' },
  { href: `${ROUTES.home}#for-businesses`, label: 'For businesses' },
  { href: ROUTES.suggestPlace, label: 'Suggest a place' },
];

function AccountActions({ onNavigate }: { onNavigate?: () => void }) {
  const { status, user, logout } = useSession();

  if (status === 'loading') {
    return <div className="h-9 w-40 animate-pulse rounded-full bg-neutral-100" />;
  }
  if (status === 'authenticated' && user) {
    return (
      <div className="flex items-center gap-3">
        {user.student.verified && <MessagesLink onNavigate={onNavigate} />}
        <NotificationBell onNavigate={onNavigate} />
        <Link
          href={ROUTES.me}
          onClick={onNavigate}
          className="flex items-center gap-1.5 text-sm text-body hover:text-ink"
        >
          Hi, {user.name.split(' ')[0]}
          {user.student.verified && (
            <span title="Verified Student" className="text-success-700">
              <Icon name="graduation" className="size-4" />
            </span>
          )}
        </Link>
        {isStaff(user) && (
          <Link
            href={ROUTES.admin}
            onClick={onNavigate}
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-900"
          >
            Admin
          </Link>
        )}
        {user.roles.includes('BUSINESS_OWNER') && (
          <Link
            href={ROUTES.dashboard}
            onClick={onNavigate}
            className="inline-flex h-9 items-center justify-center rounded-full bg-accent-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-650"
          >
            Dashboard
          </Link>
        )}
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        href={ROUTES.signIn}
        onClick={onNavigate}
        className="inline-flex h-9 items-center justify-center rounded-full border border-control px-4 text-sm font-semibold text-primary-800 transition-colors hover:bg-subtle"
      >
        Log in
      </Link>
      <Link
        href={ROUTES.register}
        onClick={onNavigate}
        className="inline-flex h-9 items-center justify-center rounded-full bg-accent-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-650"
      >
        Get started
      </Link>
    </div>
  );
}

/** Signed-in students also get their daily dashboard first. */
function useNavLinks() {
  const { status, user } = useSession();
  const student =
    status === 'authenticated' &&
    user !== null &&
    !user.roles.includes('BUSINESS_OWNER') &&
    !isStaff(user);
  return student
    ? [
        { href: ROUTES.studentHome, label: 'My day' },
        { href: ROUTES.orders, label: 'Orders' },
        ...NAV_LINKS,
      ]
    : NAV_LINKS;
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = useNavLinks();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href={ROUTES.home} className="flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset. */}
          <img src="/logo.png" alt={BRAND.name} width={135} height={36} className="h-9 w-auto" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className="text-sm font-medium text-body transition-colors hover:text-primary-800 aria-[current=page]:font-semibold aria-[current=page]:text-primary-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:block">
          <AccountActions />
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="inline-flex size-10 items-center justify-center rounded-md text-ink hover:bg-subtle lg:hidden"
        >
          <Icon name={open ? 'close' : 'menu'} label={open ? 'Close menu' : 'Open menu'} />
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-surface lg:hidden">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-3 text-base font-medium text-ink hover:bg-subtle"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-line px-2 pt-4 pb-2">
              <AccountActions onNavigate={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
