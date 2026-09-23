import { z } from 'zod';
import { emailSchema } from './auth.js';
import { priceUnitSchema } from './categories.js';
import { verificationStatusSchema } from './colleges.js';
import { paginationQuerySchema } from './pagination.js';
import {
  createSlugSchema,
  httpUrlField,
  idOrSlugField,
  multiLineField,
  singleLineField,
  uuidSchema,
} from './text.js';

/**
 * Place contracts: the public directory (cards, detail) and the admin management API. The shape
 * here is deliberately flatter than the `PlaceCard` in the original design reference ([04
 * §1](../../docs/04-api-spec.md#representative-response-shape-placecard)) — no nested
 * `verification`/`price`/`rating` objects, no `operatingStatus`/`isOpenNow`/`walkMinutes`/
 * `highlights` — the same simplification colleges and categories already made, documented in
 * [04 §2.5](../../docs/04-api-spec.md#25-places).
 *
 * Everything a place has is PLAIN TEXT: markup and control characters are refused. Links are
 * http(s) only, without embedded credentials.
 */

// A place created directly by staff (this phase) only ever uses DRAFT/ACTIVE/INACTIVE, exactly like
// a college. PENDING and REJECTED belong to the student-submission moderation workflow (a later
// phase) and are not reachable through this API yet.
export const PLACE_STATUSES = ['DRAFT', 'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'] as const;
export type PlaceStatus = (typeof PLACE_STATUSES)[number];
export const placeStatusSchema = z.enum(PLACE_STATUSES);

export const PLACE_SORTS = ['name', 'nearest', 'newest', 'cheapest', 'relevance'] as const;
export const ADMIN_PLACE_SORTS = ['newest', 'updated', 'name'] as const;

export const MAX_PLACE_IMAGES = 20;
export const MAX_PLACE_CATEGORIES = 5;
export const MAX_PLACE_AMENITIES = 50;
export const MAX_PLACE_PRICE_OPTIONS = 20;
export const MAX_PLACE_HOURS_ROWS = 40;

/** URL words a place slug may not take, so `/places/<slug>` can never clash with a fixed route. */
export const RESERVED_PLACE_SLUGS = ['new', 'search', 'nearby', 'popular', 'admin', 'me'] as const;

// ── Field building blocks ────────────────────────────────────────────────────────────────────────

const singleLine = singleLineField;
const multiLine = multiLineField;
const httpUrl = httpUrlField;

const latitude = z.number().min(-90).max(90).meta({ example: 19.098 });
const longitude = z.number().min(-180).max(180).meta({ example: 74.75 });

/** (0, 0) is "null island": the classic result of a failed geocode, never a real place. */
const isNullIsland = (lat: number | undefined, lng: number | undefined): boolean =>
  lat === 0 && lng === 0;
const NULL_ISLAND_MESSAGE = 'Coordinates 0, 0 are not a real location';

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\-.\s]{6,20}$/, 'Enter a valid phone number')
  .meta({ example: '+91 98765 43210' });

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeOfDaySchema = z.string().regex(HH_MM, 'Use 24-hour HH:mm, e.g. 09:30').meta({
  example: '09:00',
});

export const placeSlugSchema = createSlugSchema({
  reservedWords: RESERVED_PLACE_SLUGS,
  example: 'sample-mess',
});

/** The `:idOrSlug` of a public place URL. */
export const placeIdOrSlugSchema = idOrSlugField('sample-mess');

// ── Public directory ─────────────────────────────────────────────────────────────────────────────

const MAX_PRICE_FILTER = 10_000_000;

/** `?verified=true` turns the filter on; anything else (including omitting it) leaves it off. */
const verifiedFlagSchema = z
  .literal('true')
  .optional()
  .transform((value) => value === 'true');

/**
 * `GET /places` query. `lat`/`lng` go together; `sort=nearest` needs them, unless `collegeSlug` is
 * given instead — then distance defaults to "from that college" (overridden by explicit `lat`/`lng`).
 * `collegeSlug` scopes the list to places serving that college (the "college hub" journey);
 * `categorySlug` narrows further. `sort=relevance` needs `q`: it ranks by MySQL full-text relevance,
 * with distance from a point and verified status breaking ties among equally relevant results.
 */
