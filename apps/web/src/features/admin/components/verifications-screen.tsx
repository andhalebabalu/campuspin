'use client';

import {
  STUDENT_VERIFICATION_STATUSES,
  type AdminStudentVerification,
  type StudentVerificationStatus,
} from '@platform/contracts';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { adminService } from '@/services/admin.service';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SELECT_CLASSES,
  dateFormat,
  errorMessage,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const STATUS: Record<StudentVerificationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Pending', tone: 'accent' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

/**
 * Student verification review: look at an uploaded ID photo (fetched privately, never a public URL),
 * approve it, reject it with a reason, or ask a verified student to verify again. College-email
 * requests verify themselves once the code is entered; they show here only for the record.
 */
export function VerificationsScreen({
  initialStatus,
}: {
  initialStatus: StudentVerificationStatus | '';
}) {
  const [status, setStatus] = useState<StudentVerificationStatus | ''>(initialStatus);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) => adminService.studentVerifications({ page, ...(status ? { status } : {}) }, signal),
    [status, page],
  );
  const update = (next: AdminStudentVerification) =>
    list.replace((item) => item.id === next.id, next);

  return (
    <div>
      <AdminHeader
        title="Student verifications"
        description="Check that the ID photo shows the student's name and the college they chose. The photo is deleted once you decide."
      />
      <div className="mb-4">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StudentVerificationStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {STUDENT_VERIFICATION_STATUSES.map((value) => (
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
        <EmptyState
          title="Nothing to review"
          description="No verification requests match this filter."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((item) => (
            <li key={item.id}>
              <Card className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{item.user.name}</span>
                      <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                      <Badge tone="neutral">
                        {item.method === 'DOCUMENT' ? 'ID photo' : 'College email'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted">
                      {item.college.name} · requested {dateFormat.format(new Date(item.createdAt))}
                    </p>
                    <p className="break-all text-xs text-muted">
                      Account {item.user.email}
                      {item.collegeEmail && ` · college email ${item.collegeEmail}`}
                    </p>
                    {item.expiresAt && item.status === 'VERIFIED' && (
                      <p className="text-xs text-muted">
                        Valid until {dateFormat.format(new Date(item.expiresAt))}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'PENDING' && item.method === 'DOCUMENT' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            setDialog({
                              title: `Approve ${item.user.name}?`,
                              description: `They get the Verified Student badge for ${item.college.name}.`,
                              confirmLabel: 'Approve',
                              required: false,
                              onConfirm: async (reason) =>
                                update(
                                  (await adminService.approveStudentVerification(item.id, reason))
                                    .data,
                                ),
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setDialog({
                              title: 'Reject this request?',
                              description:
                                'The student sees your reason and can try again with a clearer photo.',
                              confirmLabel: 'Reject',
                              required: true,
                              danger: true,
                              onConfirm: async (reason) =>
                                update(
                                  (await adminService.rejectStudentVerification(item.id, reason))
                                    .data,
                                ),
                            })
                          }
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {item.status === 'VERIFIED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDialog({
                            title: 'Ask them to verify again?',
                            description:
                              'Their badge is removed at once; they keep their account and can verify again.',
                            confirmLabel: 'Request re-verification',
                            required: true,
                            danger: true,
                            onConfirm: async (reason) =>
                              update(
                                (await adminService.requestReverification(item.id, reason)).data,
                              ),
                          })
                        }
                      >
                        Request re-verification
                      </Button>
                    )}
                  </div>
                </div>
                {item.hasDocument && <DocumentPreview verificationId={item.id} />}
                {item.reviewNote && <p className="text-sm text-muted">Note: {item.reviewNote}</p>}
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

/** Loads the private ID photo only when asked (each view is audited), and frees it afterwards. */
function DocumentPreview({ verificationId }: { verificationId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    adminService
      .studentDocumentUrl(verificationId)
      .then((next) => {
        objectUrl = next;
        if (cancelled) URL.revokeObjectURL(next);
        else setUrl(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught, 'Could not load the ID photo.'));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [open, verificationId]);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        View ID photo
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="text-sm text-danger-700">{error}</p>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private object URL, not optimisable.
        <img
          src={url}
          alt="Student ID submitted for verification"
          className="max-h-96 w-auto self-start rounded-lg border border-line object-contain"
        />
      ) : (
        <Skeleton className="h-64 w-full max-w-md" />
      )}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen(false)}>
        Hide ID photo
      </Button>
    </div>
  );
}
