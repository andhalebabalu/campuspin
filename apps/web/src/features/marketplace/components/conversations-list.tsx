'use client';

import { ApiClientError } from '@platform/api-client';
import type { Conversation, PageMeta } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { timeAgo } from '@/lib/format/time';
import { messagesService } from '@/services/messages.service';
import { ListingImage, formatPrice } from './listing-card';

/** My marketplace conversations, most recent first. */
export function ConversationsList() {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    messagesService
      .conversations(page, controller.signal)
      .then((result) => {
        setItems((current) =>
          page === 1 || !current ? result.data : [...current, ...result.data],
        );
        setMeta(result.meta ?? null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load messages.');
      });
    return () => controller.abort();
  }, [page, reload]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Messages</h1>
        <p className="text-sm text-body">
          Your chats with buyers and sellers. Phone numbers are never shared.
        </p>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !items ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Message a seller from any listing, and buyers' messages about your items appear here."
          action={
            <Link
              href={ROUTES.marketplace}
              className="text-sm font-medium text-action hover:underline"
            >
              Browse the marketplace
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={ROUTES.conversation(conversation.id)}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-subtle ${
                  conversation.unread ? 'bg-primary-50/40' : ''
                }`}
              >
                <span className="size-14 shrink-0 overflow-hidden rounded-lg border border-line">
                  <ListingImage src={conversation.listing.coverImageUrl} alt="" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-sm ${conversation.unread ? 'font-bold text-ink' : 'font-medium text-ink'}`}
                    >
                      {conversation.other.displayName}
                      <span className="font-normal text-muted">
                        {' · '}
                        {conversation.role === 'SELLER' ? 'buyer' : 'seller'}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {timeAgo(conversation.lastMessageAt)}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {conversation.listing.title} · {formatPrice(conversation.listing.price)}
                  </span>
                  <span
                    className={`block truncate text-sm ${conversation.unread ? 'text-ink' : 'text-body'}`}
                  >
                    {conversation.lastMessage ?? ''}
                  </span>
                </span>
                {conversation.unread && (
                  <span className="size-2.5 shrink-0 rounded-full bg-action" aria-label="Unread" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {meta && items && meta.page < meta.totalPages && (
        <Button variant="secondary" className="self-center" onClick={() => setPage((p) => p + 1)}>
          Load more
        </Button>
      )}
    </div>
  );
}