export const listPlacesQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().max(100).optional().meta({ example: 'mess' }),
    city: z.string().trim().max(100).optional().meta({ example: 'Ahilyanagar' }),
    collegeSlug: z
      .string()
      .trim()
      .max(100)
      .optional()
      .meta({ example: 'sample-arts-science-college' }),
    categorySlug: z.string().trim().max(100).optional().meta({ example: 'mess' }),
    lat: z.coerce.number().min(-90).max(90).optional().meta({ example: 19.098 }),
    lng: z.coerce.number().min(-180).max(180).optional().meta({ example: 74.75 }),
    minPrice: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_PRICE_FILTER)
      .optional()
      .meta({ example: 1000 }),
    maxPrice: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_PRICE_FILTER)
      .optional()
      .meta({ example: 5000 }),
    verified: verifiedFlagSchema.meta({ example: 'true' }),
    sort: z.enum(PLACE_SORTS).default('name'),
  })
  .check((ctx) => {
    const { lat, lng, sort, collegeSlug, q, minPrice, maxPrice } = ctx.value;
    if ((lat === undefined) !== (lng === undefined)) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send lat and lng together',
        input: ctx.value,
        path: [lat === undefined ? 'lat' : 'lng'],
      });
    } else if (sort === 'nearest' && lat === undefined && !collegeSlug) {
      ctx.issues.push({
        code: 'custom',
        message: 'sort=nearest needs lat and lng, or a collegeSlug',
        input: ctx.value,
        path: ['sort'],
      });
    } else if (sort === 'relevance' && !q) {
      ctx.issues.push({
        code: 'custom',
        message: 'sort=relevance needs q',
        input: ctx.value,
        path: ['sort'],
      });
    } else if (isNullIsland(lat, lng)) {
      ctx.issues.push({
        code: 'custom',
        message: NULL_ISLAND_MESSAGE,
        input: ctx.value,
        path: ['lat'],
      });
    } else if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      ctx.issues.push({
        code: 'custom',
        message: 'minPrice cannot be greater than maxPrice',
        input: ctx.value,
        path: ['minPrice'],
      });
    }
  });
export type ListPlacesQuery = z.output<typeof listPlacesQuerySchema>;

export const placeImageSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  altText: z.string().nullable(),
  isCover: z.boolean(),
  sortOrder: z.number().int(),
});
export type PlaceImage = z.infer<typeof placeImageSchema>;

export const placeCategorySummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type PlaceCategorySummary = z.infer<typeof placeCategorySummarySchema>;

export const placeAmenitySummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
});
export type PlaceAmenitySummary = z.infer<typeof placeAmenitySummarySchema>;

export const placeHourSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(1).max(7),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  isClosed: z.boolean(),
  is24Hours: z.boolean(),
  slotLabel: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type PlaceHour = z.infer<typeof placeHourSchema>;

export const placePriceOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number().int(),
  unit: priceUnitSchema,
  note: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type PlacePriceOption = z.infer<typeof placePriceOptionSchema>;

/** One place in a list. `distanceMeters` is set only when the request sent `lat` and `lng`. */
export const placeCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
  primaryCategory: placeCategorySummarySchema.omit({ isPrimary: true }).nullable(),
  coverImageUrl: z.string().nullable(),
  /** Staff have confirmed this place's details. */
  verified: z.boolean(),
  ratingAverage: z.number().min(0).max(5),
  ratingCount: z.number().int().min(0),
  priceMin: z.number().int().nullable(),
  priceMax: z.number().int().nullable(),
  priceUnit: priceUnitSchema.nullable(),
  /** Straight-line metres from the given `lat`/`lng`; null when none was given. */
  distanceMeters: z.number().int().min(0).nullable(),
});
export type PlaceCard = z.infer<typeof placeCardSchema>;

export const placeDetailSchema = placeCardSchema.omit({ distanceMeters: true }).extend({
  description: z.string().nullable(),
  address: z.string(),
  country: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  googleMapsUrl: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  categories: z.array(placeCategorySummarySchema),
  amenities: z.array(placeAmenitySummarySchema),
  hours: z.array(placeHourSchema),
  priceOptions: z.array(placePriceOptionSchema),
  images: z.array(placeImageSchema),
});
export type PlaceDetail = z.infer<typeof placeDetailSchema>;

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

