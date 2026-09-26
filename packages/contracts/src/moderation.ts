import { z } from 'zod';
import { communityContentStatusSchema, communityCategorySchema } from './community.js';
import { listingStatusSchema } from './marketplace.js';
import { collegeRefSchema } from './members.js';
import { paginationQuerySchema } from './pagination.js';
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from './safety.js';
import { singleLineField, uuidSchema } from './text.js';

/** A staff view of a member: enough to act on (the users screen has the rest). */
export const moderatedMemberSchema = z.object({ id: z.string(), name: z.string() });

// ── Reports queue ────────────────────────────────────────────────────────────────────────────────

export const adminReportSchema = z.object({
  id: z.string(),
  status: z.enum(REPORT_STATUSES),
  reason: z.enum(REPORT_REASONS),
  description: z.string().nullable(),
  reporter: moderatedMemberSchema,
  target: z.object({
    type: z.enum(REPORT_TARGET_TYPES),
    id: z.string(),
    /** A short human label (post title, listing title, member name), or null if it is gone. */
    label: z.string().nullable(),
    /** An excerpt of the reported text, when there is one. */
    excerpt: z.string().nullable(),
    /** The content's own status (ACTIVE / HIDDEN / REMOVED…), when it has one. */
    status: z.string().nullable(),
    /** Who wrote or listed it (the member themselves for a USER report). */
    owner: moderatedMemberSchema.nullable(),
    /** An in-app link to look at it. */
    link: z.string().nullable(),
  }),
  /** Open reports on the same target, this one included. */
  openReportsOnTarget: z.number().int(),
  resolution: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const adminListReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(REPORT_STATUSES).optional(),
  targetType: z.enum(REPORT_TARGET_TYPES).optional(),
});
export type AdminListReportsQuery = z.output<typeof adminListReportsQuerySchema>;

const noteField = singleLineField('Note', 500);

/**
 * `POST /admin/reports/:id/resolve`. `action` is applied to the reported content (HIDE is
 * reversible, REMOVE is final) and every open report on the same content is closed with it.
 */
export const REPORT_ACTIONS = ['NONE', 'HIDE', 'REMOVE'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];
export const resolveReportSchema = z.strictObject({
  action: z.enum(REPORT_ACTIONS),
  note: noteField.meta({ example: 'Spam: same post five times' }),
});
export type ResolveReportRequest = z.output<typeof resolveReportSchema>;

export const dismissReportSchema = z.strictObject({
  note: noteField.optional().meta({ example: 'Not against the rules' }),
});
export type DismissReportRequest = z.output<typeof dismissReportSchema>;

// ── Community moderation ─────────────────────────────────────────────────────────────────────────

export const adminCommunityPostSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: communityCategorySchema,
  visibility: z.enum(['COLLEGE_ONLY', 'PUBLIC']),
  status: communityContentStatusSchema,
  moderationNote: z.string().nullable(),
  college: collegeRefSchema,
  author: moderatedMemberSchema,
  commentCount: z.number().int(),
  openReports: z.number().int(),
  createdAt: z.string(),
});
export type AdminCommunityPost = z.infer<typeof adminCommunityPostSchema>;

export const adminListCommunityPostsQuerySchema = paginationQuerySchema.extend({
  status: communityContentStatusSchema.optional(),
  collegeId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  /** Only posts with open reports. */
  reported: z.literal('true').optional(),
});
export type AdminListCommunityPostsQuery = z.output<typeof adminListCommunityPostsQuerySchema>;

// ── Marketplace moderation ───────────────────────────────────────────────────────────────────────

export const adminListingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  price: z.number().int(),
  status: listingStatusSchema,
  moderationNote: z.string().nullable(),
  college: collegeRefSchema,
  seller: moderatedMemberSchema,
  coverImageUrl: z.string().nullable(),
  openReports: z.number().int(),
  createdAt: z.string(),
});
export type AdminListing = z.infer<typeof adminListingSchema>;

export const adminListListingsQuerySchema = paginationQuerySchema.extend({
  status: listingStatusSchema.optional(),
  collegeId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  reported: z.literal('true').optional(),
});
export type AdminListListingsQuery = z.output<typeof adminListListingsQuerySchema>;

/** Hide or remove: the reason is required, the author sees it. */
export const moderationReasonSchema = z.strictObject({
  reason: singleLineField('Reason', 500).meta({ example: 'Selling a prohibited item' }),
});
export type ModerationReason = z.output<typeof moderationReasonSchema>;

/** Restore: an optional note for the audit log. */
export const moderationNoteSchema = z
  .strictObject({ reason: singleLineField('Reason', 500).optional() })
  .optional();
export type ModerationNote = z.output<typeof moderationNoteSchema>;
