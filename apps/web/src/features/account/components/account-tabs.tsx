'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';

const TABS = [
  { href: ROUTES.me, label: 'Profile' },
  { href: ROUTES.meVerification, label: 'Verification' },
  { href: ROUTES.meSettings, label: 'Privacy & notifications' },
  { href: ROUTES.meNotifications, label: 'Notifications' },
];

/** The /me section tabs. */
export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Your account" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-block border-b-2 px-4 py-3 text-sm font-medium ${
                  active
                    ? 'border-action text-action'
                    : 'border-transparent text-body hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