export const adminPlaceSchema = placeDetailSchema.extend({
  status: placeStatusSchema,
  verificationStatus: verificationStatusSchema,
  lastVerifiedAt: z.string().nullable(),
  /** Development sample data. Never true for a real place. */
  isDemo: z.boolean(),
  createdById: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminPlace = z.infer<typeof adminPlaceSchema>;

export const adminPlaceListItemSchema = adminPlaceSchema.omit({
  categories: true,
  amenities: true,
  hours: true,
  priceOptions: true,
  images: true,
});
export type AdminPlaceListItem = z.infer<typeof adminPlaceListItemSchema>;

export const adminListPlacesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  status: placeStatusSchema.optional(),
  verification: verificationStatusSchema.optional(),
  sort: z.enum(ADMIN_PLACE_SORTS).default('newest'),
});
export type AdminListPlacesQuery = z.output<typeof adminListPlacesQuerySchema>;

const placeFields = {
  name: singleLine('Name', 200).meta({ example: 'Sample Mess' }),
  description: multiLine('Description', 5000),
  address: singleLine('Address', 500).meta({ example: 'Station Road, Ahilyanagar' }),
  city: singleLine('City', 100).meta({ example: 'Ahilyanagar' }),
  state: singleLine('State', 100).meta({ example: 'Maharashtra' }),
  country: singleLine('Country', 100).meta({ example: 'India' }),
  phone: phoneSchema,
  email: emailSchema.meta({ example: 'contact@sample-mess.example.com' }),
  website: httpUrl(500).meta({ example: 'https://sample-mess.example.com' }),
  googleMapsUrl: httpUrl(1000).meta({
    example: 'https://www.google.com/maps/search/?api=1&query=19.098,74.75',
  }),
};

/** One row of `POST/PATCH .../hours`: closed and 24-hour rows carry no times, everything else needs both. */
export const placeHourInputSchema = z
  .strictObject({
    dayOfWeek: z.number().int().min(1).max(7).meta({ example: 1 }),
    openTime: timeOfDaySchema.optional(),
    closeTime: timeOfDaySchema.optional(),
    isClosed: z.boolean().default(false),
    is24Hours: z.boolean().default(false),
    slotLabel: singleLine('Slot label', 50).optional().meta({ example: 'Lunch' }),
    sortOrder: z.number().int().min(0).max(20).default(0),
  })
  .check((ctx) => {
    const { isClosed, is24Hours, openTime, closeTime } = ctx.value;
    if (isClosed && is24Hours) {
      ctx.issues.push({
        code: 'custom',
        message: 'A slot cannot be both closed and open 24 hours',
        input: ctx.value,
        path: ['isClosed'],
      });
    } else if (isClosed || is24Hours) {
      if (openTime || closeTime) {
        ctx.issues.push({
          code: 'custom',
          message: 'Closed and 24-hour slots take no open/close time',
          input: ctx.value,
          path: ['openTime'],
        });
      }
    } else if (!openTime || !closeTime) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send both openTime and closeTime, or set isClosed / is24Hours',
        input: ctx.value,
        path: ['openTime'],
      });
    }
  });
export type PlaceHourInput = z.output<typeof placeHourInputSchema>;

// No `.default()` here: these are shared between create (where a default makes them optional to
// send) and update (where an absent key must mean "leave untouched", not "clear the list" — a
// baked-in default would inject an empty array into the parsed output even when nothing was sent,
// defeating "send at least one field to change" below).
const hoursListSchema = z
  .array(placeHourInputSchema)
  .max(MAX_PLACE_HOURS_ROWS)
  .check((ctx) => {
    const seen = new Set<string>();
    for (const row of ctx.value) {
      const key = `${row.dayOfWeek}:${row.sortOrder}`;
      if (seen.has(key)) {
        ctx.issues.push({
          code: 'custom',
          message: `Duplicate slot for day ${row.dayOfWeek}, position ${row.sortOrder}`,
          input: ctx.value,
          path: [],
        });
        break;
      }
      seen.add(key);
    }
  });

export const placePriceOptionInputSchema = z.strictObject({
  label: singleLine('Label', 100).meta({ example: 'Monthly, veg' }),
  amount: z.number().int().min(0).max(10_000_000).meta({ example: 3000 }),
  unit: priceUnitSchema,
  note: singleLine('Note', 255).optional(),
});
export type PlacePriceOptionInput = z.output<typeof placePriceOptionInputSchema>;

