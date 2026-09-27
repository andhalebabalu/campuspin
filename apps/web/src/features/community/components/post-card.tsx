import {
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCategory,
  type CommunityPost,
} from '@platform/contracts';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { eventTime, timeAgo } from '@/lib/format/time';
import { MemberLine } from './member-line';

export const CATEGORY_ICONS: Record<CommunityCategory, IconName> = {
  DISCUSSION: 'chats',
  QUESTION: 'info',
  ANNOUNCEMENT: 'sparkles',
  EVENT: 'calendar',
  STUDY: 'book',
  JOB: 'laptop',
  LOST_FOUND: 'search',
  STUDENT_UPDATE: 'graduation',
};

export function CategoryChip({ category }: { category: CommunityCategory }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
      <Icon name={CATEGORY_ICONS[category]} className="size-3.5" />
      {COMMUNITY_CATEGORY_LABELS[category]}
    </span>
  );
}

export function VisibilityNote({ visibility }: { visibility: CommunityPost['visibility'] }) {
  return visibility === 'PUBLIC' ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon name="globe" className="size-3.5" /> Public
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon name="shield" className="size-3.5" /> College only
    </span>
  );
}

export function EventBox({ event }: { event: NonNullable<CommunityPost['event']> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-accent-50 px-3 py-2 text-sm text-ink">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Icon name="calendar" className="size-4 text-accent-700" />
        {eventTime(event.startsAt)}
      </span>
      {event.location && (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="pin" className="size-4 text-accent-700" />
          {event.location}
        </span>
      )}
    </p>
  );
}

/** A post in a feed: who, what, and how many reacted or replied. Opens the full thread. */
export function PostCard({ post }: { post: CommunityPost }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <MemberLine member={post.author} meta={timeAgo(post.createdAt)} />
        <CategoryChip category={post.category} />
      </div>
      <Link href={ROUTES.communityPost(post.id)} className="group flex flex-col gap-1.5">
        {post.title && (
          <h2 className="text-lg font-bold text-ink group-hover:text-action">{post.title}</h2>
        )}
        <p className="line-clamp-4 whitespace-pre-line text-sm text-body">{post.body}</p>
      </Link>
      {post.event && <EventBox event={post.event} />}
      <div className="flex items-center gap-4 border-t border-line pt-3 text-sm text-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="heart" className="size-4" /> {post.reactionCount}
          <span className="sr-only">reactions</span>
        </span>
        <Link
          href={ROUTES.communityPost(post.id)}
          className="inline-flex items-center gap-1 hover:text-action"
        >
          <Icon name="chat" className="size-4" /> {post.commentCount}
          <span className="sr-only">comments</span>
        </Link>
        <span className="ml-auto">
          <VisibilityNote visibility={post.visibility} />
        </span>
      </div>
    </article>
  );
}
