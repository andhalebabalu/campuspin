'use client';

import { ApiClientError } from '@platform/api-client';
import {
  MARKETPLACE_REPORT_REASONS,
  MESSAGE_MAX,
  type Conversation,
  type Message,
} from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ReportDialog } from '@/components/shared/report-dialog';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { messagesService } from '@/services/messages.service';
import { safetyService } from '@/services/safety.service';
import { ListingImage, StatusPill, formatPrice } from './listing-card';

/** How often an open thread checks for new messages. */
const POLL_MS = 10_000;

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Merge two lists of messages by id, oldest first. */
function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** One buyer–seller conversation. New messages arrive by polling while it is open. */
export function ConversationThread({ conversationId }: { conversationId: string }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reload, setReload] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      messagesService.conversation(conversationId, controller.signal),
      messagesService.messages(conversationId, undefined, controller.signal),
    ])
      .then(([conversationResult, messageResult]) => {
        setConversation(conversationResult.data);
        setMessages(merge([], messageResult.data.items));
        setOlderCursor(messageResult.data.nextCursor);
        setError(null);
        void messagesService.markRead(conversationId).catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          missing: caught instanceof ApiClientError && caught.status === 404,
          message: caught instanceof ApiClientError ? caught.message : 'Could not load messages.',
        });
      });

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      messagesService
        .messages(conversationId)
        .then((result) => {
          setMessages((current) => {
            const next = merge(current, result.data.items);
            if (next.length !== current.length)
              void messagesService.markRead(conversationId).catch(() => undefined);
            return next;
          });
        })
        .catch(() => undefined);
    }, POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [conversationId, reload]);

  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  if (error?.missing) {
    return <EmptyState title="Conversation not found" description="It may not be yours." />;
  }
  if (error) return <ErrorState message={error.message} onRetry={() => setReload((n) => n + 1)} />;
  if (!conversation) return <Skeleton className="h-[32rem] w-full" />;

  async function loadOlder() {
    if (!olderCursor) return;
    const result = await messagesService.messages(conversationId, olderCursor);
    setMessages((current) => merge(current, result.data.items));
    setOlderCursor(result.data.nextCursor);
  }

  async function block() {
    if (!conversation) return;
    if (
      !window.confirm(
        `Block ${conversation.other.displayName}? Neither of you can message the other.`,
      )
    )
      return;
    await safetyService.block(conversation.other.id);
    setConversation({ ...conversation, blocked: true });
  }

  const closed =
    conversation.blocked ||
    conversation.listing.status === 'REMOVED' ||
    conversation.listing.status === 'HIDDEN' ||
    conversation.listing.status === 'EXPIRED';

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={ROUTES.messages}
        className="inline-flex items-center gap-1 text-sm font-medium text-action hover:underline"
      >
        <Icon name="arrowLeft" className="size-4" /> Messages
      </Link>

      <header className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <Link
          href={ROUTES.marketplaceListing(conversation.listing.id)}
          className="size-14 shrink-0 overflow-hidden rounded-lg border border-line"
        >
          <ListingImage src={conversation.listing.coverImageUrl} alt="" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">
            <Link href={ROUTES.member(conversation.other.id)} className="hover:underline">
              {conversation.other.displayName}
            </Link>
            {conversation.other.verifiedStudent && (
              <Icon
                name="graduation"
                className="ml-1 inline size-4 text-success-700"
                label="Verified Student"
              />
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {conversation.role === 'SELLER' ? 'Buying' : 'Selling'} · {conversation.listing.title} ·{' '}
            {formatPrice(conversation.listing.price)}
          </p>
        </div>
        <StatusPill status={conversation.listing.status} />
      </header>

      <div className="flex min-h-[20rem] flex-col gap-2 rounded-xl border border-line bg-subtle p-3 sm:p-4">
        {olderCursor && (
          <Button
            size="sm"
            variant="ghost"
            className="self-center"
            onClick={() => void loadOlder()}
          >
            Earlier messages
          </Button>
        )}
        <p className="mx-auto max-w-sm rounded-lg bg-surface px-3 py-2 text-center text-xs text-muted">
          Meet in a public place on campus and check the item before you pay. CampusPin never shares
          your phone number.
        </p>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex max-w-[85%] flex-col gap-0.5 ${message.mine ? 'self-end items-end' : 'self-start items-start'}`}
          >
            <p
              className={`whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm ${
                message.mine
                  ? 'rounded-br-sm bg-action text-white'
                  : 'rounded-bl-sm bg-surface text-ink shadow-xs'
              }`}
            >
              {message.body}
            </p>
            <span className="px-1 text-[11px] text-muted">{time(message.createdAt)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {closed ? (
        <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-body">
          {conversation.blocked
            ? 'Messaging is off because one of you blocked the other.'
            : 'This listing is no longer available, so the conversation is closed.'}
        </p>
      ) : (
        <SendBox
          conversationId={conversationId}
          onSent={(message) => setMessages((current) => merge(current, [message]))}
        />
      )}

      <div className="flex gap-4 text-xs">
        <button
          type="button"
          className="text-muted hover:text-ink"
          onClick={() => setReporting(true)}
        >
          Report {conversation.other.displayName}
        </button>
        {!conversation.blocked && (
          <button type="button" className="text-muted hover:text-ink" onClick={() => void block()}>
            Block
          </button>
        )}
      </div>

      <ReportDialog
        open={reporting}
        title={`Report ${conversation.other.displayName}`}
        reasons={MARKETPLACE_REPORT_REASONS}
        onClose={() => setReporting(false)}
        onSubmit={(dto) => messagesService.report(conversationId, dto)}
      />
    </div>
  );
}

function SendBox({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: (message: Message) => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      onSent((await messagesService.send(conversationId, body.trim())).data);
      setBody('');
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label htmlFor="message-body" className="sr-only">
          Message
        </label>
        <textarea
          id="message-body"
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder="Write a message…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-control bg-surface px-3 py-2 text-base text-ink"
        />
        <Button type="submit" loading={busy}>
          Send
        </Button>
      </div>
      {problem && <p className="text-sm text-danger-700">{problem}</p>}
    </form>
  );
}
