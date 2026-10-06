import { z } from 'zod';
import { collegeRefSchema, memberSummarySchema } from './members.js';
import { cursorQuerySchema } from './pagination.js';
import { multiLineField, singleLineField, uuidSchema } from './text.js';

// Match the Prisma enums of the community migration exactly.
export const COMMUNITY_CATEGORIES = [
  'DISCUSSION',
  'QUESTION',
  'ANNOUNCEMENT',
  'EVENT',
  'STUDY',
  'JOB',
  'LOST_FOUND',
  'STUDENT_UPDATE',
] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];
export const communityCategorySchema = z.enum(COMMUNITY_CATEGORIES);

export const COMMUNITY_CATEGORY_LABELS: Record<CommunityCategory, string> = {
  DISCUSSION: 'Discussion',
  QUESTION: 'Question',
  ANNOUNCEMENT: 'Announcement',
  EVENT: 'Event',
  STUDY: 'Study & notes',
  JOB: 'Jobs & internships',
  LOST_FOUND: 'Lost & found',
  STUDENT_UPDATE: 'Student update',
};

/** COLLEGE_ONLY (the default): only verified students of the college. PUBLIC: anyone can read it. */
export const COMMUNITY_VISIBILITIES = ['COLLEGE_ONLY', 'PUBLIC'] as const;
export type CommunityVisibility = (typeof COMMUNITY_VISIBILITIES)[number];
export const communityVisibilitySchema = z.enum(COMMUNITY_VISIBILITIES);

export const COMMUNITY_CONTENT_STATUSES = ['ACTIVE', 'HIDDEN', 'REMOVED'] as const;
export type CommunityContentStatus = (typeof COMMUNITY_CONTENT_STATUSES)[number];
export const communityContentStatusSchema = z.enum(COMMUNITY_CONTENT_STATUSES);

export const COMMUNITY_REACTIONS = ['LIKE', 'HELPFUL', 'CELEBRATE'] as const;
export type CommunityReactionType = (typeof COMMUNITY_REACTIONS)[number];
export const communityReactionTypeSchema = z.enum(COMMUNITY_REACTIONS);

/** Where a feed reads from: my verified college's community, or public posts of every college. */
export const COMMUNITY_SCOPES = ['college', 'public'] as const;
export type CommunityScope = (typeof COMMUNITY_SCOPES)[number];

export const COMMUNITY_TITLE_MAX = 150;
export const COMMUNITY_BODY_MAX = 5000;
export const COMMUNITY_COMMENT_MAX = 2000;

// ── Responses ────────────────────────────────────────────────────────────────────────────────────

export const communityPostSchema = z.object({
  id: z.string(),
  category: communityCategorySchema,
  visibility: communityVisibilitySchema,
  /** Chat messages have no title. */
  title: z.string().nullable(),
  body: z.string(),
  /** The message this one quotes, if it is a reply (null when that message is gone). */
  replyTo: z.object({ id: z.string(), authorName: z.string(), excerpt: z.string() }).nullable(),
  /** Always the author's verified college at the time of posting. */
  college: collegeRefSchema,
  author: memberSummarySchema,
  event: z.object({ startsAt: z.string(), location: z.string().nullable() }).nullable(),
  status: communityContentStatusSchema,
  /** A moderator's reason, shown only to the author and staff. */
  moderationNote: z.string().nullable(),
  commentCount: z.number().int(),
  reactionCount: z.number().int(),
  /** The viewer's own reaction (null when signed out or not reacted). */
  myReaction: communityReactionTypeSchema.nullable(),
  /** True when the viewer wrote it. */
  mine: z.boolean(),
  editedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CommunityPost = z.infer<typeof communityPostSchema>;

export const communityCommentSchema = z.object({
  id: z.string(),
  postId: z.string(),
  /** Set on a reply: the top-level comment it answers. */
  parentId: z.string().nullable(),
  body: z.string(),
  author: memberSummarySchema,
  mine: z.boolean(),
  createdAt: z.string(),
});
export type CommunityComment = z.infer<typeof communityCommentSchema>;

export const reactionSummarySchema = z.object({
  reactionCount: z.number().int(),
  myReaction: communityReactionTypeSchema.nullable(),
});
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;

// ── Requests ─────────────────────────────────────────────────────────────────────────────────────

export const listCommunityPostsQuerySchema = cursorQuerySchema.extend({
  /** Omitted: my college for a verified student, public posts for everyone else. */
  scope: z.enum(COMMUNITY_SCOPES).optional(),
  category: communityCategorySchema.optional(),
  /** Public scope only: one college's public posts (e.g. on its page). */
  collegeId: uuidSchema.optional(),
  /** One member's posts (their profile), still within what the viewer may see. */
  authorId: uuidSchema.optional(),
});
export type ListCommunityPostsQuery = z.output<typeof listCommunityPostsQuerySchema>;

const titleField = singleLineField('Title', COMMUNITY_TITLE_MAX);
const bodyField = multiLineField('Post', COMMUNITY_BODY_MAX);
const eventLocationField = singleLineField('Location', 200);

const postFields = {
  visibility: communityVisibilitySchema.default('COLLEGE_ONLY'),
  title: titleField.optional().meta({ example: 'Anyone has last year’s DBMS notes?' }),
  body: bodyField.meta({ example: 'Looking for the unit 3 and 4 notes. Can pay for printing.' }),
  eventStartsAt: z.iso.datetime({ offset: true }).optional(),
  eventLocation: eventLocationField.optional(),
};

function eventRule(
  value: { category?: CommunityCategory; eventStartsAt?: string; eventLocation?: string },
  ctx: z.RefinementCtx,
) {
  if (
    value.category &&
    value.category !== 'EVENT' &&
    (value.eventStartsAt || value.eventLocation)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['eventStartsAt'],
      message: 'Only event posts have a date and place',
    });
  }
}

