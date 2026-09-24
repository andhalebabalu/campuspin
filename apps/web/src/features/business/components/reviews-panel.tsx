'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessReview, PageMeta } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { Stars } from '@/features/reviews/components/stars';
import { businessService } from '@/services/business.service';
import { dateFormat } from '../lib/labels';

/** Published reviews across the business's places, newest first. Owners can read, never hide. */
export function ReviewsPanel() {
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<BusinessReview[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    businessService
      .reviews({ page }, controller.signal)
      .then((result) => {
        setReviews(result.data);
        setMeta(result.meta ?? null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load reviews.' },
        );
      });
    return () => controller.abort();
  }, [page, reload]);

  if (error) {
    return (
      <ErrorState
        message={error.message}
        requestId={error.requestId}
        onRetry={() => setReload((count) => count + 1)}
      />
    );
  }
  if (reviews === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (reviews.length === 0) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Reviews students write on your live listings appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {reviews.map((review) => (
          <li key={review.id}>
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars value={review.rating} />
                  <span className="text-sm font-medium text-ink">{review.authorName}</span>
                </div>
                <span className="text-sm text-muted">
                  {dateFormat.format(new Date(review.createdAt))}
                </span>
              </div>
              <Link
                href={ROUTES.placeDetail(review.place.slug)}
                className="w-fit text-sm font-medium text-action hover:text-action-hover"
              >
                {review.place.name}
              </Link>
              {review.comment && <p className="whitespace-pre-line text-body">{review.comment}</p>}
              {review.dimensionRatings.length > 0 && (
                <p className="text-sm text-muted">
                  {review.dimensionRatings
                    .map((dimension) => `${dimension.label} ${dimension.rating}/5`)
                    .join(' · ')}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
