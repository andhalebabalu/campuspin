'use client';

import { ApiClientError } from '@platform/api-client';
import {
  COMMUNITY_BODY_MAX,
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_REPORT_REASONS,
  type CommunityCategory,
  type CommunityChannels,
  type CommunityPost,
} from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FeatureGate } from '@/components/shared/feature-gate';
import { ErrorState } from '@/components/shared/error-state';
import { ReportDialog } from '@/components/shared/report-dialog';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { eventTime } from '@/lib/format/time';
import { communityService } from '@/services/community.service';
import { safetyService } from '@/services/safety.service';
import { CATEGORY_ICONS } from './post-card';

/** How often an open section checks for new messages, and the section list for new activity. */
const MESSAGES_POLL_MS = 6_000;
const CHANNELS_POLL_MS = 20_000;
const PAGE = 40;

const SECTION_HINTS: Record<CommunityCategory, string> = {
  DISCUSSION: 'Talk about anything on campus',
  QUESTION: 'Ask your classmates',
  ANNOUNCEMENT: 'Important updates for everyone',
  EVENT: 'Fests, workshops, meetups',
  STUDY: 'Notes, doubts, study groups',
  JOB: 'Internships and part-time work',
  LOST_FOUND: 'Lost something? Found something?',
  STUDENT_UPDATE: 'Share what you are up to',
};

// ── Small helpers ────────────────────────────────────────────────────────────────────────────────

const isCategory = (value: string | null): value is CommunityCategory =>
  value !== null && (COMMUNITY_CATEGORIES as readonly string[]).includes(value);

/** Oldest first, one entry per id. */
function merge(current: CommunityPost[], incoming: CommunityPost[]): CommunityPost[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function listTime(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? clock(iso)
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** A stable colour per member, like WhatsApp group names. */
const NAME_COLOURS = [
  'text-primary-700',
  'text-accent-700',
  'text-success-700',
  'text-danger-700',
  'text-ink',
];
function nameColour(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return NAME_COLOURS[hash % NAME_COLOURS.length]!;
}

// "Last seen" per section, only to show unread dots on this device. Losing it is harmless.
const SEEN_KEY = 'campuspin.chat.seen';
function readSeen(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function writeSeen(category: CommunityCategory, messageId: string) {
  try {
    const seen = readSeen();
    if ((seen[category] ?? '') >= messageId) return;
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen, [category]: messageId }));
  } catch {
    // Private mode or storage blocked: unread dots simply do not persist.
  }
}

// ── The screen ───────────────────────────────────────────────────────────────────────────────────

/**
 * The college community as a group chat: one chat per section (Discussion, Questions, Events…),
 * like WhatsApp groups. Only verified students of the college are in it.
 */
export function CommunityChat() {
  const { status, user } = useSession();
  const verified = Boolean(user?.student.verified);

  if (status === 'loading') return <Skeleton className="h-[70dvh] w-full" />;
  if (!verified) {
    return (
      <div className="py-4">
        <FeatureGate
          eyebrow="Student community"
          title="Your college's group chats"
          description="Questions, notes, events, jobs, lost & found: one chat per topic, only for verified students of your college."
          points={[
            { icon: 'chats', title: 'Discussions', body: 'Ask your campus anything.' },
            { icon: 'book', title: 'Study & notes', body: 'Share notes and clear doubts.' },
            { icon: 'calendar', title: 'Events', body: 'Fests, clubs and meet-ups.' },
            {
              icon: 'target',
              title: 'Jobs & lost-found',
              body: 'Openings nearby, lost things found.',
            },
          ]}
          image="/images/amenities/libraries.jpg"
          primary={
            status === 'authenticated'
              ? { href: ROUTES.meVerification, label: 'Verify my college', icon: 'graduation' }
              : {
                  href: `${ROUTES.login}?next=${encodeURIComponent(ROUTES.community)}`,
                  label: 'Sign in',
                }
          }
          secondary={
            status === 'authenticated'
              ? undefined
              : { href: ROUTES.registerStudent, label: 'Create a free account' }
          }
        />
      </div>
    );
  }
  return <ChatLayout />;
}

function ChatLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('c');
  const active = isCategory(requested) ? requested : null;

  const [data, setData] = useState<CommunityChannels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let controller = new AbortController();
    const load = () =>
      communityService
        .channels(controller.signal)
        .then((result) => {
          setData(result.data);
          setSeen(readSeen());
          setError(null);
        })
        .catch((caught: unknown) => {
          if (!controller.signal.aborted)
            setError(caught instanceof ApiClientError ? caught.message : 'Could not load chats.');
        });
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      controller = new AbortController();
      void load();
    }, CHANNELS_POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [reload]);

  const open = (category: CommunityCategory | null) => {
    setSeen(readSeen());
    router.replace(category ? `${pathname}?c=${category}` : pathname, { scroll: false });
  };

  if (error) return <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <Skeleton className="h-[70dvh] w-full" />;

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[28rem] overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      {/* Section list: the whole screen on mobile until a chat is open. */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-line md:flex md:w-80 ${
          active ? 'hidden' : 'flex'
        }`}
      >
        <div className="border-b border-line bg-subtle px-4 py-3">
          <h1 className="font-bold text-ink">{data.college.name}</h1>
          <p className="text-xs text-muted">Group chats · verified students only</p>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {data.channels.map((channel) => {
            const last = channel.lastMessage;
            const unread =
              last !== null &&
              last.authorName !== 'You' &&
              (seen[channel.category] ?? '') < last.id;
            return (
              <li key={channel.category}>
                <button
                  type="button"
                  onClick={() => open(channel.category)}
                  aria-current={active === channel.category ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-subtle ${
                    active === channel.category ? 'bg-primary-50' : ''
                  }`}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <Icon name={CATEGORY_ICONS[channel.category]} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-ink">
                        {COMMUNITY_CATEGORY_LABELS[channel.category]}
                      </span>
                      {last && (
                        <span
                          className={`shrink-0 text-xs ${unread ? 'font-semibold text-success-700' : 'text-muted'}`}
                        >
                          {listTime(last.createdAt)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${unread ? 'text-ink' : 'text-muted'}`}>
                        {last
                          ? `${last.authorName}: ${last.text}`
                          : SECTION_HINTS[channel.category]}
                      </span>
                      {unread && (
                        <span
                          className="size-2.5 shrink-0 rounded-full bg-success-600"
                          aria-label="New messages"
                        />
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* The open chat. */}
      <section className={`min-w-0 flex-1 flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
        {active ? (
          <ChatPane
            key={active}
            category={active}
            collegeName={data.college.name}
            onBack={() => open(null)}
            onActivity={() => setReload((n) => n + 1)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-subtle p-8 text-center">
            <Icon name="chats" className="size-10 text-muted" />
            <p className="font-medium text-ink">Pick a chat</p>
            <p className="max-w-xs text-sm text-muted">
              Each topic has its own chat, just for students of {data.college.name}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ── One chat ─────────────────────────────────────────────────────────────────────────────────────

function ChatPane({
  category,
  collegeName,
  onBack,
  onActivity,
}: {
  category: CommunityCategory;
  collegeName: string;
  onBack: () => void;
  onActivity: () => void;
}) {
  const [messages, setMessages] = useState<CommunityPost[] | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<CommunityPost | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reporting, setReporting] = useState<CommunityPost | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const jumpedToHash = useRef(false);

  const fetchLatest = useCallback(
    (signal?: AbortSignal) =>
      communityService.feed({ scope: 'college', category, limit: PAGE }, signal),
    [category],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchLatest(controller.signal)
      .then((result) => {
        setMessages(merge([], result.data.items));
        setOlderCursor(result.data.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load messages.');
      });

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchLatest()
        .then((result) => setMessages((current) => merge(current ?? [], result.data.items)))
        .catch(() => undefined);
    }, MESSAGES_POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fetchLatest, reload]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  const lastId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !lastId) return;
    writeSeen(category, lastId);

    // Arriving from a notification (`#m-<id>`): jump to that message once.
    const hash = window.location.hash.slice(1);
    if (!jumpedToHash.current && hash.startsWith('m-')) {
      jumpedToHash.current = true;
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.classList.add('ring-2', 'ring-accent-400');
        window.setTimeout(() => target.classList.remove('ring-2', 'ring-accent-400'), 2500);
        return;
      }
    }
    if (stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [lastId, category]);

  function onScroll() {
    const box = scrollRef.current;
    if (!box) return;
    stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }

  async function loadOlder() {
    if (!olderCursor || loadingOlder) return;
    const box = scrollRef.current;
    const before = box ? box.scrollHeight - box.scrollTop : 0;
    setLoadingOlder(true);
    try {
      const result = await communityService.feed({
        scope: 'college',
        category,
        limit: PAGE,
        cursor: olderCursor,
      });
      stickToBottom.current = false;
      setMessages((current) => merge(current ?? [], result.data.items));
      setOlderCursor(result.data.nextCursor);
      // Keep the reader's place after older messages are added above.
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - before;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  function replace(next: CommunityPost) {
    setMessages((current) => (current ?? []).map((m) => (m.id === next.id ? next : m)));
  }

  async function toggleLike(message: CommunityPost) {
    try {
      const result =
        message.myReaction === null
          ? await communityService.react(message.id, 'LIKE')
          : await communityService.unreact(message.id);
      replace({ ...message, ...result.data });
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not react.');
    }
  }

  async function remove(message: CommunityPost) {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await communityService.remove(message.id);
      setMessages((current) => (current ?? []).filter((m) => m.id !== message.id));
      onActivity();
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not delete.');
    }
  }

  async function block(message: CommunityPost) {
    if (
      !window.confirm(
        `Block ${message.author.displayName}? You will no longer see each other's messages.`,
      )
    )
      return;
    try {
      await safetyService.block(message.author.id);
      setMessages((current) => (current ?? []).filter((m) => m.author.id !== message.author.id));
      onActivity();
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not block.');
    }
  }

  function jumpTo(messageId: string) {
    const target = document.getElementById(`m-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ring-2', 'ring-accent-400');
    window.setTimeout(() => target.classList.remove('ring-2', 'ring-accent-400'), 1500);
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line bg-subtle px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="inline-flex size-9 items-center justify-center rounded-full text-body hover:bg-surface md:hidden"
        >
          <Icon name="arrowLeft" className="size-5" />
        </button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Icon name={CATEGORY_ICONS[category]} className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-ink">{COMMUNITY_CATEGORY_LABELS[category]}</h2>
          <p className="truncate text-xs text-muted">
            {collegeName} · {SECTION_HINTS[category]}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClick={() => setSelected(null)}
        className="flex-1 overflow-y-auto bg-subtle px-3 py-3 sm:px-6"
      >
        {error ? (
          <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
        ) : !messages ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="h-16 w-3/5" />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {olderCursor && (
              <button
                type="button"
                onClick={() => void loadOlder()}
                className="mx-auto mb-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-action shadow-xs hover:underline"
              >
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            )}
            <p className="mx-auto mb-2 max-w-sm rounded-lg bg-accent-50 px-3 py-1.5 text-center text-xs text-ink">
              Only verified students of {collegeName} can read this chat. Be kind; report anything
              that breaks the rules.
            </p>
            {messages.length === 0 && (
              <p className="mx-auto mt-6 text-sm text-muted">No messages yet. Say hello 👋</p>
            )}
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const newDay =
                !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
              const grouped =
                !newDay &&
                previous?.author.id === message.author.id &&
                new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                  5 * 60_000;
              return (
                <div key={message.id} className="flex flex-col">
                  {newDay && (
                    <span className="mx-auto my-2 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-muted shadow-xs">
                      {dayLabel(message.createdAt)}
                    </span>
                  )}
                  <Bubble
                    message={message}
                    showName={!grouped}
                    selected={selected === message.id}
                    onSelect={() =>
                      setSelected((current) => (current === message.id ? null : message.id))
                    }
                    onReply={() => {
                      setReplyTo(message);
                      setSelected(null);
                    }}
                    onLike={() => void toggleLike(message)}
                    onDelete={() => void remove(message)}
                    onReport={() => setReporting(message)}
                    onBlock={() => void block(message)}
                    onJump={jumpTo}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {notice && (
        <p className="flex items-center justify-between gap-2 bg-danger-50 px-4 py-2 text-sm text-danger-700">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <Icon name="close" className="size-4" />
          </button>
        </p>
      )}

      <Composer
        category={category}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSent={(message) => {
          stickToBottom.current = true;
          setMessages((current) => merge(current ?? [], [message]));
          setReplyTo(null);
          onActivity();
        }}
      />

      <ReportDialog
        open={reporting !== null}
        title="Report this message"
        reasons={COMMUNITY_REPORT_REASONS}
        onClose={() => setReporting(null)}
        onSubmit={(dto) => communityService.reportPost(reporting!.id, dto)}
      />
    </>
  );
}

// ── A message ────────────────────────────────────────────────────────────────────────────────────

function Bubble({
  message,
  showName,
  selected,
  onSelect,
  onReply,
  onLike,
  onDelete,
  onReport,
  onBlock,
  onJump,
}: {
  message: CommunityPost;
  showName: boolean;
  selected: boolean;
  onSelect: () => void;
  onReply: () => void;
  onLike: () => void;
  onDelete: () => void;
  onReport: () => void;
  onBlock: () => void;
  onJump: (id: string) => void;
}) {
  const mine = message.mine;
  const action =
    'rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-xs hover:bg-subtle';
  return (
    <div
      className={`group flex flex-col ${mine ? 'items-end' : 'items-start'} ${showName ? 'mt-2' : ''}`}
    >
      <div
        id={`m-${message.id}`}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSelect();
        }}
        className={`relative max-w-[85%] cursor-pointer rounded-2xl px-3 py-2 text-sm shadow-xs transition-shadow sm:max-w-[70%] ${
          mine ? 'rounded-br-sm bg-success-50 text-ink' : 'rounded-bl-sm bg-surface text-ink'
        }`}
      >
        {showName && !mine && (
          <p
            className={`mb-0.5 flex items-center gap-1 text-xs font-semibold ${nameColour(message.author.id)}`}
          >
            <Link
              href={ROUTES.member(message.author.id)}
              onClick={(event) => event.stopPropagation()}
              className="hover:underline"
            >
              {message.author.displayName}
            </Link>
            {message.author.verifiedStudent && (
              <Icon
                name="graduation"
                className="size-3.5 text-success-700"
                label="Verified Student"
              />
            )}
          </p>
        )}
        {message.replyTo && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onJump(message.replyTo!.id);
            }}
            className="mb-1 block w-full rounded-md border-l-4 border-primary-500 bg-ink/5 px-2 py-1 text-left"
          >
            <span className="block text-xs font-semibold text-primary-700">
              {message.replyTo.authorName}
            </span>
            <span className="line-clamp-2 block text-xs text-body">{message.replyTo.excerpt}</span>
          </button>
        )}
        {message.title && <p className="font-semibold">{message.title}</p>}
        <p className="whitespace-pre-line break-words">{message.body}</p>
        {message.event && (
          <p className="mt-1.5 flex flex-wrap gap-x-3 rounded-md bg-accent-50 px-2 py-1 text-xs text-ink">
            <span className="inline-flex items-center gap-1">
              <Icon name="calendar" className="size-3.5" /> {eventTime(message.event.startsAt)}
            </span>
            {message.event.location && (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" className="size-3.5" /> {message.event.location}
              </span>
            )}
          </p>
        )}
        <p className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-muted">
          {message.reactionCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Icon
                name="heart"
                className={`size-3 ${message.myReaction ? 'fill-danger-600 text-danger-600' : ''}`}
              />
              {message.reactionCount}
            </span>
          )}
          {message.editedAt && <span>edited</span>}
          <span>{clock(message.createdAt)}</span>
        </p>
      </div>
      {/* Actions: on tap (mobile) or hover (desktop). */}
      <div
        className={`mt-1 flex flex-wrap gap-1.5 ${selected ? 'flex' : 'hidden md:group-hover:flex'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={action} onClick={onReply}>
          Reply
        </button>
        <button type="button" className={action} onClick={onLike}>
          {message.myReaction ? 'Unlike' : '❤ Like'}
        </button>
        {mine ? (
          <button type="button" className={`${action} text-danger-700`} onClick={onDelete}>
            Delete
          </button>
        ) : (
          <>
            <button type="button" className={action} onClick={onReport}>
              Report
            </button>
            <button type="button" className={action} onClick={onBlock}>
              Block
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Writing ──────────────────────────────────────────────────────────────────────────────────────

function Composer({
  category,
  replyTo,
  onCancelReply,
  onSent,
}: {
  category: CommunityCategory;
  replyTo: CommunityPost | null;
  onCancelReply: () => void;
  onSent: (message: CommunityPost) => void;
}) {
  const [body, setBody] = useState('');
  const [withEvent, setWithEvent] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await communityService.create({
        category,
        visibility: 'COLLEGE_ONLY',
        body: text,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        ...(category === 'EVENT' && withEvent && startsAt
          ? { eventStartsAt: new Date(startsAt).toISOString() }
          : {}),
        ...(category === 'EVENT' && withEvent && place.trim()
          ? { eventLocation: place.trim() }
          : {}),
      });
      onSent(result.data);
      setBody('');
      setWithEvent(false);
      setStartsAt('');
      setPlace('');
      if (inputRef.current) inputRef.current.style.height = '';
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="border-t border-line bg-surface px-3 py-2">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-md border-l-4 border-primary-500 bg-subtle px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary-700">
              Replying to {replyTo.mine ? 'yourself' : replyTo.author.displayName}
            </p>
            <p className="truncate text-xs text-body">{replyTo.body}</p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">
            <Icon name="close" className="size-4 text-muted" />
          </button>
        </div>
      )}
      {category === 'EVENT' && withEvent && (
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink">
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="h-9 rounded-md border border-control bg-surface px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink">
            Where (optional)
            <input
              value={place}
              maxLength={200}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="e.g. Seminar hall"
              className="h-9 rounded-md border border-control bg-surface px-2 text-sm"
            />
          </label>
        </div>
      )}
      {problem && <p className="mb-1 text-xs text-danger-700">{problem}</p>}
      <div className="flex items-end gap-2">
        {category === 'EVENT' && (
          <button
            type="button"
            onClick={() => setWithEvent((value) => !value)}
            aria-pressed={withEvent}
            aria-label="Add event date and place"
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${
              withEvent ? 'bg-accent-50 text-accent-700' : 'text-muted hover:bg-subtle'
            }`}
          >
            <Icon name="calendar" className="size-5" />
          </button>
        )}
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-message"
          ref={inputRef}
          rows={1}
          maxLength={COMMUNITY_BODY_MAX}
          placeholder="Type a message"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            event.target.style.height = 'auto';
            event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          className="max-h-36 min-h-10 min-w-0 flex-1 resize-none rounded-2xl border border-control bg-subtle px-4 py-2 text-base text-ink"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          aria-label="Send"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-success-600 text-white hover:bg-success-700 disabled:opacity-50"
        >
          <Icon name="arrowRight" className="size-5" />
        </button>
      </div>
    </form>
  );
}
