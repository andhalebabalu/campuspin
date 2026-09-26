'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/constants/routes';
import { notificationsService } from '@/services/notifications.service';

/** A bell with the unread count, refreshed on every page change. */
export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    notificationsService
      .unreadCount(controller.signal)
      .then((result) => setUnread(result.data.unread))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  return (
    <Link
      href={ROUTES.meNotifications}
      onClick={onNavigate}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex size-9 items-center justify-center rounded-full text-body hover:bg-subtle hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-4 text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
