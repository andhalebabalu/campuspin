'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { messagesService } from '@/services/messages.service';

/** Marketplace messages with the number of unread conversations, refreshed on page change. */
export function MessagesLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    messagesService
      .unreadCount(controller.signal)
      .then((result) => setUnread(result.data.unread))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);

  return (
    <Link
      href={ROUTES.messages}
      onClick={onNavigate}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      className="relative inline-flex size-9 items-center justify-center rounded-full text-body hover:bg-subtle hover:text-ink"
    >
      <Icon name="chat" className="size-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-4 text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
