import { z } from 'zod';
import { adminBusinessSchema } from './admin.js';
import { emailSchema } from './auth.js';
import {
  businessListingSchema,
  businessPlanSchema,
  businessSubscriptionSchema,
  subscriptionStatusSchema,
  updateBusinessProfileRequestSchema,
} from './business.js';
import { paginationQuerySchema } from './pagination.js';
import { roleKeySchema } from './rbac.js';
import { singleLineField, uuidSchema } from './text.js';

/**
 * The CRM side of the admin panel: business decisions (reject, suspend, reinstate, edit, delete,
 * bulk), plans and subscriptions, ownership transfer, the audit log and business analytics.
 */

// ── Business decisions ───────────────────────────────────────────────────────────────────────────

/** `POST /admin/businesses/:id/reject|suspend`: the reason is required and shown to the owner. */
export const businessDecisionRequestSchema = z.strictObject({
  reason: singleLineField('Reason', 500),
});
export type BusinessDecisionRequest = z.output<typeof businessDecisionRequestSchema>;

/** `PATCH /admin/businesses/:id`: staff correcting a profile; the same fields an owner edits. */
export const adminUpdateBusinessRequestSchema = updateBusinessProfileRequestSchema;
export type AdminUpdateBusinessRequest = z.output<typeof adminUpdateBusinessRequestSchema>;

export const BULK_BUSINESS_ACTIONS = ['verify', 'suspend', 'reinstate'] as const;
export type BulkBusinessAction = (typeof BULK_BUSINESS_ACTIONS)[number];

/** `POST /admin/businesses/bulk`: one action on up to 50 businesses; suspending needs a reason. */
export const bulkBusinessActionRequestSchema = z
  .strictObject({
    ids: z.array(uuidSchema).min(1).max(50),
    action: z.enum(BULK_BUSINESS_ACTIONS),
    reason: singleLineField('Reason', 500).optional(),
  })
  .check((ctx) => {
    if (ctx.value.action === 'suspend' && !ctx.value.reason) {
      ctx.issues.push({
        code: 'custom',
        message: 'Give a reason for the suspension',
        input: ctx.value.reason,
        path: ['reason'],
      });
    }
    if (new Set(ctx.value.ids).size !== ctx.value.ids.length) {
      ctx.issues.push({
        code: 'custom',
        message: 'List each business once',
        input: ctx.value.ids,
        path: ['ids'],
      });
    }
  });
export type BulkBusinessActionRequest = z.output<typeof bulkBusinessActionRequestSchema>;

/** What happened to each business of a bulk action; skipped ones say why. */
export const bulkBusinessResultSchema = z.object({
  done: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
});
export type BulkBusinessResult = z.infer<typeof bulkBusinessResultSchema>;

/** `POST /admin/businesses/:id/subscription`: put a business on a plan (no payment involved). */
export const assignSubscriptionRequestSchema = z.strictObject({
  planKey: z.string().trim().min(1).max(40),
  /** Optional last day (YYYY-MM-DD); omitted = until changed. */
  endsAt: z.iso.date().optional(),
  note: singleLineField('Note', 500).optional(),
});
export type AssignSubscriptionRequest = z.output<typeof assignSubscriptionRequestSchema>;

/**
 * `POST /admin/businesses/:id/transfer`: hand a business to another account (a new owner, or a
 * business that was run from the wrong account). The new owner must be a business account, never
 * a student or staff account.
 */
export const transferBusinessRequestSchema = z.strictObject({
  ownerEmail: emailSchema,
  reason: singleLineField('Reason', 500),
});
export type TransferBusinessRequest = z.output<typeof transferBusinessRequestSchema>;

// ── Business detail ──────────────────────────────────────────────────────────────────────────────

