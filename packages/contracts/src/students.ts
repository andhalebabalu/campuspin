import { z } from 'zod';
import { emailSchema } from './auth.js';
import { collegeRefSchema, studentBadgeSchema } from './members.js';
import { paginationQuerySchema } from './pagination.js';
import { httpUrlField, singleLineField, uuidSchema } from './text.js';

/**
 * Student verification, member profile and member settings.
 *
 * College affiliation, not identity: CampusPin only needs to know "does this person study at this
 * college?". Two ways to show it: a code sent to an official college email address (its domain must
 * be listed for that college by staff), or a photo of the student ID card that staff review. The ID
 * photo lives in private storage, only staff with `verifications.review` can open it, and it is
 * deleted as soon as they decide. Nothing from it (ID number, date of birth) is stored.
 */

export const STUDENT_VERIFICATION_METHODS = ['COLLEGE_EMAIL', 'DOCUMENT'] as const;
export type StudentVerificationMethod = (typeof STUDENT_VERIFICATION_METHODS)[number];
export const studentVerificationMethodSchema = z.enum(STUDENT_VERIFICATION_METHODS);

export const STUDENT_VERIFICATION_STATUSES = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
] as const;
export type StudentVerificationStatus = (typeof STUDENT_VERIFICATION_STATUSES)[number];
export const studentVerificationStatusSchema = z.enum(STUDENT_VERIFICATION_STATUSES);

/** A member's standing: never verified, waiting, verified, or verified once but lapsed. */
export const STUDENT_STATES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'EXPIRED'] as const;
export type StudentState = (typeof STUDENT_STATES)[number];

export const STUDENT_CODE_LENGTH = 6;
export const STUDENT_CODE_MAX_ATTEMPTS = 5;

// ── The student's own view ──────────────────────────────────────────────────────────────────────

