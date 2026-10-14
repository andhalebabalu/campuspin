'use client';

import { ApiClientError } from '@platform/api-client';
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCategory,
  type CommunityPost,
  type CommunityScope,
} from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { communityService, type FeedParams } from '@/services/community.service';
import { PostCard } from './post-card';

const LINK_BUTTON =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover';

/**
 * The community feed. Verified students land on their own college (with a switch to public posts of
 * every campus); everyone else reads public posts and is invited to verify. With `authorId` it lists
 * one member's posts instead (their profile).
 */
export function CommunityFeed({ authorId }: { authorId?: string }) {
  const { status, user } = useSession();
  const verified = Boolean(user?.student.verified);
  const standalone = !authorId;
  const [scope, setScope] = useState<CommunityScope>('college');
  const [category, setCategory] = useState<CommunityCategory | ''>('');
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // A profile lists what the viewer may see across both scopes; the server picks the default.
  const effectiveScope: CommunityScope | undefined = authorId
    ? undefined
    : verified
      ? scope
      : 'public';

  useEffect(() => {
    if (status === 'loading') return;
    const controller = new AbortController();
    const params: FeedParams = {
      ...(effectiveScope ? { scope: effectiveScope } : {}),
      ...(authorId ? { authorId } : {}),
      ...(category ? { category } : {}),
    };
    communityService
      .feed(params, controller.signal)
      .then((result) => {
        setPosts(result.data.items);
        setCursor(result.data.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load posts.');
      });
    return () => controller.abort();
  }, [status, effectiveScope, category, authorId, reload]);

  /** Changing a filter shows the skeleton until the new list arrives. */
  function refilter(apply: () => void) {
    setPosts(null);
    setError(null);
    apply();
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const result = await communityService.feed({
        ...(effectiveScope ? { scope: effectiveScope } : {}),
        ...(authorId ? { authorId } : {}),
        ...(category ? { category } : {}),
        cursor,
      });
      setPosts((current) => [...(current ?? []), ...result.data.items]);
      setCursor(result.data.nextCursor);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not load more posts.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {standalone && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-primary-800 sm:text-3xl">
              {verified && user?.student.college
                ? `${user.student.college.name} community`
                : 'Student community'}
            </h1>
            <p className="text-sm text-body">
              Questions, notes, events, jobs and lost &amp; found, from verified students.
            </p>
          </div>
          {verified && (
            <Link href={ROUTES.communityNew} className={LINK_BUTTON}>
              <Icon name="sparkles" className="size-4" /> New post
            </Link>
          )}
        </div>
      )}

      {standalone && status !== 'loading' && !verified && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-ink">
            <Icon name="graduation" className="mt-0.5 size-5 shrink-0 text-primary-600" />
            <span>
              You are reading public posts from every campus. Verify your college to join your own
              community and post.
            </span>
          </p>
          <Link
            href={
              status === 'authenticated'
                ? ROUTES.meVerification
                : `${ROUTES.login}?next=${encodeURIComponent(ROUTES.community)}`
            }
            className={`${LINK_BUTTON} shrink-0`}
          >
            {status === 'authenticated' ? 'Verify my college' : 'Sign in'}
          </Link>
        </div>
      )}

      {standalone && verified && (
        <div
          role="tablist"
          aria-label="Feed"
          className="flex gap-1 rounded-lg bg-subtle p-1 sm:w-fit"
        >
          {(
            [
              ['college', 'My college'],
              ['public', 'All campuses'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={scope === value}
              onClick={() => refilter(() => setScope(value))}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium sm:flex-none ${
                scope === value ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2 pb-1">
          {(['', ...COMMUNITY_CATEGORIES] as const).map((value) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={category === value}
              onClick={() => refilter(() => setCategory(value))}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                category === value
                  ? 'border-action bg-action text-white'
                  : 'border-line bg-surface text-body hover:border-action'
              }`}
            >
              {value ? COMMUNITY_CATEGORY_LABELS[value] : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => refilter(() => setReload((n) => n + 1))} />
      ) : !posts ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          title="No posts yet"
          description={
            verified && standalone
              ? 'Start the conversation: ask a question or share an update.'
              : 'Nothing to show here yet.'
          }
          action={
            verified && standalone ? (
              <Link href={ROUTES.communityNew} className={LINK_BUTTON}>
                Write the first post
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
      {cursor && posts && (
        <Button
          variant="secondary"
          className="self-center"
          loading={loadingMore}
          onClick={() => void loadMore()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
