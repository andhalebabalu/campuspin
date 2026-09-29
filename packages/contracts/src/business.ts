import { z } from 'zod';
import { emailSchema } from './auth.js';
import { verificationStatusSchema } from './colleges.js';
import { paginationQuerySchema } from './pagination.js';
import { placeDetailSchema, placeStatusSchema } from './places.js';
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

// Matches the Prisma `BusinessStatus` enum exactly.
export const BUSINESS_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];
export const businessStatusSchema = z.enum(BUSINESS_STATUSES);

/**
 * Words a business slug can never be, because `/business/<word>` is an app page (the dashboard,
 * sign-in...). The public page lives at `/business/<slug>`.
 */
export const RESERVED_BUSINESS_SLUGS = [
  'dashboard',
  'login',
  'register',
  'profile',
  'preview',
  'settings',
  'new',
  'edit',
  'admin',
  'api',
] as const;

export const businessCategoryRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export const businessProfileSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  category: businessCategoryRefSchema.nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  status: businessStatusSchema,
  verificationStatus: verificationStatusSchema,
  /** Why staff rejected or suspended the business; null otherwise. */
  statusReason: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  /** True when `/business/<slug>` is visible to everyone (see the public page rules). */
  isPublic: z.boolean(),
  createdAt: z.string(),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

/** `PATCH /business/profile`. Send only what changes; `null` clears an optional field. */
export const updateBusinessProfileRequestSchema = z
  .strictObject({
    businessName: singleLineField('Business name', 200),
    description: multiLineField('Description', 2000).nullable(),
    categoryId: uuidSchema,
    city: singleLineField('City', 100),
    phone: phoneSchema.nullable(),
    whatsapp: phoneSchema.nullable(),
    email: emailSchema.nullable(),
    website: httpUrlField(500).nullable(),
    instagramUrl: httpUrlField(500)
      .refine((value) => /^https:\/\/(www\.)?instagram\.com\//i.test(value), {
        message: 'Use your instagram.com link',
      })
      .nullable(),
    facebookUrl: httpUrlField(500)
      .refine((value) => /^https:\/\/(www\.|m\.)?(facebook|fb)\.com\//i.test(value), {
        message: 'Use your facebook.com link',
      })
      .nullable(),
    logoUrl: httpUrlField(1000).nullable(),
    coverUrl: httpUrlField(1000).nullable(),
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

// ── Public business page ─────────────────────────────────────────────────────────────────────────

/** A live place of the business, as a branch card on its public page. */
export const businessBranchSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  coverImageUrl: z.string().nullable(),
  primaryCategory: businessCategoryRefSchema.nullable(),
  ratingAverage: z.number().min(0).max(5),
  ratingCount: z.number().int(),
});
export type BusinessBranch = z.infer<typeof businessBranchSchema>;

/**
 * `GET /businesses/:slug`: what everyone may see about a business. Only businesses whose page is
 * live (active, not rejected, at least one approved listing) answer; anything else is a 404. Never
 * carries the owner's name, account email or any id beyond the places'.
 */
export const publicBusinessSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: businessCategoryRefSchema.nullable(),
  city: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  facebookUrl: z.string().nullable(),
  /** Staff have verified this business. */
  verified: z.boolean(),
  /** Across its live places, weighted by review count; 0 when there are none. */
  ratingAverage: z.number().min(0).max(5),
  ratingCount: z.number().int(),
  /** Live places, the most reviewed first. The first is the page's main place. */
  branches: z.array(businessBranchSchema).min(1),
});
export type PublicBusiness = z.infer<typeof publicBusinessSchema>;

// ── Page analytics ───────────────────────────────────────────────────────────────────────────────

/** Matches the Prisma `BusinessEventType` enum exactly. */
export const BUSINESS_EVENT_TYPES = [
  'PAGE_VIEW',
  'PHONE_CLICK',
  'WHATSAPP_CLICK',
  'DIRECTION_CLICK',
  'SHARE_CLICK',
] as const;
export type BusinessEventType = (typeof BUSINESS_EVENT_TYPES)[number];
export const businessEventTypeSchema = z.enum(BUSINESS_EVENT_TYPES);

/**
 * `POST /businesses/:slug/events`: one visit or tap on the public page. Anonymous: no user, IP or
 * device is stored, only the business, the place (when the tap was about one) and the time.
 */
export const trackBusinessEventSchema = z.strictObject({
  type: businessEventTypeSchema,
  placeId: uuidSchema.optional(),
});
export type TrackBusinessEventRequest = z.output<typeof trackBusinessEventSchema>;

export const BUSINESS_ANALYTICS_RANGES = ['7', '30', '90'] as const;

export const businessAnalyticsQuerySchema = z.object({
  days: z.enum(BUSINESS_ANALYTICS_RANGES).default('30').transform(Number),
});
export type BusinessAnalyticsQuery = z.output<typeof businessAnalyticsQuerySchema>;

const eventCountsSchema = z.object({
  PAGE_VIEW: z.number().int(),
  PHONE_CLICK: z.number().int(),
  WHATSAPP_CLICK: z.number().int(),
  DIRECTION_CLICK: z.number().int(),
  SHARE_CLICK: z.number().int(),
});

/** `GET /business/analytics?days=`: the caller's page numbers, counted from real events only. */
export const businessAnalyticsSchema = z.object({
  days: z.number().int(),
  totals: eventCountsSchema,
  /** The previous period of the same length, for "up/down vs last period". */
  previousTotals: eventCountsSchema,
  /** One row per IST day, oldest first, zero-filled. */
  daily: z.array(eventCountsSchema.extend({ day: z.string() })),
  reviews: z.object({ count: z.number().int(), inPeriod: z.number().int() }),
  enquiries: z.object({ inPeriod: z.number().int() }),
});
export type BusinessAnalytics = z.infer<typeof businessAnalyticsSchema>;

// ── The owner's own places ───────────────────────────────────────────────────────────────────────

/** `GET /business/places/:placeId`: one of the caller's places with everything they can edit. */
export const ownedPlaceSchema = placeDetailSchema.omit({ business: true, nearbyColleges: true }).extend({
  status: placeStatusSchema,
  updatedAt: z.string(),
});
export type OwnedPlace = z.infer<typeof ownedPlaceSchema>;

// ── Plans and subscriptions ──────────────────────────────────────────────────────────────────────

/**
 * A plan. Listing on CampusPin is free; paid plans are prepared but not on sale (`isAvailable`
 * false) and carry no price until one is decided: a card never shows an invented price.
 */
export const businessPlanSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  /** Whole rupees a month; null = no price yet. */
  priceMonthly: z.number().int().nullable(),
  features: z.array(z.string()),
  isAvailable: z.boolean(),
  isDefault: z.boolean(),
});
export type BusinessPlan = z.infer<typeof businessPlanSchema>;

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'CANCELLED', 'EXPIRED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

export const businessSubscriptionSchema = z.object({
  plan: businessPlanSchema,
  status: subscriptionStatusSchema,
  /** Null while on the default plan (no subscription was ever started). */
  startedAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  /** True when this is simply the default plan, not an assigned one. */
  isDefault: z.boolean(),
});
export type BusinessSubscription = z.infer<typeof businessSubscriptionSchema>;

/** `GET /business/subscription`: the caller's plan and every plan there is. */
export const mySubscriptionSchema = z.object({
  current: businessSubscriptionSchema,
  plans: z.array(businessPlanSchema),
});
export type MySubscription = z.infer<typeof mySubscriptionSchema>;
