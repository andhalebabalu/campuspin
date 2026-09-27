'use client';

import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_CONTENT_STATUSES,
  type AdminCommunityPost,
  type CommunityContentStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
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
  SEARCH_CLASSES,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const STATUS: Record<CommunityContentStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Live', tone: 'success' },
  HIDDEN: { label: 'Hidden', tone: 'accent' },
  REMOVED: { label: 'Removed', tone: 'danger' },
};

/** Every college's community posts: hide (reversible), restore, or remove for good. */
export function CommunityModerationScreen({ initialReported }: { initialReported: boolean }) {
  const [status, setStatus] = useState<CommunityContentStatus | ''>('');
  const [reported, setReported] = useState(initialReported);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) =>
      adminService.communityPosts(
        {
          page,
          ...(status ? { status } : {}),
          ...(q ? { q } : {}),
          ...(reported ? { reported: 'true' as const } : {}),
        },
        signal,
      ),
    [status, q, reported, page],
  );
  const update = (next: AdminCommunityPost) => list.replace((item) => item.id === next.id, next);

  function search(event: FormEvent) {
    event.preventDefault();
    setQ(qInput.trim());
    setPage(1);
  }

  return (
    <div>
      <AdminHeader
        title="Community"
        description="Posts from every college. Hiding tells the author why and can be undone; removing is final."
      />
      <form onSubmit={search} className="mb-4 flex flex-wrap gap-2">
        <input
          aria-label="Search titles"
          placeholder="Search titles"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-56`}
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as CommunityContentStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {COMMUNITY_CONTENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS[value].label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={reported}
            onChange={(event) => {
              setReported(event.target.checked);
              setPage(1);
            }}
          />
          Reported only
        </label>
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
      </form>

      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No posts" description="Nothing matches this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((post) => (
            <li key={post.id}>
              <Card className="flex flex-col gap-2 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS[post.status].tone}>{STATUS[post.status].label}</Badge>
                      <Badge tone="neutral">{COMMUNITY_CATEGORY_LABELS[post.category]}</Badge>
                      {post.openReports > 0 && (
                        <span className="text-xs font-medium text-danger-700">
                          {post.openReports} open reports
                        </span>
                      )}
                    </div>
                    <Link
                      href={ROUTES.communityPost(post.id)}
                      target="_blank"
                      className="font-semibold text-ink hover:text-action"
                    >
                      {post.title ?? post.body.slice(0, 80)}
                    </Link>
                    <p className="text-xs text-muted">
                      {post.author.name} · {post.college.name} ·{' '}
                      {post.visibility === 'PUBLIC' ? 'Public' : 'College only'} ·{' '}
                      {dateFormat.format(new Date(post.createdAt))}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {post.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDialog({
                            title: 'Hide this post?',
                            description: 'Only the author sees it, with your reason.',
                            confirmLabel: 'Hide',
                            required: true,
                            onConfirm: async (reason) =>
                              update(
                                (await adminService.communityPostAction(post.id, 'hide', reason))
                                  .data,
                              ),
                          })
                        }
                      >
                        Hide
                      </Button>
                    )}
                    {post.status === 'HIDDEN' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDialog({
                            title: 'Restore this post?',
                            confirmLabel: 'Restore',
                            required: false,
                            onConfirm: async (reason) =>
                              update(
                                (
                                  await adminService.communityPostAction(
                                    post.id,
                                    'restore',
                                    reason || undefined,
                                  )
                                ).data,
                              ),
                          })
                        }
                      >
                        Restore
                      </Button>
                    )}
                    {post.status !== 'REMOVED' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setDialog({
                            title: 'Remove this post for good?',
                            description: 'This cannot be undone.',
                            confirmLabel: 'Remove',
                            required: true,
                            danger: true,
                            onConfirm: async (reason) =>
                              update(
                                (await adminService.communityPostAction(post.id, 'remove', reason))
                                  .data,
                              ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-body">{post.body}</p>
                {post.moderationNote && (
                  <p className="text-sm text-muted">Moderation note: {post.moderationNote}</p>
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
