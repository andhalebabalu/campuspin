import { z } from 'zod';
import { emailSchema } from './auth.js';
import { verificationStatusSchema } from './colleges.js';
import { paginationQuerySchema } from './pagination.js';
import { placeStatusSchema } from './places.js';
import { publicReviewSchema, reviewPlaceSummarySchema } from './reviews.js';
import { submissionStatusSchema } from './submissions.js';
import { httpUrlField, multiLineField, phoneSchema, singleLineField, uuidSchema } from './text.js';

/**
 * Business owners (Phase 10): the owner's dashboard (`/business/*`), student enquiries ("leads")
 * and image uploads. A business owner signs up with `accountType: 'BUSINESS'`, which creates their
 * business profile; their listings go through the same staff review as a student's suggestion.
 */

// ── Uploads ──────────────────────────────────────────────────────────────────────────────────────

/** 5 MB: a phone photo fits comfortably; anything bigger should be resized first. */
export const UPLOAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Checked against the file's actual bytes, not the name or the declared type. */
export const UPLOAD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadImageType = (typeof UPLOAD_IMAGE_TYPES)[number];

/** `POST /uploads/images` (multipart, field `file`). `url` goes straight into an `imageUrl` field. */
export const uploadedImageSchema = z.object({
  url: z.string(),
  contentType: z.enum(UPLOAD_IMAGE_TYPES),
  sizeBytes: z.number().int().min(1),
});
export type UploadedImage = z.infer<typeof uploadedImageSchema>;

// ── Enquiries (leads) ────────────────────────────────────────────────────────────────────────────

// Matches the Prisma `LeadStatus` enum exactly.
export const LEAD_STATUSES = ['NEW', 'SEEN', 'CONTACTED', 'CLOSED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const leadStatusSchema = z.enum(LEAD_STATUSES);

/**
 * `POST /places/:idOrSlug/enquiries`. The business sees the student's name and email with the
 * enquiry, so sending one requires explicit consent to share them.
 */
export const createLeadRequestSchema = z.strictObject({
  message: multiLineField('Message', 1000)
    .refine((value) => value.length >= 10, { message: 'Write at least 10 characters' })
    .meta({ example: 'Is a double-sharing room available from July? What is the deposit?' }),
  contactPhone: phoneSchema.optional(),
  consent: z.literal(true, {
    error: 'Tick the box to share your name, email and phone with this business',
  }),
});
export type CreateLeadRequest = z.output<typeof createLeadRequestSchema>;

/** What the student gets back after sending an enquiry. */
export const leadReceiptSchema = z.object({
  id: z.string(),
  place: reviewPlaceSummarySchema,
  status: leadStatusSchema,
  createdAt: z.string(),
});
export type LeadReceipt = z.infer<typeof leadReceiptSchema>;

/** One enquiry as the receiving business sees it. */
export const businessLeadSchema = z.object({
  id: z.string(),
  place: reviewPlaceSummarySchema,
  student: z.object({ name: z.string(), email: z.string() }),
  message: z.string(),
  contactPhone: z.string().nullable(),
  status: leadStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BusinessLead = z.infer<typeof businessLeadSchema>;

export const listBusinessLeadsQuerySchema = paginationQuerySchema.extend({
  status: leadStatusSchema.optional(),
  placeId: uuidSchema.optional(),
});
export type ListBusinessLeadsQuery = z.output<typeof listBusinessLeadsQuerySchema>;

export const updateLeadRequestSchema = z.strictObject({ status: leadStatusSchema });
export type UpdateLeadRequest = z.output<typeof updateLeadRequestSchema>;

// ── Business profile ─────────────────────────────────────────────────────────────────────────────

export const businessProfileSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  verificationStatus: verificationStatusSchema,
  createdAt: z.string(),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

/** `PATCH /business/profile`. Send only what changes; `null` clears an optional field. */
export const updateBusinessProfileRequestSchema = z
  .strictObject({
    businessName: singleLineField('Business name', 200),
    description: multiLineField('Description', 2000).nullable(),
    phone: phoneSchema.nullable(),
    email: emailSchema.nullable(),
    website: httpUrlField(500).nullable(),
    logoUrl: httpUrlField(1000).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdateBusinessProfileRequest = z.output<typeof updateBusinessProfileRequestSchema>;

// ── Dashboard ────────────────────────────────────────────────────────────────────────────────────

/** `GET /business/dashboard`: the profile plus the numbers on the dashboard's overview. */
export const businessDashboardSchema = z.object({
  profile: businessProfileSchema,
  stats: z.object({
    listings: z.object({
      total: z.number().int(),
      live: z.number().int(),
      underReview: z.number().int(),
      rejected: z.number().int(),
    }),
    enquiries: z.object({ total: z.number().int(), new: z.number().int() }),
    reviews: z.object({
      count: z.number().int(),
      /** Across all live listings, weighted by review count; 0 when there are none. */
      averageRating: z.number().min(0).max(5),
    }),
  }),
});
export type BusinessDashboard = z.infer<typeof businessDashboardSchema>;

/** One of the business's own places, whatever its status (unlike public place lists). */
export const businessListingSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  status: placeStatusSchema,
  coverImageUrl: z.string().nullable(),
  primaryCategory: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
  ratingAverage: z.number().min(0).max(5),
  ratingCount: z.number().int(),
  enquiryCount: z.number().int(),
  newEnquiryCount: z.number().int(),
  /** The staff review of this listing, when it was created through one. */
  review: z.object({ status: submissionStatusSchema, note: z.string().nullable() }).nullable(),
  createdAt: z.string(),
});
export type BusinessListing = z.infer<typeof businessListingSchema>;

/** A published review of one of the business's places. */
export const businessReviewSchema = publicReviewSchema.extend({ place: reviewPlaceSummarySchema });
export type BusinessReview = z.infer<typeof businessReviewSchema>;

export const listBusinessReviewsQuerySchema = paginationQuerySchema.extend({
  placeId: uuidSchema.optional(),
});
export type ListBusinessReviewsQuery = z.output<typeof listBusinessReviewsQuerySchema>;
