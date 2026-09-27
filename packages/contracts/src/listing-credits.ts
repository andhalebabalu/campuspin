import { z } from 'zod';
import { singleLineField } from './text.js';

/**
 * Marketplace listing limits. Off by default: every listing is free. When a super admin switches
 * them on, each student gets `freeListings` free listings (counted as listings live at the same
 * time, or new listings per month) and after that each listing costs `creditsPerListing` credits.
 * Every student starts with `startingCredits`; staff can give or take credits per student.
 */

export const LISTING_LIMIT_MODES = ['ACTIVE', 'MONTHLY'] as const;
export type ListingLimitMode = (typeof LISTING_LIMIT_MODES)[number];
export const listingLimitModeSchema = z.enum(LISTING_LIMIT_MODES);
export const LISTING_LIMIT_MODE_LABELS: Record<ListingLimitMode, string> = {
  ACTIVE: 'Free listings live at the same time',
  MONTHLY: 'Free new listings each month',
};

export const listingLimitSettingsSchema = z.object({
  enabled: z.boolean(),
  mode: listingLimitModeSchema,
  freeListings: z.number().int().min(0).max(100),
  startingCredits: z.number().int().min(0).max(1000),
  creditsPerListing: z.number().int().min(1).max(100),
});
export type ListingLimitSettings = z.infer<typeof listingLimitSettingsSchema>;

export const DEFAULT_LISTING_LIMIT_SETTINGS: ListingLimitSettings = {
  enabled: false,
  mode: 'ACTIVE',
  freeListings: 3,
  startingCredits: 0,
  creditsPerListing: 1,
};

export const updateListingLimitSettingsSchema = listingLimitSettingsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateListingLimitSettings = z.output<typeof updateListingLimitSettingsSchema>;

/** What the next listing will cost this student, shown before they sell. */
export const listingQuotaSchema = z.object({
  enabled: z.boolean(),
  mode: listingLimitModeSchema,
  freeListings: z.number().int(),
  freeUsed: z.number().int(),
  credits: z.number().int(),
  creditsPerListing: z.number().int(),
  /** FREE: uses a free slot. CREDITS: costs `creditsPerListing`. BLOCKED: neither is left. */
  next: z.enum(['FREE', 'CREDITS', 'BLOCKED']),
  /** MONTHLY only: when the free listings come back. */
  resetsAt: z.string().nullable(),
});
export type ListingQuota = z.infer<typeof listingQuotaSchema>;

export const CREDIT_REASONS = ['ADMIN_GRANT', 'ADMIN_DEDUCT', 'LISTING'] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];
export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  ADMIN_GRANT: 'Given by CampusPin',
  ADMIN_DEDUCT: 'Removed by CampusPin',
  LISTING: 'Paid listing',
};

export const creditEntrySchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  reason: z.enum(CREDIT_REASONS),
  note: z.string().nullable(),
  listing: z.object({ id: z.string(), title: z.string() }).nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditEntry = z.infer<typeof creditEntrySchema>;

/** A student's credits as staff see them. */
export const adminMemberCreditsSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  credits: z.number().int(),
  startingCredits: z.number().int(),
  history: z.array(creditEntrySchema),
});
export type AdminMemberCredits = z.infer<typeof adminMemberCreditsSchema>;

export const adjustCreditsSchema = z.strictObject({
  /** Positive gives credits, negative takes them away. */
  amount: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0, { message: 'Enter a number other than 0' }),
  note: singleLineField('Note', 200).optional(),
});
export type AdjustCreditsRequest = z.output<typeof adjustCreditsSchema>;
