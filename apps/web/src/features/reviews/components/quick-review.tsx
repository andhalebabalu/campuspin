'use client';

import { ApiClientError } from '@platform/api-client';
import type { ReviewSummary } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { reviewsService } from '@/services/reviews.service';
import { MyReview } from './place-reviews';

/**
 * The review form on its own, for a student who scanned the QR code at the place: no list to scroll
 * past, and signing in leads straight back here. Posting a review follows the same rules as on the
 * place page (student accounts only, one review per place).
 */
export function QuickReview({ placeId, placeSlug }: { placeId: string; placeSlug: string }) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [hasReview, setHasReview] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    reviewsService
      .summary(placeId, controller.signal)
      .then((result) => setSummary(result.data))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof ApiClientError
            ? { message: cause.message, requestId: cause.requestId }
            : { message: 'Could not load the review form.' },
        );
      });
    return () => controller.abort();
  }, [placeId, reloadCount]);

  const onMine = useCallback((id: string | null) => setHasReview(id !== null), []);
  const onChanged = useCallback(() => setChanged(true), []);

  if (error) {
    return (
      <ErrorState
        message={error.message}
        requestId={error.requestId}
        onRetry={() => {
          setError(null);
          setReloadCount((count) => count + 1);
        }}
      />
    );
  }
  if (!summary) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      {changed && hasReview && (
        <div
          role="status"
          className="rounded-md border border-success-600 bg-success-50 p-4 text-sm text-success-700"
        >
          Thanks! Your review helps the next student decide.
        </div>
      )}
      <MyReview
        placeId={placeId}
        placeSlug={placeSlug}
        summary={summary}
        onChanged={onChanged}
        onMine={onMine}
        returnTo={ROUTES.placeReview(placeSlug)}
      />
      <Link
        href={`${ROUTES.placeDetail(placeSlug)}#reviews`}
        className="w-fit text-sm font-medium text-action underline-offset-2 hover:underline"
      >
        See all reviews and details
      </Link>
    </div>
  );
}
