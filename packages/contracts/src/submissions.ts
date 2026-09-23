import { z } from 'zod';
import { priceUnitSchema } from './categories.js';
import { paginationQuerySchema } from './pagination.js';
import { httpUrlField, multiLineField, singleLineField, uuidSchema } from './text.js';

/**
 * Student submissions: "suggest a new place" (`POST /place-submissions`), the duplicate-detection
 * check that runs before it, and staff review. This is a deliberately narrower slice of the
 * original design ([02 §5.7](../../docs/02-architecture.md#57-suggest-a-place-duplicates-contributions)):
 * no "request changes" / resubmission loop (the schema's `SubmissionStatus` has no such state), no
 * `app_settings`-driven thresholds (there is no settings table; the thresholds below are constants),
 * no city lookup table (a geo bounding box replaces "same city_id"), no Devanagari transliteration
 * or IDF-weighted token scoring (Jaro-Winkler alone), and no contributions / merge-to-contribution
 * (`PlaceContribution` is untouched — a later phase). See
 * [02 §5.7 "Implemented in Phase 8"](../../docs/02-architecture.md#57-suggest-a-place-duplicates-contributions)
 * for the full list of simplifications.
 */

// Matches the Prisma `SubmissionStatus` enum exactly (Phase 2 migration).
export const SUBMISSION_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'DUPLICATE',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);

export const ADMIN_SUBMISSION_SORTS = ['newest', 'oldest'] as const;

export const MAX_SUBMISSION_IMAGES = 10;

/** How strongly a candidate resembles the place being suggested. `none`-level candidates are dropped. */
export const DUPLICATE_LEVELS = ['suggest', 'block'] as const;
export type DuplicateLevel = (typeof DUPLICATE_LEVELS)[number];
export const duplicateLevelSchema = z.enum(DUPLICATE_LEVELS);

/**
 * Score thresholds (composite 0-1). `BLOCK` means the caller must explicitly confirm this is a
 * different place (`confirmDifferent: true`) or the submission is refused with `409
 * DUPLICATE_PLACE_SUSPECTED`; `SUGGEST` means the top candidates are shown as a soft prompt but the
 * submission proceeds either way. Plain constants: no `app_settings` table exists to make these
 * admin-configurable in this phase.
 */
export const DUPLICATE_THRESHOLDS = { block: 0.85, suggest: 0.6 } as const;

const latitude = z.number().min(-90).max(90).meta({ example: 19.098 });
const longitude = z.number().min(-180).max(180).meta({ example: 74.75 });

const isNullIsland = (lat: number | undefined, lng: number | undefined): boolean =>
  lat === 0 && lng === 0;
const NULL_ISLAND_MESSAGE = 'Coordinates 0, 0 are not a real location';

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\-.\s]{6,20}$/, 'Enter a valid phone number')
  .meta({ example: '+91 98765 43210' });

// ── Duplicate check ──────────────────────────────────────────────────────────────────────────────

/**
 * `POST /places/duplicate-check`. Client-triggered (as-you-type, once the student has picked a
 * category and a map point), and run again server-side on `POST /place-submissions` — the server
 * check is authoritative; the client one is only a head start.
 */
export const duplicateCheckRequestSchema = z
  .strictObject({
    name: singleLineField('Name', 200).meta({ example: 'Sample Mess' }),
    categoryId: uuidSchema,
    latitude,
    longitude,
    address: singleLineField('Address', 500).optional(),
    phone: phoneSchema.optional(),
  })
  .check((ctx) => {
    if (isNullIsland(ctx.value.latitude, ctx.value.longitude)) {
      ctx.issues.push({
        code: 'custom',
        message: NULL_ISLAND_MESSAGE,
        input: ctx.value,
        path: ['latitude'],
      });
    }
  });
export type DuplicateCheckRequest = z.output<typeof duplicateCheckRequestSchema>;

export const duplicateCandidateSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  slug: z.string(),
  distanceMeters: z.number().int().min(0),
  /** Composite score, 0-1. */
  score: z.number().min(0).max(1),
  level: duplicateLevelSchema,
  /** Human-readable, e.g. `["Similar name", "40 m away", "Same category"]`. */
  reasons: z.array(z.string()),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const duplicateCheckResponseSchema = z.object({
  candidates: z.array(duplicateCandidateSchema),
});
export type DuplicateCheckResponse = z.infer<typeof duplicateCheckResponseSchema>;

// ── Creating a submission ───────────────────────────────────────────────────────────────────────

export const submissionImageInputSchema = z.strictObject({
  imageUrl: httpUrlField(1000).meta({ example: 'https://cdn.example.com/mess-hall.jpg' }),
  altText: singleLineField('Alt text', 200).nullable().optional().meta({ example: 'Dining hall' }),
});
export type SubmissionImageInput = z.output<typeof submissionImageInputSchema>;

