'use client';

import {
  REPORT_REASON_LABELS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type AdminReport,
  type ReportAction,
  type ReportStatus,
  type ReportTargetType,
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
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const STATUS: Record<ReportStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Open', tone: 'accent' },
  IN_REVIEW: { label: 'In review', tone: 'accent' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  DISMISSED: { label: 'Dismissed', tone: 'neutral' },
};

const TARGET_LABELS: Record<ReportTargetType, string> = {
  PLACE: 'Place',
  REVIEW: 'Review',
  USER: 'Member',
  MARKETPLACE_LISTING: 'Listing',
  COMMUNITY_POST: 'Post',
  COMMUNITY_COMMENT: 'Comment',
};

/**
 * Member reports on posts, comments, listings and members. Resolving can hide or remove the content
 * (which closes every open report on it); dismissing leaves it as it is.
 */
export function ReportsScreen({ initialStatus }: { initialStatus: ReportStatus | '' }) {
  const [status, setStatus] = useState<ReportStatus | ''>(initialStatus);
  const [targetType, setTargetType] = useState<ReportTargetType | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) =>
      adminService.reports(
        { page, ...(status ? { status } : {}), ...(targetType ? { targetType } : {}) },
        signal,
      ),
    [status, targetType, page],
  );

  const resolve = (report: AdminReport, action: ReportAction) =>
    setDialog({
      title:
        action === 'NONE'
          ? 'Close without action?'
          : action === 'HIDE'
            ? 'Hide this content?'
            : 'Remove this content for good?',
      description:
        action === 'NONE'
          ? 'The report is resolved but the content stays up.'
          : `The author is told, with your note. All ${report.openReportsOnTarget} open reports on it close.`,
      confirmLabel: action === 'NONE' ? 'Resolve' : action === 'HIDE' ? 'Hide' : 'Remove',
      required: true,
      danger: action === 'REMOVE',
      onConfirm: async (note) => {
        await adminService.resolveReport(report.id, action, note);
        list.reload();
      },
    });

  return (
    <div>
      <AdminHeader
        title="Reports"
        description="What members flagged in the community and marketplace. Open reports, oldest first."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ReportStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {REPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS[value].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Type"
          value={targetType}
          onChange={(event) => {
            setTargetType(event.target.value as ReportTargetType | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">Everything</option>
          {REPORT_TARGET_TYPES.filter((value) => value !== 'PLACE' && value !== 'REVIEW').map(
            (value) => (
              <option key={value} value={value}>
                {TARGET_LABELS[value]}
              </option>
            ),
          )}
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
        <EmptyState title="No reports" description="Nothing matches this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((report) => {
            const open = report.status === 'PENDING' || report.status === 'IN_REVIEW';
            return (
              <li key={report.id}>
                <Card className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS[report.status].tone}>{STATUS[report.status].label}</Badge>
                    <Badge tone="neutral">{TARGET_LABELS[report.target.type]}</Badge>
                    <span className="text-sm font-semibold text-ink">
                      {REPORT_REASON_LABELS[report.reason]}
                    </span>
                    {report.openReportsOnTarget > 1 && (
                      <span className="text-xs font-medium text-danger-700">
                        {report.openReportsOnTarget} open reports on this
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted">
                      {dateFormat.format(new Date(report.createdAt))} · by {report.reporter.name}
                    </span>
                  </div>
                  {report.description && (
                    <p className="text-sm text-body">“{report.description}”</p>
                  )}
                  <div className="rounded-lg border border-line bg-subtle p-3 text-sm">
                    {report.target.label ? (
                      <>
                        <p className="font-medium text-ink">
                          {report.target.link ? (
                            <Link
                              href={report.target.link}
                              target="_blank"
                              className="text-action hover:underline"
                            >
                              {report.target.label}
                            </Link>
                          ) : (
                            report.target.label
                          )}
                          {report.target.status && (
                            <span className="ml-2 text-xs font-normal text-muted">
                              ({report.target.status.toLowerCase()})
                            </span>
                          )}
                        </p>
                        {report.target.excerpt && (
                          <p className="mt-1 whitespace-pre-line text-body">
                            {report.target.excerpt}
                          </p>
                        )}
                        {report.target.owner && (
                          <p className="mt-1 text-xs text-muted">
                            By{' '}
                            <Link
                              href={`${ROUTES.adminUsers}?q=${encodeURIComponent(report.target.owner.name)}`}
                              className="hover:underline"
                            >
                              {report.target.owner.name}
                            </Link>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted">The reported item no longer exists.</p>
                    )}
                  </div>
                  {report.resolution && (
                    <p className="text-sm text-muted">Note: {report.resolution}</p>
                  )}
                  {open && (
                    <div className="flex flex-wrap gap-2">
                      {report.target.type !== 'USER' && (
                        <>
                          {report.target.type !== 'COMMUNITY_COMMENT' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => resolve(report, 'HIDE')}
                            >
                              Hide content
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => resolve(report, 'REMOVE')}
                          >
                            Remove content
                          </Button>
                        </>
                      )}
                      {report.target.type === 'USER' && (
                        <Link
                          href={`${ROUTES.adminUsers}?q=${encodeURIComponent(report.target.label ?? '')}`}
                          className="inline-flex h-9 items-center rounded-md border border-control px-3 text-sm font-medium text-ink hover:bg-subtle"
                        >
                          Review account
                        </Link>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => resolve(report, 'NONE')}>
                        Resolve, no action
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDialog({
                            title: 'Dismiss this report?',
                            description: 'Only this report closes; the content stays up.',
                            confirmLabel: 'Dismiss',
                            required: false,
                            onConfirm: async (note) => {
                              await adminService.dismissReport(report.id, note || undefined);
                              list.reload();
                            },
                          })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
