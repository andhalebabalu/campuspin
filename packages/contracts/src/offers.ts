import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { multiLineField, singleLineField, uuidSchema } from './text.js';

/**
 * Student offers ("10% off for CampusPin students") and their redemption. Discounts are always
 * worked out by the server; how often a student may use an offer is enforced by the database.
 */

export const DISCOUNT_TYPES = ['PERCENT', 'FLAT', 'FREEBIE'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const OFFER_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'REMOVED'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const LIMIT_PERIODS = ['ONCE', 'DAILY'] as const;
export type LimitPeriod = (typeof LIMIT_PERIODS)[number];

/** Monday first, matching the `daysOfWeek` bits (bit 0 = Monday). */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const EVERY_DAY = 127;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .meta({ example: '2026-10-01' });

/** "10% off", "₹50 off", "Free gift". */
export function offerHeadline(offer: {
  discountType: DiscountType;
  discountValue: number;
}): string {
  if (offer.discountType === 'PERCENT') return `${offer.discountValue}% OFF`;
  if (offer.discountType === 'FLAT') return `₹${offer.discountValue} OFF`;
  return 'FREE';
}

export const studentOfferSchema = z.object({
  id: z.string(),
  place: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  title: z.string(),
  description: z.string().nullable(),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.number().int(),
  maxDiscount: z.number().int().nullable(),
  minOrderAmount: z.number().int().nullable(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
  daysOfWeek: z.number().int(),
  limitPerStudent: z.number().int(),
  limitPeriod: z.enum(LIMIT_PERIODS),
  terms: z.string().nullable(),
  /** Usable right now (live, in date, on today's weekday, not used up). */
  availableToday: z.boolean(),
  /** Straight-line metres from `lat`/`lng`, when given. */
  distanceMeters: z.number().int().nullable(),
});
export type StudentOffer = z.infer<typeof studentOfferSchema>;

export const ownerOfferSchema = studentOfferSchema.extend({
  status: z.enum(OFFER_STATUSES),
  totalLimit: z.number().int().nullable(),
  redeemedCount: z.number().int(),
  removedReason: z.string().nullable(),
  createdAt: z.string(),
});
export type OwnerOffer = z.infer<typeof ownerOfferSchema>;

const offerFields = {
  title: singleLineField('Title', 80),
  description: multiLineField('Description', 500).nullable().optional(),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.number().int().min(0).max(100_000).default(0),
  maxDiscount: z.number().int().min(1).max(100_000).nullable().optional(),
  minOrderAmount: z.number().int().min(1).max(100_000).nullable().optional(),
  validFrom: date,
  validUntil: date.nullable().optional(),
  daysOfWeek: z.number().int().min(1, 'Choose at least one day').max(EVERY_DAY).default(EVERY_DAY),
  limitPerStudent: z.number().int().min(1).max(50).default(1),
  limitPeriod: z.enum(LIMIT_PERIODS).default('ONCE'),
  totalLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  terms: multiLineField('Terms', 1000).nullable().optional(),
};

function offerChecks(
  value: Partial<{
    discountType: DiscountType;
    discountValue: number;
    validFrom: string;
    validUntil: string | null;
  }>,
  ctx: z.core.$RefinementCtx,
) {
  if (value.discountType === 'PERCENT' && (value.discountValue ?? 0) > 100) {
    ctx.addIssue({
      code: 'custom',
      message: 'A percentage is at most 100',
      path: ['discountValue'],
    });
  }
  if (
    (value.discountType === 'PERCENT' || value.discountType === 'FLAT') &&
    (value.discountValue ?? 0) < 1
  ) {
    ctx.addIssue({ code: 'custom', message: 'Give the discount', path: ['discountValue'] });
  }
  if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) {
    ctx.addIssue({ code: 'custom', message: 'Ends before it starts', path: ['validUntil'] });
  }
}

export const createOfferSchema = z
  .strictObject({ placeId: uuidSchema, ...offerFields })
  .superRefine(offerChecks);
export type CreateOfferRequest = z.output<typeof createOfferSchema>;

/** Owners may also pause or resume. The discount type cannot change once students used it. */
export const updateOfferSchema = z
  .strictObject({ ...offerFields, status: z.enum(['ACTIVE', 'PAUSED']) })
  .omit({ discountType: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdateOfferRequest = z.output<typeof updateOfferSchema>;

export const nearbyOffersQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both lat and lng, or neither',
  });
export type NearbyOffersQuery = z.output<typeof nearbyOffersQuerySchema>;

// ── Redemptions ──────────────────────────────────────────────────────────────────────────────────

export const REDEMPTION_STATUSES = ['ISSUED', 'REDEEMED', 'EXPIRED'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

/** Minutes a counter code stays valid once issued. */
export const REDEMPTION_CODE_MINUTES = 30;

export const redemptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: z.enum(REDEMPTION_STATUSES),
  offer: z.object({ id: z.string(), title: z.string(), headline: z.string() }),
  place: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  expiresAt: z.string(),
  redeemedAt: z.string().nullable(),
  discountAmount: z.number().int(),
  /** Set when the offer was applied to an order. */
  orderId: z.string().nullable(),
  createdAt: z.string(),
});
export type Redemption = z.infer<typeof redemptionSchema>;

export const businessRedemptionSchema = redemptionSchema.extend({
  student: z.object({ name: z.string() }),
});
export type BusinessRedemption = z.infer<typeof businessRedemptionSchema>;

/** A counter code: 6 characters, no 0/O/1/I. */
export const verifyRedemptionSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{6}$/, 'Codes are 6 letters and digits'),
});
export type VerifyRedemptionRequest = z.output<typeof verifyRedemptionSchema>;

export const listRedemptionsQuerySchema = paginationQuerySchema;

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

export const adminOfferSchema = ownerOfferSchema.extend({
  business: z.object({ id: z.string(), name: z.string() }),
});
export type AdminOffer = z.infer<typeof adminOfferSchema>;

export const adminListOffersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(OFFER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type AdminListOffersQuery = z.output<typeof adminListOffersQuerySchema>;
