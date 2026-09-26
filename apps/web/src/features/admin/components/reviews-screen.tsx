'use client';

import { REVIEW_STATUSES, type Review, type ReviewStatus } from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { Stars } from '@/features/reviews/components/stars';
import { adminService } from '@/services/admin.service';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const STATUS: Record<ReviewStatus, { label: string; tone: BadgeTone }> = {
  PUBLISHED: { label: 'Published', tone: 'success' },
  HIDDEN: { label: 'Hidden', tone: 'accent' },
  REPORTED: { label: 'Reported', tone: 'accent' },
  REMOVED: { label: 'Removed', tone: 'danger' },
};

/** Review moderation: hide (reversible), restore, remove (final). Owners can never do this. */
export function ReviewsScreen({ initialStatus }: { initialStatus: ReviewStatus | '' }) {
  const [status, setStatus] = useState<ReviewStatus | ''>(initialStatus);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) => adminService.reviews({ page, ...(status ? { status } : {}) }, signal),
    [status, page],
  );
  const update = (next: Review) => list.replace((item) => item.id === next.id, next);

  return (
    <div>
      <AdminHeader
        title="Reviews"
        description="Hide a review while you look into it (the author sees your reason), restore it, or remove it for good."
      />
      <div className="mb-4">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ReviewStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {REVIEW_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS[value].label}
            </option>
          ))}
        </select>
      </div>

      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No reviews" description="No reviews match this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((review) => (
            <li key={review.id}>
              <Card className="flex flex-col gap-2 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={review.rating} />
                      <span className="text-sm font-medium text-ink">{review.authorName}</span>
                      <Badge tone={STATUS[review.status].tone}>{STATUS[review.status].label}</Badge>
                    </div>
                    <p className="text-sm text-muted">
                      <Link
                        href={ROUTES.placeDetail(review.place.slug)}
                        target="_blank"
                        className="font-medium text-action hover:underline"
                      >
                        {review.place.name}
                      </Link>{' '}
                      · {dateFormat.format(new Date(review.createdAt))}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(review.status === 'PUBLISHED' || review.status === 'REPORTED') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDialog({
                            title: 'Hide this review?',
                            description:
                              'It disappears from the place page; the author sees your reason.',
                            confirmLabel: 'Hide',
                            required: true,
                            onConfirm: async (reason) =>
                              update((await adminService.hideReview(review.id, reason)).data),
                          })
                        }
                      >
                        Hide
                      </Button>
                    )}
                    {review.status === 'HIDDEN' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDialog({
                            title: 'Restore this review?',
                            confirmLabel: 'Restore',
                            required: false,
                            onConfirm: async (reason) =>
                              update((await adminService.restoreReview(review.id, reason)).data),
                          })
                        }
                      >
                        Restore
                      </Button>
                    )}
                    {review.status !== 'REMOVED' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setDialog({
                            title: 'Remove this review for good?',
                            description:
                              'This cannot be undone. It stops counting in the place rating.',
                            confirmLabel: 'Remove',
                            required: true,
                            danger: true,
                            onConfirm: async (reason) =>
                              update((await adminService.removeReview(review.id, reason)).data),
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                {review.comment && (
                  <p className="whitespace-pre-line text-body">{review.comment}</p>
                )}
                {review.moderationNote && (
                  <p className="text-sm text-muted">Moderation note: {review.moderationNote}</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
