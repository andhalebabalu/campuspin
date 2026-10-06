import { z } from 'zod';
import { collegeRefSchema, memberSummarySchema } from './members.js';
import { cursorQuerySchema, paginationQuerySchema } from './pagination.js';
import { httpUrlField, multiLineField, singleLineField } from './text.js';

// Match the Prisma enums of the marketplace migration exactly.
export const LISTING_CATEGORIES = [
  'BOOKS',
  'NOTES',
  'ELECTRONICS',
  'FURNITURE',
  'CYCLES',
  'HOSTEL_ESSENTIALS',
  'CLOTHING',
  'SPORTS',
  'STATIONERY',
  'OTHER',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];
export const listingCategorySchema = z.enum(LISTING_CATEGORIES);

export const LISTING_CATEGORY_LABELS: Record<ListingCategory, string> = {
  BOOKS: 'Books',
  NOTES: 'Notes',
  ELECTRONICS: 'Electronics',
  FURNITURE: 'Furniture',
  CYCLES: 'Cycles',
  HOSTEL_ESSENTIALS: 'Hostel essentials',
  CLOTHING: 'Clothing',
  SPORTS: 'Sports',
  STATIONERY: 'Stationery',
  OTHER: 'Other',
};

export const LISTING_CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];
export const listingConditionSchema = z.enum(LISTING_CONDITIONS);

export const LISTING_CONDITION_LABELS: Record<ListingCondition, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
};

/**
 * Who sees a listing. MY_COLLEGE: verified students of the seller's college. NEARBY_COLLEGES (the
 * default): also students of colleges within the configured radius. CITY: also every college in the
 * seller's college city.
 */
export const LISTING_VISIBILITIES = ['MY_COLLEGE', 'NEARBY_COLLEGES', 'CITY'] as const;
export type ListingVisibility = (typeof LISTING_VISIBILITIES)[number];
export const listingVisibilitySchema = z.enum(LISTING_VISIBILITIES);

export const LISTING_VISIBILITY_LABELS: Record<ListingVisibility, string> = {
  MY_COLLEGE: 'My college only',
  NEARBY_COLLEGES: 'Nearby colleges',
  CITY: 'Whole city',
};

/** HIDDEN is a moderator's reversible hold; REMOVED is final (by the seller or a moderator). */
export const LISTING_STATUSES = [
  'ACTIVE',
  'RESERVED',
  'SOLD',
  'EXPIRED',
  'HIDDEN',
  'REMOVED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const listingStatusSchema = z.enum(LISTING_STATUSES);

/** Browse filter: how far from my college to look. */
export const MARKETPLACE_SCOPES = ['my_college', 'nearby', 'city'] as const;
export type MarketplaceScope = (typeof MARKETPLACE_SCOPES)[number];

export const MARKETPLACE_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];

export const LISTING_TITLE_MAX = 120;
export const LISTING_DESCRIPTION_MAX = 3000;
export const LISTING_IMAGES_MAX = 6;
export const LISTING_PRICE_MAX = 500_000;
/** A listing stays up this long, then expires unless the seller renews it. */
export const LISTING_LIFETIME_DAYS = 30;
export const MESSAGE_MAX = 2000;

// ── Responses ────────────────────────────────────────────────────────────────────────────────────

export const listingCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: listingCategorySchema,
  condition: listingConditionSchema,
  /** Whole rupees; 0 means free. */
  price: z.number().int(),
  negotiable: z.boolean(),
  status: listingStatusSchema,
  coverImageUrl: z.string().nullable(),
  /** The seller's verified college. */
  college: collegeRefSchema,
  city: z.string(),
  /** From the viewer's college, rounded to 0.1 km; null for the viewer's own college. */
  distanceKm: z.number().nullable(),
  createdAt: z.string(),
});
export type ListingCard = z.infer<typeof listingCardSchema>;