/** `POST /community/posts`. There is no college field: it always comes from the verified account. */
export const createCommunityPostSchema = z
  .strictObject({
    category: communityCategorySchema,
    ...postFields,
    /** Reply to another message in the same section of my college's chat. */
    replyToId: uuidSchema.optional(),
  })
  .superRefine(eventRule);
export type CreateCommunityPostRequest = z.output<typeof createCommunityPostSchema>;

/** `PATCH /community/posts/:id` (author only). The category and college never change. */
export const updateCommunityPostSchema = z
  .strictObject({
    visibility: communityVisibilitySchema.optional(),
    title: titleField.optional(),
    body: bodyField.optional(),
    eventStartsAt: z.iso.datetime({ offset: true }).optional(),
    eventLocation: eventLocationField.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateCommunityPostRequest = z.output<typeof updateCommunityPostSchema>;

export const listCommentsQuerySchema = cursorQuerySchema;
export type ListCommentsQuery = z.output<typeof listCommentsQuerySchema>;

export const createCommentSchema = z.strictObject({
  body: multiLineField('Comment', COMMUNITY_COMMENT_MAX).meta({ example: 'I have them, DM me.' }),
  parentId: uuidSchema.optional(),
});
export type CreateCommentRequest = z.output<typeof createCommentSchema>;

export const reactionRequestSchema = z.strictObject({ type: communityReactionTypeSchema });
export type ReactionRequest = z.output<typeof reactionRequestSchema>;

// ── Member profiles ──────────────────────────────────────────────────────────────────────────────

/** Another member as the viewer may see them; course and year follow the member's privacy choice. */
export const memberProfileSchema = memberSummarySchema.extend({
  course: z.string().nullable(),
  year: z.number().int().nullable(),
  memberSince: z.string(),
  /** False when the member hides their community activity from the viewer. */
  showsActivity: z.boolean(),
  /** True when the viewer has blocked this member. */
  blockedByMe: z.boolean(),
});
export type MemberProfile = z.infer<typeof memberProfileSchema>;

// ── Chat sections ────────────────────────────────────────────────────────────────────────────────

/** One section of my college's group chat, as the chat list shows it. */
export const communityChannelSchema = z.object({
  category: communityCategorySchema,
  lastMessage: z
    .object({
      id: z.string(),
      text: z.string(),
      authorName: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  messageCount: z.number().int(),
});
export type CommunityChannel = z.infer<typeof communityChannelSchema>;

export const communityChannelsSchema = z.object({
  college: collegeRefSchema,
  channels: z.array(communityChannelSchema),
});
export type CommunityChannels = z.infer<typeof communityChannelsSchema>;