const priceOptionsListSchema = z.array(placePriceOptionInputSchema).max(MAX_PLACE_PRICE_OPTIONS);
const amenityIdsSchema = z.array(uuidSchema).max(MAX_PLACE_AMENITIES);
const categoryIdsSchema = z
  .array(uuidSchema)
  .min(1, 'A place needs at least one category')
  .max(MAX_PLACE_CATEGORIES)
  .check((ctx) => {
    if (new Set(ctx.value).size !== ctx.value.length) {
      ctx.issues.push({
        code: 'custom',
        message: 'The same category cannot be sent twice',
        input: ctx.value,
        path: [],
      });
    }
  });

/**
 * `POST /admin/places`. Strict: an unknown field (say `isDemo` or `ratingAverage`) is a 400. The
 * first id in `categoryIds` becomes the primary category. `hours`, `priceOptions` and `amenityIds`
 * default to empty and can be filled in afterwards with `PATCH`.
 */
export const createPlaceRequestSchema = z
  .strictObject({
    name: placeFields.name,
    description: placeFields.description.optional(),
    address: placeFields.address,
    city: placeFields.city,
    state: placeFields.state,
    country: placeFields.country.default('India'),
    latitude,
    longitude,
    phone: placeFields.phone.optional(),
    email: placeFields.email.optional(),
    website: placeFields.website.optional(),
    googleMapsUrl: placeFields.googleMapsUrl.optional(),
    /** Generated from the name when omitted. */
    slug: placeSlugSchema.optional(),
    /** New places start as drafts, invisible to the public, unless published straight away. */
    status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
    categoryIds: categoryIdsSchema,
    amenityIds: amenityIdsSchema.default([]),
    hours: hoursListSchema.default([]),
    priceOptions: priceOptionsListSchema.default([]),
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
export type CreatePlaceRequest = z.output<typeof createPlaceRequestSchema>;

/**
 * `PATCH /admin/places/:id`. Every field is optional and only what is sent changes; optional text
 * and links can be cleared with `null`. `categoryIds`, `amenityIds`, `hours` and `priceOptions`
 * REPLACE the whole list when sent, and are left untouched when omitted. Status and verification
 * are not editable here (they have their own endpoints).
 */
export const updatePlaceRequestSchema = z
  .strictObject({
    name: placeFields.name.optional(),
    description: placeFields.description.nullable().optional(),
    address: placeFields.address.optional(),
    city: placeFields.city.optional(),
    state: placeFields.state.optional(),
    country: placeFields.country.optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    phone: placeFields.phone.nullable().optional(),
    email: placeFields.email.nullable().optional(),
    website: placeFields.website.nullable().optional(),
    googleMapsUrl: placeFields.googleMapsUrl.nullable().optional(),
    /** Only while the place is still a DRAFT (published slugs are public links). */
    slug: placeSlugSchema.optional(),
    categoryIds: categoryIdsSchema.optional(),
    amenityIds: amenityIdsSchema.optional(),
    hours: hoursListSchema.optional(),
    priceOptions: priceOptionsListSchema.optional(),
  })
  .check((ctx) => {
    if (Object.keys(ctx.value).length === 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send at least one field to change',
        input: ctx.value,
      });
    }
    if (isNullIsland(ctx.value.latitude, ctx.value.longitude)) {
      ctx.issues.push({
        code: 'custom',
        message: NULL_ISLAND_MESSAGE,
        input: ctx.value,
        path: ['latitude'],
      });
    }
  });
export type UpdatePlaceRequest = z.output<typeof updatePlaceRequestSchema>;

/** Optional body of the activate / deactivate / verify / unverify actions. */
export const placeActionRequestSchema = z
  .strictObject({
    reason: singleLine('Reason', 500).optional().meta({ example: 'Permanently closed' }),
  })
  .optional();
export type PlaceActionRequest = z.output<typeof placeActionRequestSchema>;

export const addPlaceImageRequestSchema = z.strictObject({
  imageUrl: httpUrl(1000).meta({ example: 'https://cdn.example.com/mess-hall.jpg' }),
  altText: singleLine('Alt text', 200).nullable().optional().meta({ example: 'Dining hall' }),
  isCover: z.boolean().optional(),
  /** Lower numbers show first. Defaults to the end of the list. */
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type AddPlaceImageRequest = z.output<typeof addPlaceImageRequestSchema>;

export const updatePlaceImageRequestSchema = z
  .strictObject({
    altText: singleLine('Alt text', 200).nullable().optional(),
    isCover: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .check((ctx) => {
    if (Object.keys(ctx.value).length === 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send at least one field to change',
        input: ctx.value,
      });
    }
  });
export type UpdatePlaceImageRequest = z.output<typeof updatePlaceImageRequestSchema>;
