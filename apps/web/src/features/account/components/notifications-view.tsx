'use client';

import { ApiClientError } from '@platform/api-client';
import type { Notification, PageMeta } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { notificationsService } from '@/services/notifications.service';

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

/** The member's notifications, newest first, with "mark all read". */
export function NotificationsView() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    notificationsService
      .list({ page }, controller.signal)
      .then((result) => {
        setItems((current) =>
          page === 1 || !current ? result.data : [...current, ...result.data],
        );
        setMeta(result.meta ?? null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof ApiClientError ? caught.message : 'Could not load notifications.',
          );
      });
    return () => controller.abort();
  }, [page, reload]);

  async function open(item: Notification) {
    if (!item.read) {
      setItems(
        (current) => current?.map((n) => (n.id === item.id ? { ...n, read: true } : n)) ?? null,
      );
      await notificationsService.markRead(item.id).catch(() => undefined);
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />;
  if (!items) return <Skeleton className="h-64 w-full" />;
  if (items.length === 0) {
    return <EmptyState title="No notifications" description="You're all caught up." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await notificationsService.markAllRead().catch(() => undefined);
            setItems((current) => current?.map((n) => ({ ...n, read: true })) ?? null);
          }}
        >
          Mark all read
        </Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
        {items.map((item) => {
          const body = (
            <div className="flex gap-3 px-4 py-3.5">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-action'}`}
                aria-label={item.read ? undefined : 'Unread'}
              />
              <div className="min-w-0">
                <p className={`text-sm ${item.read ? 'text-body' : 'font-semibold text-ink'}`}>
                  {item.title}
                </p>
                <p className="text-sm text-muted">{item.message}</p>
                <p className="mt-1 text-xs text-muted">{timeAgo(item.createdAt)}</p>
              </div>
            </div>
          );
          return (
            <li key={item.id} className={item.read ? '' : 'bg-primary-50/40'}>
              {item.link ? (
                <Link
                  href={item.link}
                  onClick={() => void open(item)}
                  className="block hover:bg-subtle"
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void open(item)}
                  className="block w-full text-left hover:bg-subtle"
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {meta && meta.page < meta.totalPages && (
        <Button variant="secondary" className="self-center" onClick={() => setPage((p) => p + 1)}>
          Load more
        </Button>
      )}
    </div>
  );
}
