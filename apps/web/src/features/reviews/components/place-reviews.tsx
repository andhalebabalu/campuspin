'use client';

import { ApiClientError } from '@platform/api-client';
import type { PublicReview, REVIEW_SORTS, Review, ReviewSummary } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormAlert } from '@/components/ui/form-alert';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { reviewsService } from '@/services/reviews.service';
import { ReviewForm } from './review-form';
import { Stars } from './stars';

type Sort = (typeof REVIEW_SORTS)[number];

const SORT_LABELS: Record<Sort, string> = {
  recent: 'Most recent',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
};

const PAGE_SIZE = 10;

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/**
 * Everything about a place's reviews, fetched in the browser (never from the 5-minute cached place
 * page), so a review someone just posted, edited or withdrew shows up at once: the rating summary,
 * the list, and — for a signed-in student — their own review with edit and withdraw.
 */
export function PlaceReviews({ placeId, placeSlug }: { placeId: string; placeSlug: string }) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>('recent');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  // The signed-in student's own review is shown on its own (with edit / withdraw), not twice.
  const [myReviewId, setMyReviewId] = useState<string | null>(null);
  const others = reviews.filter((review) => review.id !== myReviewId);

  const refresh = useCallback(() => setReloadCount((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      reviewsService.summary(placeId, controller.signal),
      reviewsService.listForPlace(placeId, { sort, page: 1, limit: PAGE_SIZE }, controller.signal),
    ])
      .then(([summaryResult, listResult]) => {
        setSummary(summaryResult.data);
        setReviews(listResult.data);
        setTotal(listResult.meta?.total ?? listResult.data.length);
        setPage(1);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof ApiClientError
            ? { message: cause.message, requestId: cause.requestId }
            : { message: 'Could not load reviews.' },
        );
        setStatus('error');
      });
    return () => controller.abort();
  }, [placeId, sort, reloadCount]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await reviewsService.listForPlace(placeId, {
        sort,
        page: next,
        limit: PAGE_SIZE,
      });
      setReviews((current) => [...current, ...result.data]);
      setPage(next);
    } catch {
      // The button stays; trying again is the recovery.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="flex flex-col gap-5">
      <h2 id="reviews-heading" className="text-xl font-semibold text-ink">
        Reviews
      </h2>

      {status === 'loading' ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : status === 'error' || !summary ? (
        <ErrorState
          message={error?.message ?? 'Could not load reviews.'}
          requestId={error?.requestId}
          onRetry={() => {
            setStatus('loading');
            refresh();
          }}
        />
      ) : (
        <>
          <RatingSummary summary={summary} />
          <MyReview
            placeId={placeId}
            placeSlug={placeSlug}
            summary={summary}
            onChanged={refresh}
            onMine={setMyReviewId}
          />

          {others.length === 0 ? (
            <EmptyState
              title={myReviewId ? 'No other reviews yet' : 'No reviews yet'}
              description={
                myReviewId
                  ? 'Yours is the first. Thanks for helping the next student decide.'
                  : 'Been here? Your review helps the next student decide.'
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 self-end text-sm text-body">
                Sort
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as Sort)}
                  className="h-9 rounded-md border border-control bg-surface px-2.5 text-sm text-ink"
                >
                  {(Object.keys(SORT_LABELS) as Sort[]).map((value) => (
                    <option key={value} value={value}>
                      {SORT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <ul className="flex flex-col gap-3">
                {others.map((review) => (
                  <li key={review.id}>
                    <ReviewCard review={review} />
                  </li>
                ))}
              </ul>
              {reviews.length < total && (
                <Button
                  variant="secondary"
                  className="self-center"
                  loading={loadingMore}
                  onClick={loadMore}
                >
                  Show more reviews
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RatingSummary({ summary }: { summary: ReviewSummary }) {
  if (summary.ratingCount === 0) return null;
  const rated = summary.dimensions.filter((dimension) => dimension.average !== null);
  return (
    <Card className="flex flex-col gap-6 p-6 sm:flex-row">
      <div className="flex flex-col items-start gap-1 sm:w-40">
        <p className="text-4xl font-bold text-ink">{summary.ratingAverage.toFixed(1)}</p>
        <Stars value={summary.ratingAverage} size="md" />
        <p className="text-sm text-muted">
          {summary.ratingCount} {summary.ratingCount === 1 ? 'review' : 'reviews'}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {summary.histogram.map((row) => {
          const share = summary.ratingCount > 0 ? (row.count / summary.ratingCount) * 100 : 0;
          return (
            <div key={row.rating} className="flex items-center gap-3 text-sm text-body">
              <span className="w-8 shrink-0">{row.rating}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                <div className="h-full rounded-full bg-amber-600" style={{ width: `${share}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-muted">
                <span className="sr-only">{row.rating} stars: </span>
                {row.count}
              </span>
            </div>
          );
        })}
      </div>
      {rated.length > 0 && (
        <dl className="flex flex-col gap-2 text-sm sm:w-44">
          {rated.map((dimension) => (
            <div key={dimension.id} className="flex items-center justify-between gap-3">
              <dt className="text-body">{dimension.label}</dt>
              <dd className="font-medium text-ink">{dimension.average?.toFixed(1)}★</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function ReviewCard({ review, footer }: { review: PublicReview; footer?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Stars value={review.rating} />
          <span className="font-medium text-ink">{review.authorName}</span>
        </div>
        <time dateTime={review.createdAt} className="text-sm text-muted">
          {formatDate(review.createdAt)}
        </time>
      </div>
      {review.comment && <p className="whitespace-pre-line text-body">{review.comment}</p>}
      {review.dimensionRatings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {review.dimensionRatings.map((entry) => (
            <Badge key={entry.dimensionId}>
              {entry.label} {entry.rating}★
            </Badge>
          ))}
        </div>
      )}
      {footer}
    </Card>
  );
}

const STATUS_NOTES: Partial<Record<Review['status'], string>> = {
  HIDDEN: 'A moderator has hidden this review, so it is not shown or counted right now.',
  REMOVED: 'A moderator has removed this review. It is not shown or counted.',
};

/**
 * The signed-in student's own review: a prompt to write one, the form, or their review with edit and
 * withdraw. Anyone else gets a sign-in link or a short note on who can review.
 */
export function MyReview({
  placeId,
  placeSlug,
  summary,
  onChanged,
  onMine,
  returnTo,
}: {
  placeId: string;
  placeSlug: string;
  summary: ReviewSummary;
  onChanged: () => void;
  /** Tells the list which review is the caller's own, so it is not listed twice. */
  onMine: (id: string | null) => void;
  /** Where signing in leads back to. Defaults to the reviews on the place page. */
  returnTo?: string;
}) {
  const { status: sessionStatus, user } = useSession();
  const isStudent = user?.roles.includes('STUDENT') ?? false;
  // undefined = not loaded yet, null = has not reviewed this place.
  const [mine, setMine] = useState<Review | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; requestId?: string } | null>(
    null,
  );

  useEffect(() => {
    onMine(mine?.id ?? null);
  }, [mine, onMine]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !isStudent) return;
    const controller = new AbortController();
    reviewsService
      .mineForPlace(placeId, controller.signal)
      .then((result) => setMine(result.data[0] ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [placeId, sessionStatus, isStudent]);

  if (sessionStatus === 'loading') return null;

  if (sessionStatus === 'unauthenticated') {
    return (
      <p className="text-sm text-body">
        <Link
          href={`${ROUTES.login}?next=${encodeURIComponent(returnTo ?? `${ROUTES.placeDetail(placeSlug)}#reviews`)}`}
          className="font-medium text-action underline-offset-2 hover:underline"
        >
          Sign in
        </Link>{' '}
        to write a review.
      </p>
    );
  }

  if (!isStudent) {
    return <p className="text-sm text-muted">Only student accounts can write reviews.</p>;
  }

  if (loadError) {
    return (
      <p className="text-sm text-muted">Could not check whether you have reviewed this place.</p>
    );
  }
  if (mine === undefined) return <Skeleton className="h-11 w-48" />;

  if (mine === null || editing) {
    return (
      <Card className="flex flex-col gap-4 p-6">
        <h3 className="text-lg font-semibold text-ink">
          {mine ? 'Edit your review' : 'Write a review'}
        </h3>
        <ReviewForm
          placeId={placeId}
          dimensions={summary.dimensions}
          existing={mine ?? undefined}
          onSaved={(review) => {
            setMine(review);
            setEditing(false);
            onChanged();
          }}
          onCancel={mine ? () => setEditing(false) : undefined}
        />
      </Card>
    );
  }

  const note = STATUS_NOTES[mine.status];
  const canChange = mine.status === 'PUBLISHED' || mine.status === 'REPORTED';

  async function withdraw(review: Review) {
    if (!window.confirm('Withdraw your review? It will be deleted.')) return;
    setActionError(null);
    setWithdrawing(true);
    try {
      await reviewsService.withdraw(review.id);
      setMine(null);
      onChanged();
    } catch (error) {
      setActionError(
        error instanceof ApiClientError
          ? { message: error.message, requestId: error.requestId }
          : { message: 'Something went wrong. Please try again.' },
      );
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted">Your review</h3>
      <ReviewCard
        review={mine}
        footer={
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            {note && (
              <p className="text-sm text-body">
                {note}
                {mine.moderationNote && <> Reason: {mine.moderationNote}</>}
              </p>
            )}
            {actionError && (
              <FormAlert message={actionError.message} requestId={actionError.requestId} />
            )}
            {canChange && (
              <div className="flex gap-3">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={withdrawing}
                  onClick={() => withdraw(mine)}
                >
                  Withdraw
                </Button>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