export const studentStatusSchema = z.object({
  state: z.enum(STUDENT_STATES),
  badge: studentBadgeSchema,
  /** The open request, if any. The code itself is never returned. */
  pending: z
    .object({
      id: z.string(),
      method: studentVerificationMethodSchema,
      college: collegeRefSchema,
      /** Masked: "as***@abccollege.edu.in". */
      collegeEmail: z.string().nullable(),
      codeExpiresAt: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
  /** The last decision staff took, with the note meant for the student (why rejected, etc.). */
  lastDecision: z
    .object({
      status: studentVerificationStatusSchema,
      reviewNote: z.string().nullable(),
      decidedAt: z.string(),
    })
    .nullable(),
});
export type StudentStatus = z.infer<typeof studentStatusSchema>;

/** `POST /me/student-verification/email`: sends a code to a college address. */
export const requestEmailVerificationSchema = z.strictObject({
  collegeId: uuidSchema,
  email: emailSchema.meta({ example: 'asha.k@abccollege.edu.in' }),
});
export type RequestEmailVerification = z.output<typeof requestEmailVerificationSchema>;

/** `POST /me/student-verification/email/confirm`. */
export const confirmEmailVerificationSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${STUDENT_CODE_LENGTH}}$`),
      `Enter the ${STUDENT_CODE_LENGTH}-digit code`,
    ),
});
export type ConfirmEmailVerification = z.output<typeof confirmEmailVerificationSchema>;

/** `POST /me/student-verification/document`: multipart `collegeId` + `file` (an ID card photo). */
export const documentVerificationFieldsSchema = z.strictObject({ collegeId: uuidSchema });

// ── Staff review ────────────────────────────────────────────────────────────────────────────────

export const adminStudentVerificationSchema = z.object({
  id: z.string(),
  status: studentVerificationStatusSchema,
  method: studentVerificationMethodSchema,
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  college: collegeRefSchema,
  collegeEmail: z.string().nullable(),
  /** True while the ID photo is still stored (until a decision). */
  hasDocument: z.boolean(),
  documentType: z.string().nullable(),
  reviewNote: z.string().nullable(),
  reviewedById: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminStudentVerification = z.infer<typeof adminStudentVerificationSchema>;

export const adminListStudentVerificationsQuerySchema = paginationQuerySchema.extend({
  status: studentVerificationStatusSchema.optional(),
  method: studentVerificationMethodSchema.optional(),
  collegeId: uuidSchema.optional(),
});
export type AdminListStudentVerificationsQuery = z.output<
  typeof adminListStudentVerificationsQuerySchema
>;

const noteField = singleLineField('Reason', 500);

export const approveStudentVerificationSchema = z
  .strictObject({ reason: noteField.optional() })
  .optional();
export type ApproveStudentVerification = z.output<typeof approveStudentVerificationSchema>;

/** Reject or ask to verify again: the reason is required, it is the student's only feedback. */
export const decideStudentVerificationSchema = z.strictObject({
  reason: noteField.meta({ example: 'The photo is too blurry to read the college name.' }),
});
export type DecideStudentVerification = z.output<typeof decideStudentVerificationSchema>;

/** A domain like `abccollege.edu.in`: lowercase letters, digits, hyphens and dots, no "@". */
export const collegeEmailDomainInputSchema = z.strictObject({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(
      /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      'Enter a domain such as abccollege.edu.in',
    ),
});
export type CollegeEmailDomainInput = z.output<typeof collegeEmailDomainInputSchema>;

export const collegeEmailDomainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  createdAt: z.string(),
});
export type CollegeEmailDomain = z.infer<typeof collegeEmailDomainSchema>;

// ── Profile and settings ────────────────────────────────────────────────────────────────────────

export const PROFILE_VISIBILITIES = ['PUBLIC', 'STUDENTS', 'PRIVATE'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];
export const profileVisibilitySchema = z.enum(PROFILE_VISIBILITIES);

export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /** Profile photo, or null. */
  avatarUrl: z.string().nullable(),
  /** The college chosen for browsing. Grants nothing; see `student` for the verified one. */
  college: collegeRefSchema.nullable(),
  course: z.string().nullable(),
  year: z.number().int().nullable(),
  student: studentBadgeSchema,
  memberSince: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

/** `PATCH /me/profile`. `null` clears a field. Changing `collegeId` never changes the verified college. */
export const updateProfileSchema = z
  .strictObject({
    name: singleLineField('Name', 120).optional(),
    /** A square photo uploaded first (POST /uploads/images); null removes it. */
    avatarUrl: httpUrlField(500).nullable().optional(),
    collegeId: uuidSchema.nullable().optional(),
    course: singleLineField('Course', 120).nullable().optional(),
    year: z.number().int().min(1).max(8).nullable().optional(),
  })
  .check((ctx) => {
    if (Object.keys(ctx.value).length === 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send at least one field',
        input: ctx.value,
        path: [],
      });
    }
  });
export type UpdateProfile = z.output<typeof updateProfileSchema>;

export const settingsSchema = z.object({
  profileVisibility: profileVisibilitySchema,
  showCommunityActivity: z.boolean(),
  allowMarketplaceMessages: z.boolean(),
  notifyCommunity: z.boolean(),
  notifyMarketplace: z.boolean(),
  notifyEvents: z.boolean(),
  notifyJobs: z.boolean(),
  notifyMessages: z.boolean(),
  /** Menus and offers from places the member saved. */
  notifyPlaceUpdates: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = settingsSchema.partial().strict();
export type UpdateSettings = z.output<typeof updateSettingsSchema>;

// ── Notifications ───────────────────────────────────────────────────────────────────────────────

/** Which preference switch governs a notification. `ACCOUNT` ones (verification) always send. */
export const NOTIFICATION_CATEGORIES = [
  'ACCOUNT',
  'COMMUNITY',
  'MARKETPLACE',
  'EVENTS',
  'JOBS',
  'MESSAGES',
  // Menus and offers from saved places (switch: notifyPlaceUpdates).
  'PLACE_UPDATES',
  // Orders, bookings and requests: transactional, always sent like ACCOUNT.
  'ORDERS',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  /** Where to go: an app path such as `/community/posts/<id>`. */
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: z
    .literal('true')
    .optional()
    .transform((value) => value === 'true'),
});
export type ListNotificationsQuery = z.output<typeof listNotificationsQuerySchema>;

export const unreadCountSchema = z.object({ unread: z.number().int().min(0) });
