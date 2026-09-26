'use client';

import {
  SUBMISSION_STATUSES,
  type PlaceSubmission,
  type SubmissionStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { adminService } from '@/services/admin.service';
import { formatPrice } from '@/utils/format-price';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const STATUS: Record<SubmissionStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Pending', tone: 'accent' },
  UNDER_REVIEW: { label: 'Under review', tone: 'accent' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  DUPLICATE: { label: 'Duplicate', tone: 'neutral' },
};

/** The review queue for student suggestions and business listings. */
export function SubmissionsScreen({ initialStatus }: { initialStatus: SubmissionStatus | '' }) {
  const [status, setStatus] = useState<SubmissionStatus | ''>(initialStatus);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) =>
      adminService.submissions({ page, sort: 'oldest', ...(status ? { status } : {}) }, signal),
    [status, page],
  );

  const update = (next: PlaceSubmission) => list.replace((item) => item.id === next.id, next);

  return (
    <div>
      <AdminHeader
        title="Submissions"
        description="New places suggested by students and listed by businesses. Nothing is public until approved. Oldest first."
      />
      <div className="mb-4 flex gap-3">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as SubmissionStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {SUBMISSION_STATUSES.map((value) => (
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
        <EmptyState title="Nothing here" description="No submissions match this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((submission) => (
            <li key={submission.id}>
              <SubmissionCard
                submission={submission}
                onApprove={() =>
                  setDialog({
                    title: `Approve “${submission.name}”?`,
                    description: 'The place goes live for students immediately.',
                    confirmLabel: 'Approve',
                    required: false,
                    onConfirm: async (reason) =>
                      update((await adminService.approveSubmission(submission.id, reason)).data),
                  })
                }
                onReject={() =>
                  setDialog({
                    title: `Reject “${submission.name}”?`,
                    description: 'The submitter sees your reason.',
                    confirmLabel: 'Reject',
                    required: true,
                    danger: true,
                    onConfirm: async (reason) =>
                      update((await adminService.rejectSubmission(submission.id, reason)).data),
                  })
                }
                onDuplicate={(placeId, name) =>
                  setDialog({
                    title: `Mark as a duplicate of “${name}”?`,
                    description: 'Nothing new is published; the existing place stays as it is.',
                    confirmLabel: 'Mark duplicate',
                    required: false,
                    onConfirm: async (reason) =>
                      update(
                        (await adminService.markDuplicate(submission.id, placeId, reason)).data,
                      ),
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function SubmissionCard({
  submission,
  onApprove,
  onReject,
  onDuplicate,
}: {
  submission: PlaceSubmission;
  onApprove: () => void;
  onReject: () => void;
  onDuplicate: (placeId: string, name: string) => void;
}) {
  const open = submission.status === 'PENDING' || submission.status === 'UNDER_REVIEW';
  const status = STATUS[submission.status];
  const mapUrl = `https://www.openstreetmap.org/?mlat=${submission.latitude}&mlon=${submission.longitude}#map=18/${submission.latitude}/${submission.longitude}`;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{submission.name}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge>{submission.category.name}</Badge>
          </div>
          <p className="text-sm text-body">
            {submission.address}
            {submission.city ? `, ${submission.city}` : ''} ·{' '}
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-action hover:underline"
            >
              View pin on map
            </a>
          </p>
          <p className="text-sm text-muted">
            Submitted {dateFormat.format(new Date(submission.createdAt))}
            {submission.phone ? ` · ${submission.phone}` : ''}
            {submission.priceAmount !== null
              ? ` · ${formatPrice(submission.priceAmount, submission.priceAmount, submission.priceUnit)}`
              : ''}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onApprove}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={onReject}>
              Reject
            </Button>
          </div>
        )}
      </div>

      {submission.description && (
        <p className="whitespace-pre-line text-sm text-body">{submission.description}</p>
      )}

      {submission.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {submission.images.map((image) => (
            <a key={image.id} href={image.imageUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API. */}
              <img src={image.imageUrl} alt="" className="size-20 rounded-md object-cover" />
            </a>
          ))}
        </div>
      )}

      {submission.duplicateCandidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-subtle p-3">
          <p className="text-sm font-medium text-ink">Possible duplicates found at submit time</p>
          {submission.duplicateCandidates.map((candidate) => (
            <div
              key={candidate.placeId}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                <Link
                  href={ROUTES.placeDetail(candidate.slug)}
                  target="_blank"
                  className="font-medium text-action hover:underline"
                >
                  {candidate.name}
                </Link>{' '}
                <span className="text-muted">
                  · {Math.round(candidate.score * 100)}% · {candidate.reasons.join(', ')}
                </span>
              </span>
              {open && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDuplicate(candidate.placeId, candidate.name)}
                >
                  It&apos;s this one
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {submission.reviewNote && (
        <p className="text-sm text-muted">Staff note: {submission.reviewNote}</p>
      )}
    </Card>
  );
}