export const listingSchema = listingCardSchema.extend({
  description: z.string(),
  quantity: z.number().int(),
  /** A pickup point in words (e.g. "Main gate"), never an address or phone number. */
  location: z.string().nullable(),
  visibility: listingVisibilitySchema,
  images: z.array(z.string()),
  seller: memberSummarySchema,
  mine: z.boolean(),
  /** False when the seller has turned off messages (or blocked the viewer). */
  canMessage: z.boolean(),
  /** My existing conversation about this listing, if any. */
  conversationId: z.string().nullable(),
  moderationNote: z.string().nullable(),
  expiresAt: z.string(),
  updatedAt: z.string(),
});
export type Listing = z.infer<typeof listingSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  listing: z.object({
    id: z.string(),
    title: z.string(),
    price: z.number().int(),
    status: listingStatusSchema,
    coverImageUrl: z.string().nullable(),
  }),
  /** The other person in the conversation. */
  other: memberSummarySchema,
  role: z.enum(['BUYER', 'SELLER']),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.string(),
  unread: z.boolean(),
  /** Either side blocked the other: the thread is read-only. */
  blocked: z.boolean(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  body: z.string(),
  mine: z.boolean(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const messagesUnreadSchema = z.object({ unread: z.number().int() });

// ── Requests ─────────────────────────────────────────────────────────────────────────────────────

export const listListingsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(MARKETPLACE_SCOPES).default('nearby'),
  q: z.string().trim().max(100).optional(),
  category: listingCategorySchema.optional(),
  condition: listingConditionSchema.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(MARKETPLACE_SORTS).default('newest'),
});
export type ListListingsQuery = z.output<typeof listListingsQuerySchema>;

export const listMyListingsQuerySchema = paginationQuerySchema.extend({
  status: listingStatusSchema.optional(),
});
export type ListMyListingsQuery = z.output<typeof listMyListingsQuerySchema>;

const listingFields = {
  title: singleLineField('Title', LISTING_TITLE_MAX).meta({
    example: 'Engineering Maths (Kreyszig)',
  }),
  description: multiLineField('Description', LISTING_DESCRIPTION_MAX).meta({
    example: 'Clean copy, a few pencil notes in chapter 2.',
  }),
  category: listingCategorySchema,
  condition: listingConditionSchema,
  price: z.number().int().min(0).max(LISTING_PRICE_MAX).meta({ example: 350 }),
  negotiable: z.boolean().default(false),
  quantity: z.number().int().min(1).max(99).default(1),
  location: singleLineField('Pickup point', 120)
    .nullable()
    .optional()
    .meta({ example: 'Main gate' }),
  visibility: listingVisibilitySchema.default('NEARBY_COLLEGES'),
  /** URLs returned by `POST /uploads/images`; the first is the cover. */
  images: z.array(httpUrlField(500)).max(LISTING_IMAGES_MAX).default([]),
};

/** `POST /marketplace/listings`. No college or city field: both come from the verified account. */
export const createListingSchema = z.strictObject(listingFields);
export type CreateListingRequest = z.output<typeof createListingSchema>;

export const updateListingSchema = z
  .strictObject({
    title: listingFields.title.optional(),
    description: listingFields.description.optional(),
    category: listingCategorySchema.optional(),
    condition: listingConditionSchema.optional(),
    price: listingFields.price.optional(),
    negotiable: z.boolean().optional(),
    quantity: z.number().int().min(1).max(99).optional(),
    location: listingFields.location,
    visibility: listingVisibilitySchema.optional(),
    images: z.array(httpUrlField(500)).max(LISTING_IMAGES_MAX).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateListingRequest = z.output<typeof updateListingSchema>;

/** What a seller can do to their own listing. */
export const LISTING_SELLER_ACTIONS = ['reserve', 'unreserve', 'sold', 'renew'] as const;
export type ListingSellerAction = (typeof LISTING_SELLER_ACTIONS)[number];

export const startConversationSchema = z.strictObject({
  message: multiLineField('Message', MESSAGE_MAX).meta({ example: 'Is this still available?' }),
});
export type StartConversationRequest = z.output<typeof startConversationSchema>;

export const sendMessageSchema = z.strictObject({
  body: multiLineField('Message', MESSAGE_MAX).meta({ example: 'Can we meet at the library?' }),
});
export type SendMessageRequest = z.output<typeof sendMessageSchema>;

export const listConversationsQuerySchema = paginationQuerySchema;
export type ListConversationsQuery = z.output<typeof listConversationsQuerySchema>;

/** Newest first; pass `nextCursor` to load older messages. */
export const listMessagesQuerySchema = cursorQuerySchema;
export type ListMessagesQuery = z.output<typeof listMessagesQuerySchema>;

/** `POST /marketplace/listings/:id/actions`. */
export const listingActionSchema = z.strictObject({ action: z.enum(LISTING_SELLER_ACTIONS) });
export type ListingActionRequest = z.output<typeof listingActionSchema>;
