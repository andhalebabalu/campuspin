import type {
  CommunityCategory,
  CommunityContentStatus,
  CommunityVisibility,
  NotificationCategory,
} from '@platform/contracts';

/** A verified student may send at most this many messages in any hour (spam brake). */
export const POSTS_PER_HOUR = 120;

/** The reader of a community resource, as resolved from the database. */
export interface Viewer {
  userId: string | null;
  /** The viewer's VERIFIED college, or null when they are not a verified student. */
  collegeId: string | null;
  /** Members blocked either way: their content is invisible to this viewer. */
  hidden: string[];
}

/**
 * Whether a viewer may read a post. Authors always see their own post unless it is removed (so they
 * can read a moderator's note); everyone else sees only ACTIVE posts they are in the audience of.
 */
export function mayReadPost(
  post: {
    authorId: string;
    collegeId: string;
    visibility: CommunityVisibility;
    status: CommunityContentStatus;
  },
  viewer: Viewer,
): boolean {
  if (post.status === 'REMOVED') return false;
  if (viewer.userId !== null && post.authorId === viewer.userId) return true;
  if (post.status !== 'ACTIVE') return false;
  if (viewer.hidden.includes(post.authorId)) return false;
  return post.visibility === 'PUBLIC' || post.collegeId === viewer.collegeId;
}

/** Which notification switch a new post of this category reaches classmates under, if any. */
export function eventCategoryFor(category: CommunityCategory): NotificationCategory | null {
  if (category === 'EVENT') return 'EVENTS';
  if (category === 'JOB') return 'JOBS';
  return null;
}

/**
 * Cuts a `limit + 1` query result into a page. Ids are UUIDv7 (time-ordered), so the last id on the
 * page is the cursor for the next one.
 */
export function cursorPage<T extends { id: string }>(
  rows: readonly T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null,
  };
}