/**
 * `POST /place-submissions`. A single price point (not the full `priceOptions` array a staff-created
 * place has) and a single category: a submission is a lightweight initial suggestion, not a fully
 * specified place. `confirmDifferent: true` is required only when the server-side duplicate check
 * comes back at or above the `block` threshold; otherwise it is ignored.
 */
export const createSubmissionRequestSchema = z
  .strictObject({
    name: singleLineField('Name', 200).meta({ example: 'Sample Mess' }),
    categoryId: uuidSchema,
    /** The college page the student was browsing. Context only; does not gate anything. */
    collegeId: uuidSchema.optional(),
    address: singleLineField('Address', 500).meta({ example: 'Station Road, Ahilyanagar' }),
    city: singleLineField('City', 100).optional().meta({ example: 'Ahilyanagar' }),
    latitude,
    longitude,
    phone: phoneSchema.optional(),
    priceAmount: z.number().int().min(0).max(10_000_000).optional().meta({ example: 3000 }),
    priceUnit: priceUnitSchema.optional(),
    description: multiLineField('Description', 2000).optional(),
    images: z.array(submissionImageInputSchema).max(MAX_SUBMISSION_IMAGES).default([]),
    confirmDifferent: z.boolean().default(false),
  })
  .check((ctx) => {
    const { latitude: lat, longitude: lng, priceAmount, priceUnit } = ctx.value;
    if (isNullIsland(lat, lng)) {
      ctx.issues.push({
        code: 'custom',
        message: NULL_ISLAND_MESSAGE,
        input: ctx.value,
        path: ['latitude'],
      });
    } else if ((priceAmount === undefined) !== (priceUnit === undefined)) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send priceAmount and priceUnit together',
        input: ctx.value,
        path: [priceAmount === undefined ? 'priceAmount' : 'priceUnit'],
      });
    }
  });
export type CreateSubmissionRequest = z.output<typeof createSubmissionRequestSchema>;

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────

export const submissionImageSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type SubmissionImage = z.infer<typeof submissionImageSchema>;

export const submissionCategorySummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type SubmissionCategorySummary = z.infer<typeof submissionCategorySummarySchema>;

/**
 * One submission. The same shape for the submitter's own view and staff review — a submission has
 * no heavy nested collections the way a place does, so there is no separate "list item" shape.
 */
export const placeSubmissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: submissionCategorySummarySchema,
  collegeId: z.string().nullable(),
  address: z.string(),
  city: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  phone: z.string().nullable(),
  priceAmount: z.number().int().nullable(),
  priceUnit: priceUnitSchema.nullable(),
  description: z.string().nullable(),
  status: submissionStatusSchema,
  submittedById: z.string(),
  reviewedById: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  resultingPlaceId: z.string().nullable(),
  duplicateOfPlaceId: z.string().nullable(),
  duplicateCandidates: z.array(duplicateCandidateSchema),
  images: z.array(submissionImageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaceSubmission = z.infer<typeof placeSubmissionSchema>;

export const adminListSubmissionsQuerySchema = paginationQuerySchema.extend({
  status: submissionStatusSchema.optional(),
  sort: z.enum(ADMIN_SUBMISSION_SORTS).default('newest'),
});
export type AdminListSubmissionsQuery = z.output<typeof adminListSubmissionsQuerySchema>;

// ── Staff review ─────────────────────────────────────────────────────────────────────────────────

/** `POST /admin/submissions/:id/approve`. Publishes the pending place that was created at submit time. */
export const approveSubmissionRequestSchema = z
  .strictObject({
    reason: singleLineField('Reason', 500).optional().meta({ example: 'Looks accurate' }),
  })
  .optional();
export type ApproveSubmissionRequest = z.output<typeof approveSubmissionRequestSchema>;

/** `POST /admin/submissions/:id/reject`. A reason is required: it is the student's only feedback. */
export const rejectSubmissionRequestSchema = z.strictObject({
  reason: singleLineField('Reason', 500).meta({ example: 'Could not verify this place exists' }),
});
export type RejectSubmissionRequest = z.output<typeof rejectSubmissionRequestSchema>;

/** `POST /admin/submissions/:id/mark-duplicate`. Links to the existing place instead of publishing. */
export const markDuplicateRequestSchema = z.strictObject({
  duplicateOfPlaceId: uuidSchema,
  reason: singleLineField('Reason', 500).optional().meta({ example: 'Same place, different name' }),
});
export type MarkDuplicateRequest = z.output<typeof markDuplicateRequestSchema>;
