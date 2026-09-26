import { z } from 'zod';
import { multiLineField, uuidSchema } from './text.js';

// ── Reports ──────────────────────────────────────────────────────────────────────────────────────

// Matches the Prisma `ReportReason` enum (the reasons a member can pick depend on what they report).
export const REPORT_REASONS = [
  'WRONG_INFO',
  'SCAM',
  'PROHIBITED_ITEM',
  'HARASSMENT',
  'BUSINESS_CLOSED',
  'WRONG_LOCATION',
  'FAKE_LISTING',
  'WRONG_PRICE',
  'SPAM',
  'INAPPROPRIATE',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGET_TYPES = [
  'PLACE',
  'REVIEW',
  'USER',
  'MARKETPLACE_LISTING',
  'COMMUNITY_POST',
  'COMMUNITY_COMMENT',
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_STATUSES = ['PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Community posts, comments and members. */
export const COMMUNITY_REPORT_REASONS = [
  'SPAM',
  'HARASSMENT',
  'INAPPROPRIATE',
  'WRONG_INFO',
  'OTHER',
] as const satisfies readonly ReportReason[];

/** Marketplace listings and conversations. */
export const MARKETPLACE_REPORT_REASONS = [
  'SCAM',
  'FAKE_LISTING',
  'PROHIBITED_ITEM',
  'SPAM',
  'HARASSMENT',
  'WRONG_INFO',
  'OTHER',
] as const satisfies readonly ReportReason[];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  WRONG_INFO: 'Wrong information',
  SCAM: 'Scam or fraud',
  PROHIBITED_ITEM: 'Prohibited item',
  HARASSMENT: 'Harassment',
  BUSINESS_CLOSED: 'Business closed',
  WRONG_LOCATION: 'Wrong location',
  FAKE_LISTING: 'Fake listing',
  WRONG_PRICE: 'Wrong price',
  SPAM: 'Spam',
  INAPPROPRIATE: 'Inappropriate',
  OTHER: 'Something else',
};

const reportDetails = multiLineField('Details', 1000);

export function reportRequestSchema<const T extends readonly [ReportReason, ...ReportReason[]]>(
  reasons: T,
) {
  return z.strictObject({
    reason: z.enum(reasons),
    description: reportDetails.optional(),
  });
}
export const communityReportRequestSchema = reportRequestSchema(COMMUNITY_REPORT_REASONS);
export type CommunityReportRequest = z.output<typeof communityReportRequestSchema>;
export const marketplaceReportRequestSchema = reportRequestSchema(MARKETPLACE_REPORT_REASONS);
export type MarketplaceReportRequest = z.output<typeof marketplaceReportRequestSchema>;

/** What a member gets back after reporting: only that it was received. */
export const reportReceiptSchema = z.object({ id: z.string(), status: z.enum(REPORT_STATUSES) });
export type ReportReceipt = z.infer<typeof reportReceiptSchema>;

// ── Blocks ───────────────────────────────────────────────────────────────────────────────────────

export const blockRequestSchema = z.strictObject({ userId: uuidSchema });
export type BlockRequest = z.output<typeof blockRequestSchema>;

/** A member I blocked, as I see them in my list. */
export const blockedMemberSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  blockedAt: z.string(),
});
export type BlockedMember = z.infer<typeof blockedMemberSchema>;
