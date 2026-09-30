import { z } from 'zod';
import { verificationStatusSchema } from './colleges.js';
import { paginationQuerySchema } from './pagination.js';
import { roleKeySchema, ROLE_KEYS } from './rbac.js';
import { businessCategoryRefSchema, businessStatusSchema } from './business.js';
import { singleLineField, uuidSchema } from './text.js';

/**
 * Staff administration (Phase 11): the admin home's queue counts, user management (suspend,
 * reactivate, roles) and business verification. The other admin resources (colleges, categories,
 * places, submissions, reviews) keep their own contracts.
 */

// ── Admin home ───────────────────────────────────────────────────────────────────────────────────

/** `GET /admin/dashboard`: what is waiting for staff, plus a few platform totals. */
export const adminDashboardSchema = z.object({
  queues: z.object({
    /** Suggested places and business listings waiting for review. */
    pendingSubmissions: z.number().int(),
    /** Reviews currently hidden by a moderator (to restore or remove for good). */
    hiddenReviews: z.number().int(),
    /** Business profiles not verified yet. */
    unverifiedBusinesses: z.number().int(),
    /** Accounts currently suspended. */
    suspendedUsers: z.number().int(),
    /** ID-photo student verifications waiting for a decision. */
    pendingStudentVerifications: z.number().int(),
    /** Member reports on posts, comments, listings and members still open. */
    openReports: z.number().int(),
  }),
  totals: z.object({
    users: z.number().int(),
    students: z.number().int(),
    /** Accounts holding a current Verified Student badge. */
    verifiedStudents: z.number().int(),
    /** Marketplace listings currently up (active or reserved, not expired). */
    activeListings: z.number().int(),
    communityPostsLast7Days: z.number().int(),
    businesses: z.number().int(),
    livePlaces: z.number().int(),
    activeColleges: z.number().int(),
    reviewsLast7Days: z.number().int(),
    enquiriesLast7Days: z.number().int(),
    /** Business profiles by what staff decided (every status, not only active ones). */
    verifiedBusinesses: z.number().int(),
    pendingBusinesses: z.number().int(),
    rejectedBusinesses: z.number().int(),
    suspendedBusinesses: z.number().int(),
    communityPosts: z.number().int(),
    /** Every marketplace listing ever posted (any status). */
    marketplaceListings: z.number().int(),
    /** Published reviews. */
    reviews: z.number().int(),
  }),
  /** The last 30 India days, oldest first, zero-filled: real rows counted per day. */
  series: z.array(
    z.object({
      day: z.string(),
      studentSignups: z.number().int(),
      businessSignups: z.number().int(),
      businessVerifications: z.number().int(),
      placesPublished: z.number().int(),
      marketplaceListings: z.number().int(),
      communityPosts: z.number().int(),
    }),
  ),
});
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;

// ── Users ────────────────────────────────────────────────────────────────────────────────────────

// Matches the Prisma `UserStatus` enum exactly.
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = z.enum(USER_STATUSES);

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: userStatusSchema,
  emailVerified: z.boolean(),
  roles: z.array(roleKeySchema),
  /** The business this account owns, if any. */
  business: z.object({ id: z.string(), businessName: z.string() }).nullable(),
  lastLoginAt: z.string().nullable(),
  /** The last time the account used the web or mobile app (updated at most once a minute). */
  lastActiveAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminListUsersQuerySchema = paginationQuerySchema.extend({
  /** Matches name or email. */
  q: z.string().trim().max(100).optional(),
  role: roleKeySchema.optional(),
  /** `true`: only staff accounts (moderators, admins, super admins). */
  staff: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  status: userStatusSchema.optional(),
});
export type AdminListUsersQuery = z.output<typeof adminListUsersQuerySchema>;

/** `POST /admin/users/:id/suspend`: a reason is required (it is audited). */
export const suspendUserRequestSchema = z.strictObject({
  reason: singleLineField('Reason', 500).meta({ example: 'Repeated fake reviews' }),
});
export type SuspendUserRequest = z.output<typeof suspendUserRequestSchema>;

/** `POST /admin/users/:id/reactivate`. */
export const reactivateUserRequestSchema = z
  .strictObject({ reason: singleLineField('Reason', 500).optional() })
  .optional();
export type ReactivateUserRequest = z.output<typeof reactivateUserRequestSchema>;

/**
 * `PUT /admin/users/:id/roles` (SUPER_ADMIN only): the account's complete new set of roles. At least
 * one; nobody can change their own roles; the last SUPER_ADMIN cannot lose that role.
 */
export const updateUserRolesRequestSchema = z.strictObject({
  roles: z
    .array(roleKeySchema)
    .min(1, 'Keep at least one role')
    .max(ROLE_KEYS.length)
    .refine((roles) => new Set(roles).size === roles.length, { message: 'List each role once' })
    .meta({ example: ['STUDENT', 'MODERATOR'] }),
  reason: singleLineField('Reason', 500).optional(),
});
export type UpdateUserRolesRequest = z.output<typeof updateUserRolesRequestSchema>;

// ── Businesses ───────────────────────────────────────────────────────────────────────────────────

export const adminBusinessSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  slug: z.string(),
  owner: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    lastActiveAt: z.string().nullable(),
  }),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  category: businessCategoryRefSchema.nullable(),
  city: z.string().nullable(),
  status: businessStatusSchema,
  verificationStatus: verificationStatusSchema,
  statusReason: z.string().nullable(),
  /** Its page is live (see the public page rules). */
  isPublic: z.boolean(),
  /** The plan it is on (the default FREE when none was assigned). */
  plan: z.object({ key: z.string(), name: z.string() }),
  /** All the business's places, whatever their status. */
  listingCount: z.number().int(),
  liveListingCount: z.number().int(),
  createdAt: z.string(),
});
export type AdminBusiness = z.infer<typeof adminBusinessSchema>;

export const ADMIN_BUSINESS_SORTS = ['newest', 'oldest', 'name'] as const;

export const adminListBusinessesQuerySchema = paginationQuerySchema.extend({
  /** Matches the business name, its slug, or the owner's name or email. */
  q: z.string().trim().max(100).optional(),
  verification: verificationStatusSchema.optional(),
  status: businessStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
  city: z.string().trim().max(100).optional(),
  /** Created on or after / on or before this day (YYYY-MM-DD, India time). */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(ADMIN_BUSINESS_SORTS).default('newest'),
});
export type AdminListBusinessesQuery = z.output<typeof adminListBusinessesQuerySchema>;

/** Optional body of verify / unverify. */
export const businessActionRequestSchema = z
  .strictObject({ reason: singleLineField('Reason', 500).optional() })
  .optional();
export type BusinessActionRequest = z.output<typeof businessActionRequestSchema>;
