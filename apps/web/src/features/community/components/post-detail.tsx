'use client';

import { ApiClientError } from '@platform/api-client';
import {
  COMMUNITY_COMMENT_MAX,
  COMMUNITY_REPORT_REASONS,
  type CommunityComment,
  type CommunityPost,
  type CommunityReactionType,
} from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ReportDialog } from '@/components/shared/report-dialog';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { timeAgo } from '@/lib/format/time';
import { communityService } from '@/services/community.service';
import { safetyService } from '@/services/safety.service';
import { MemberLine } from './member-line';
import { CategoryChip, EventBox, VisibilityNote } from './post-card';

const REACTIONS: Array<{ type: CommunityReactionType; label: string; icon: IconName }> = [
  { type: 'LIKE', label: 'Like', icon: 'heart' },
  { type: 'HELPFUL', label: 'Helpful', icon: 'check' },
  { type: 'CELEBRATE', label: 'Celebrate', icon: 'sparkles' },
];

type ReportTarget = { kind: 'post' } | { kind: 'comment'; id: string } | null;

/** One post with its thread. Reading follows the post's audience; replying needs a verified student. */
export function PostDetail({ postId }: { postId: string }) {
  const router = useRouter();
  const { status, user } = useSession();
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const [report, setReport] = useState<ReportTarget>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    const controller = new AbortController();
    Promise.all([
      communityService.post(postId, controller.signal),
      communityService.comments(postId, undefined, controller.signal),
    ])
      .then(([postResult, commentResult]) => {
        setPost(postResult.data);
        setComments(commentResult.data.items);
        setCursor(commentResult.data.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const missing = caught instanceof ApiClientError && caught.status === 404;
        setError({
          missing,
          message: caught instanceof ApiClientError ? caught.message : 'Could not load this post.',
        });
      });
    return () => controller.abort();
  }, [postId, status, reload]);

  if (error?.missing) {
    return (
      <EmptyState
        title="Post not available"
        description="It was removed, or it is only visible to verified students of its college."
        action={
          <Link href={ROUTES.community} className="text-sm font-medium text-action hover:underline">
            Back to the community
          </Link>
        }
      />
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={() => setReload((n) => n + 1)} />;
  if (!post) return <Skeleton className="h-96 w-full" />;

  const canReply =
    post.status === 'ACTIVE' &&
    Boolean(user?.student.verified) &&
    (post.visibility === 'PUBLIC' || user?.student.college?.id === post.college.id);

  async function react(type: CommunityReactionType) {
    if (!post) return;
    try {
      const result =
        post.myReaction === type
          ? await communityService.unreact(post.id)
          : await communityService.react(post.id, type);
      setPost({ ...post, ...result.data });
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not react.');
    }
  }

  async function deletePost() {
    if (!post || !window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await communityService.remove(post.id);
      router.push(ROUTES.community);
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not delete.');
    }
  }

  async function blockAuthor() {
    if (!post) return;
    if (!window.confirm(`Block ${post.author.displayName}? You will stop seeing each other.`))
      return;
    try {
      await safetyService.block(post.author.id);
      router.push(ROUTES.community);
    } catch (caught) {
      setNotice(caught instanceof ApiClientError ? caught.message : 'Could not block.');
    }
  }

  async function loadMore() {
    if (!cursor) return;
    const result = await communityService.comments(postId, cursor);
    setComments((current) => [...current, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }

  const topLevel = comments.filter((comment) => !comment.parentId);
  const repliesTo = (id: string) => comments.filter((comment) => comment.parentId === id);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={ROUTES.community}
        className="inline-flex items-center gap-1 text-sm font-medium text-action hover:underline"
      >
        <Icon name="arrowLeft" className="size-4" /> Community
      </Link>
      {notice && <FormAlert message={notice} />}

      <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        {post.status === 'HIDDEN' && (
          <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-ink">
            A moderator hid this post while they look into it
            {post.moderationNote ? `: ${post.moderationNote}` : '.'} Only you can see it.
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <MemberLine member={post.author} meta={timeAgo(post.createdAt)} />
          <CategoryChip category={post.category} />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-ink">{post.title}</h1>
          <p className="whitespace-pre-line text-body">{post.body}</p>
          {post.editedAt && <p className="text-xs text-muted">Edited {timeAgo(post.editedAt)}</p>}
        </div>
        {post.event && <EventBox event={post.event} />}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.type}
              type="button"
              disabled={!user?.student.verified || post.status !== 'ACTIVE'}
              aria-pressed={post.myReaction === reaction.type}
              onClick={() => void react(reaction.type)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                post.myReaction === reaction.type
                  ? 'border-action bg-primary-50 font-medium text-action'
                  : 'border-line text-body hover:border-action'
              }`}
            >
              <Icon name={reaction.icon} className="size-4" />
              {reaction.label}
            </button>
          ))}
          <span className="text-sm text-muted">{post.reactionCount} reactions</span>
          <span className="ml-auto">
            <VisibilityNote visibility={post.visibility} />
          </span>
        </div>
        {status === 'authenticated' && (
          <div className="flex flex-wrap gap-2 text-sm">
            {post.mine ? (
              <Button size="sm" variant="ghost" onClick={() => void deletePost()}>
                Delete post
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setReport({ kind: 'post' })}>
                  Report
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void blockAuthor()}>
                  Block {post.author.displayName}
                </Button>
              </>
            )}
          </div>
        )}
      </article>

      <section className="flex flex-col gap-3" aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="text-lg font-bold text-ink">
          {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
        </h2>
        {canReply ? (
          <CommentForm
            postId={post.id}
            onAdded={(comment) => {
              setComments((current) => [...current, comment]);
              setPost({ ...post, commentCount: post.commentCount + 1 });
            }}
          />
        ) : (
          post.status === 'ACTIVE' && (
            <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-body">
              {status !== 'authenticated' ? (
                <>
                  <Link href={ROUTES.login} className="font-medium text-action hover:underline">
                    Sign in
                  </Link>{' '}
                  as a verified student to reply.
                </>
              ) : !user?.student.verified ? (
                <>
                  <Link
                    href={ROUTES.meVerification}
                    className="font-medium text-action hover:underline"
                  >
                    Verify your college
                  </Link>{' '}
                  to reply.
                </>
              ) : (
                'Only students of this college can reply here.'
              )}
            </p>
          )
        )}
        {topLevel.length === 0 ? (
          <p className="text-sm text-muted">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {topLevel.map((comment) => (
              <li key={comment.id}>
                <CommentItem
                  comment={comment}
                  signedIn={status === 'authenticated'}
                  onReport={() => setReport({ kind: 'comment', id: comment.id })}
                  onDeleted={() => {
                    setComments((current) => current.filter((item) => item.id !== comment.id));
                    setPost({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
                  }}
                />
                <ul className="ml-6 mt-2 flex flex-col gap-2 border-l-2 border-line pl-4">
                  {repliesTo(comment.id).map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        comment={reply}
                        signedIn={status === 'authenticated'}
                        onReport={() => setReport({ kind: 'comment', id: reply.id })}
                        onDeleted={() => {
                          setComments((current) => current.filter((item) => item.id !== reply.id));
                          setPost({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
                        }}
                      />
                    </li>
                  ))}
                  {canReply && (
                    <li>
                      <ReplyToggle
                        postId={post.id}
                        parentId={comment.id}
                        onAdded={(reply) => {
                          setComments((current) => [...current, reply]);
                          setPost({ ...post, commentCount: post.commentCount + 1 });
                        }}
                      />
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <Button variant="secondary" className="self-center" onClick={() => void loadMore()}>
            More comments
          </Button>
        )}
      </section>

      <ReportDialog
        open={report !== null}
        title={report?.kind === 'comment' ? 'Report this comment' : 'Report this post'}
        reasons={COMMUNITY_REPORT_REASONS}
        onClose={() => setReport(null)}
        onSubmit={(dto) =>
          report?.kind === 'comment'
            ? communityService.reportComment(report.id, dto)
            : communityService.reportPost(post.id, dto)
        }
      />
    </div>
  );
}

function CommentItem({
  comment,
  signedIn,
  onReport,
  onDeleted,
}: {
  comment: CommunityComment;
  signedIn: boolean;
  onReport: () => void;
  onDeleted: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5">
      <MemberLine member={comment.author} meta={timeAgo(comment.createdAt)} />
      <p className="whitespace-pre-line text-sm text-body">{comment.body}</p>
      {signedIn && (
        <div className="flex gap-3 text-xs">
          {comment.mine ? (
            <button
              type="button"
              className="text-muted hover:text-danger-700"
              onClick={async () => {
                if (!window.confirm('Delete this comment?')) return;
                await communityService.removeComment(comment.id);
                onDeleted();
              }}
            >
              Delete
            </button>
          ) : (
            <button type="button" className="text-muted hover:text-ink" onClick={onReport}>
              Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReplyToggle(props: {
  postId: string;
  parentId: string;
  onAdded: (comment: CommunityComment) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-action hover:underline"
      >
        Reply
      </button>
    );
  }
  return (
    <CommentForm
      {...props}
      compact
      onAdded={(comment) => {
        props.onAdded(comment);
        setOpen(false);
      }}
    />
  );
}

function CommentForm({
  postId,
  parentId,
  compact = false,
  onAdded,
}: {
  postId: string;
  parentId?: string;
  compact?: boolean;
  onAdded: (comment: CommunityComment) => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await communityService.comment(postId, {
        body: body.trim(),
        ...(parentId ? { parentId } : {}),
      });
      onAdded(result.data);
      setBody('');
    } catch (caught) {
      setProblem(caught instanceof ApiClientError ? caught.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={`comment-${parentId ?? 'top'}`} className="sr-only">
        {parentId ? 'Your reply' : 'Your comment'}
      </label>
      <textarea
        id={`comment-${parentId ?? 'top'}`}
        rows={compact ? 2 : 3}
        maxLength={COMMUNITY_COMMENT_MAX}
        placeholder={parentId ? 'Write a reply…' : 'Write a comment…'}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className="rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink"
      />
      {problem && <p className="text-sm text-danger-700">{problem}</p>}
      <Button type="submit" size="sm" loading={busy} className="self-end">
        {parentId ? 'Reply' : 'Comment'}
      </Button>
    </form>
  );
}
