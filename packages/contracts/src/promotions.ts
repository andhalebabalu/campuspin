import { z } from 'zod';
import { httpUrlField, multiLineField, singleLineField } from './text.js';

/**
 * Promotions: what platform staff show inside the apps. A SPLASH promotion is a full-screen ad
 * shown when the app opens (it stays `displaySeconds`, with a close button after
 * `skipAfterSeconds`); a FEED promotion is a card in the "Featured" section of the student home
 * and the business dashboard. Either can announce a CampusPin feature or boost a business.
 */

export const PROMOTION_PLACEMENTS = ['SPLASH', 'FEED'] as const;
export type PromotionPlacement = (typeof PROMOTION_PLACEMENTS)[number];
export const promotionPlacementSchema = z.enum(PROMOTION_PLACEMENTS);
export const PROMOTION_PLACEMENT_LABELS: Record<PromotionPlacement, string> = {
  SPLASH: 'Full-screen ad on app open',
  FEED: 'Card in the Featured section',
};

/** Who sees it. Staff accounts see nothing: they have no student or business app. */
export const PROMOTION_AUDIENCES = ['ALL', 'STUDENTS', 'BUSINESSES'] as const;
export type PromotionAudience = (typeof PROMOTION_AUDIENCES)[number];
export const promotionAudienceSchema = z.enum(PROMOTION_AUDIENCES);
export const PROMOTION_AUDIENCE_LABELS: Record<PromotionAudience, string> = {
  ALL: 'Students and businesses',
  STUDENTS: 'Students only',
  BUSINESSES: 'Businesses only',
};

/** Shown as a small label on the ad, so members can tell news from paid placement. */
export const PROMOTION_KINDS = ['ANNOUNCEMENT', 'NEW_FEATURE', 'SPONSORED'] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];
export const promotionKindSchema = z.enum(PROMOTION_KINDS);
export const PROMOTION_KIND_LABELS: Record<PromotionKind, string> = {
  ANNOUNCEMENT: 'Announcement',
  NEW_FEATURE: 'New feature',
  SPONSORED: 'Sponsored',
};

export const PROMOTION_TITLE_MAX = 80;
export const PROMOTION_BODY_MAX = 300;
export const PROMOTION_CTA_LABEL_MAX = 30;
export const PROMOTION_DISPLAY_SECONDS_MIN = 3;
export const PROMOTION_DISPLAY_SECONDS_MAX = 60;
export const PROMOTION_DISPLAY_SECONDS_DEFAULT = 10;
export const PROMOTION_SKIP_AFTER_DEFAULT = 5;

/**
 * Where tapping the ad leads: a path inside the apps (`/places/sai-mess`, `/community`, …) or an
 * https link. Paths are what notifications use too, so the mobile app maps them to its screens.
 */
export const promotionLinkSchema = z.union([
  z
    .string()
    .trim()
    .max(300)
    .regex(/^\/(?!\/)[\w\-./?=&%#]*$/, 'Use an app path such as /places/sai-mess, or an https link'),
  httpUrlField(500),
]);

/** What the apps receive: only what they need to show it. */
export const promotionSchema = z.object({
  id: z.string(),
  placement: promotionPlacementSchema,
  kind: promotionKindSchema,
  title: z.string(),
  body: z.string().nullable(),
  imageUrl: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaLink: z.string().nullable(),
  displaySeconds: z.number().int(),
  skipAfterSeconds: z.number().int(),
});
export type Promotion = z.infer<typeof promotionSchema>;

export const listPromotionsQuerySchema = z.object({ placement: promotionPlacementSchema });
export type ListPromotionsQuery = z.output<typeof listPromotionsQuerySchema>;

export const PROMOTION_EVENTS = ['view', 'click'] as const;
export type PromotionEvent = (typeof PROMOTION_EVENTS)[number];

/** The admin view: everything, plus schedule and how it performed. */
export const adminPromotionSchema = promotionSchema.extend({
  audience: promotionAudienceSchema,
  active: z.boolean(),
  priority: z.number().int(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  /** LIVE: shown right now. SCHEDULED: starts later. ENDED: past its end. PAUSED: switched off. */
  state: z.enum(['LIVE', 'SCHEDULED', 'ENDED', 'PAUSED']),
  views: z.number().int(),
  clicks: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminPromotion = z.infer<typeof adminPromotionSchema>;

const promotionFields = {
  placement: promotionPlacementSchema,
  kind: promotionKindSchema.default('ANNOUNCEMENT'),
  audience: promotionAudienceSchema.default('ALL'),
  title: singleLineField('Title', PROMOTION_TITLE_MAX).meta({ example: 'The student marketplace is live' }),
  body: multiLineField('Text', PROMOTION_BODY_MAX).nullable().optional(),
  imageUrl: httpUrlField(500).nullable().optional(),
  ctaLabel: singleLineField('Button text', PROMOTION_CTA_LABEL_MAX).nullable().optional(),
  ctaLink: promotionLinkSchema.nullable().optional(),
  displaySeconds: z
    .number()
    .int()
    .min(PROMOTION_DISPLAY_SECONDS_MIN)
    .max(PROMOTION_DISPLAY_SECONDS_MAX)
    .default(PROMOTION_DISPLAY_SECONDS_DEFAULT),
  skipAfterSeconds: z.number().int().min(0).max(PROMOTION_DISPLAY_SECONDS_MAX).default(PROMOTION_SKIP_AFTER_DEFAULT),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
};

function promotionRules(
  value: {
    displaySeconds?: number;
    skipAfterSeconds?: number;
    startsAt?: string | null;
    endsAt?: string | null;
    ctaLabel?: string | null;
    ctaLink?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (
    value.displaySeconds !== undefined &&
    value.skipAfterSeconds !== undefined &&
    value.skipAfterSeconds > value.displaySeconds
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['skipAfterSeconds'],
      message: 'The close button must appear before the ad ends',
    });
  }
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start' });
  }
  if (value.ctaLabel && !value.ctaLink) {
    ctx.addIssue({ code: 'custom', path: ['ctaLink'], message: 'Add where the button leads' });
  }
}

export const createPromotionSchema = z.strictObject(promotionFields).superRefine(promotionRules);
export type CreatePromotionRequest = z.output<typeof createPromotionSchema>;

export const updatePromotionSchema = z
  .strictObject({
    placement: promotionPlacementSchema.optional(),
    kind: promotionKindSchema.optional(),
    audience: promotionAudienceSchema.optional(),
    title: promotionFields.title.optional(),
    body: promotionFields.body,
    imageUrl: promotionFields.imageUrl,
    ctaLabel: promotionFields.ctaLabel,
    ctaLink: promotionFields.ctaLink,
    displaySeconds: z.number().int().min(PROMOTION_DISPLAY_SECONDS_MIN).max(PROMOTION_DISPLAY_SECONDS_MAX).optional(),
    skipAfterSeconds: z.number().int().min(0).max(PROMOTION_DISPLAY_SECONDS_MAX).optional(),
    active: z.boolean().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    startsAt: promotionFields.startsAt,
    endsAt: promotionFields.endsAt,
  })
  .superRefine(promotionRules)
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdatePromotionRequest = z.output<typeof updatePromotionSchema>;