export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actor: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** `GET /admin/businesses/:id`: everything staff need to decide about one business. */
export const adminBusinessDetailSchema = adminBusinessSchema.extend({
  description: z.string().nullable(),
  whatsapp: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  owner: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    lastActiveAt: z.string().nullable(),
    roles: z.array(roleKeySchema),
    status: z.string(),
    createdAt: z.string(),
  }),
  listings: z.array(businessListingSchema),
  reviews: z.object({ count: z.number().int(), averageRating: z.number() }),
  /** Open member reports about its places or their reviews. */
  openReports: z.number().int(),
  subscription: businessSubscriptionSchema,
  subscriptionHistory: z.array(
    z.object({
      plan: z.object({ key: z.string(), name: z.string() }),
      status: subscriptionStatusSchema,
      startedAt: z.string(),
      endsAt: z.string().nullable(),
      endedAt: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  /** Page events of the last 30 days. */
  analytics: z.object({ pageViews: z.number().int(), actions: z.number().int() }),
  /** Its audit trail (verification, suspension, edits, its places), newest first, up to 50. */
  history: z.array(auditEntrySchema),
  /** Deleting is only allowed while nothing depends on it (no places, orders, reviews...). */
  deletable: z.boolean(),
  deleteBlockedBecause: z.string().nullable(),
});
export type AdminBusinessDetail = z.infer<typeof adminBusinessDetailSchema>;

// ── Plans and subscriptions ──────────────────────────────────────────────────────────────────────

export const adminPlanSchema = businessPlanSchema.extend({
  /** Businesses currently on it by assignment (the default plan also covers everyone else). */
  activeSubscriptions: z.number().int(),
});
export type AdminPlan = z.infer<typeof adminPlanSchema>;

export const adminSubscriptionSchema = z.object({
  id: z.string(),
  business: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  plan: z.object({ key: z.string(), name: z.string() }),
  status: subscriptionStatusSchema,
  startedAt: z.string(),
  endsAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  note: z.string().nullable(),
  assignedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type AdminSubscription = z.infer<typeof adminSubscriptionSchema>;

export const adminListSubscriptionsQuerySchema = paginationQuerySchema.extend({
  status: subscriptionStatusSchema.optional(),
  planKey: z.string().trim().max(40).optional(),
});
export type AdminListSubscriptionsQuery = z.output<typeof adminListSubscriptionsQuerySchema>;

// ── Audit log ────────────────────────────────────────────────────────────────────────────────────

export const adminListAuditQuerySchema = paginationQuerySchema.extend({
  /** Exact action, e.g. BUSINESS_SUSPENDED. */
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(36).optional(),
  /** Part of the actor's name or email. */
  actor: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AdminListAuditQuery = z.output<typeof adminListAuditQuerySchema>;

// ── Ownership check ──────────────────────────────────────────────────────────────────────────────

export const OWNERSHIP_PROBLEMS = ['OWNER_IS_STUDENT', 'OWNER_IS_STAFF', 'OWNER_NOT_BUSINESS'] as const;

/**
 * `GET /admin/businesses/ownership-check`: businesses whose owner is not a plain business account
 * (a student, a staff member, or an account without the business role). Empty = nothing to fix.
 */
export const ownershipIssueSchema = z.object({
  business: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  owner: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    roles: z.array(roleKeySchema),
  }),
  problem: z.enum(OWNERSHIP_PROBLEMS),
});
export type OwnershipIssue = z.infer<typeof ownershipIssueSchema>;

// ── Business analytics (platform-wide) ───────────────────────────────────────────────────────────

export const adminBusinessAnalyticsQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('30').transform(Number),
});
export type AdminBusinessAnalyticsQuery = z.output<typeof adminBusinessAnalyticsQuerySchema>;

export const adminBusinessAnalyticsSchema = z.object({
  days: z.number().int(),
  totals: z.object({
    pageViews: z.number().int(),
    calls: z.number().int(),
    whatsapp: z.number().int(),
    directions: z.number().int(),
    shares: z.number().int(),
  }),
  daily: z.array(
    z.object({ day: z.string(), pageViews: z.number().int(), actions: z.number().int() }),
  ),
  /** The most visited business pages in the period (up to 10). */
  top: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      pageViews: z.number().int(),
      actions: z.number().int(),
    }),
  ),
  /** Businesses by category (every status). */
  byCategory: z.array(z.object({ name: z.string(), count: z.number().int() })),
});
export type AdminBusinessAnalytics = z.infer<typeof adminBusinessAnalyticsSchema>;
