import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import {
  createSlugSchema,
  httpUrlField,
  idOrSlugField,
  multiLineField,
  singleLineField,
} from './text.js';

/**
 * College contracts: the public directory (cards, detail) and the admin management API. The API
 * validates with these schemas, Swagger documents from them and the web/mobile apps reuse them.
 *
 * Everything a college has is PLAIN TEXT: markup and control characters are refused, so a name or
 * description can never inject anything into a page, an email or an admin screen that forgets to
 * escape. Links are http(s) only, without embedded credentials.
 */

export const COLLEGE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export type CollegeStatus = (typeof COLLEGE_STATUSES)[number];
export const collegeStatusSchema = z.enum(COLLEGE_STATUSES);

export const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);

export const COLLEGE_SORTS = ['name', 'nearest', 'popular', 'newest'] as const;
export const ADMIN_COLLEGE_SORTS = ['newest', 'updated', 'name'] as const;

/** Places within this many metres of a college are linked to it automatically. */
export const COLLEGE_RADIUS = { min: 100, max: 50_000, default: 5000 } as const;
export const MAX_COLLEGE_IMAGES = 20;

/** URL words a college slug may not take, so `/colleges/<slug>` can never clash with a fixed route. */
export const RESERVED_COLLEGE_SLUGS = [
  'popular',
  'cities',
  'nearby',
  'search',
  'discover',
  'new',
  'me',
  'admin',
] as const;

// ── Field building blocks ────────────────────────────────────────────────────────────────────────

const singleLine = singleLineField;
const multiLine = multiLineField;
const httpUrl = httpUrlField;

const latitude = z.number().min(-90).max(90).meta({ example: 19.0952 });
const longitude = z.number().min(-180).max(180).meta({ example: 74.7496 });

/** (0, 0) is "null island": the classic result of a failed geocode, never a real college. */
const isNullIsland = (lat: number | undefined, lng: number | undefined): boolean =>
  lat === 0 && lng === 0;
const NULL_ISLAND_MESSAGE = 'Coordinates 0, 0 are not a real location';

const radius = z
  .number()
  .int()
  .min(COLLEGE_RADIUS.min)
  .max(COLLEGE_RADIUS.max)
  .meta({ example: COLLEGE_RADIUS.default });

export const slugSchema = createSlugSchema({
  reservedWords: RESERVED_COLLEGE_SLUGS,
  example: 'sample-arts-science-college',
});

/** The `:idOrSlug` of a public college URL. */
export const collegeIdOrSlugSchema = idOrSlugField('sample-arts-science-college');

// ── Public directory ─────────────────────────────────────────────────────────────────────────────

/** `GET /colleges` query. `lat` and `lng` go together; `sort=nearest` needs them. */
export const listCollegesQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().max(100).optional().meta({ example: 'science' }),
    city: z.string().trim().max(100).optional().meta({ example: 'Ahilyanagar' }),
    lat: z.coerce.number().min(-90).max(90).optional().meta({ example: 19.0952 }),
    lng: z.coerce.number().min(-180).max(180).optional().meta({ example: 74.7496 }),
    sort: z.enum(COLLEGE_SORTS).default('name'),
  })
  .check((ctx) => {
    const { lat, lng, sort } = ctx.value;
    if ((lat === undefined) !== (lng === undefined)) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send lat and lng together',
        input: ctx.value,
        path: [lat === undefined ? 'lat' : 'lng'],
      });
    } else if (sort === 'nearest' && lat === undefined) {
      ctx.issues.push({
        code: 'custom',
        message: 'sort=nearest needs lat and lng',
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
    }
  });
export type ListCollegesQuery = z.output<typeof listCollegesQuerySchema>;

export const collegeImageSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type CollegeImage = z.infer<typeof collegeImageSchema>;

/** One college in a list. `distanceMeters` is set only when the request sent `lat` and `lng`. */
export const collegeCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  logoUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  /** Staff have confirmed this college's details. */
  verified: z.boolean(),
  /** Active places serving this college. */
  placeCount: z.number().int().min(0),
  /** Straight-line metres from the given `lat`/`lng`; null when none was given. */
  distanceMeters: z.number().int().min(0).nullable(),
});
export type CollegeCard = z.infer<typeof collegeCardSchema>;

export const collegeDetailSchema = collegeCardSchema.omit({ distanceMeters: true }).extend({
  description: z.string().nullable(),
  address: z.string(),
  country: z.string(),
  website: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  serviceRadiusMeters: z.number().int(),
  images: z.array(collegeImageSchema),
});
export type CollegeDetail = z.infer<typeof collegeDetailSchema>;

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

export const adminCollegeSchema = collegeDetailSchema.extend({
  status: collegeStatusSchema,
  verificationStatus: verificationStatusSchema,
  /** Development sample data. Never true for a real college. */
  isDemo: z.boolean(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminCollege = z.infer<typeof adminCollegeSchema>;

export const adminCollegeListItemSchema = adminCollegeSchema.omit({ images: true });
export type AdminCollegeListItem = z.infer<typeof adminCollegeListItemSchema>;

export const adminListCollegesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  status: collegeStatusSchema.optional(),
  verification: verificationStatusSchema.optional(),
  sort: z.enum(ADMIN_COLLEGE_SORTS).default('newest'),
});
export type AdminListCollegesQuery = z.output<typeof adminListCollegesQuerySchema>;

const collegeFields = {
  name: singleLine('Name', 200).meta({ example: 'Sample Arts & Science College' }),
  shortName: singleLine('Short name', 50).meta({ example: 'Sample ASC' }),
  description: multiLine('Description', 5000),
  address: singleLine('Address', 500).meta({ example: 'Station Road, Ahilyanagar' }),
  city: singleLine('City', 100).meta({ example: 'Ahilyanagar' }),
  state: singleLine('State', 100).meta({ example: 'Maharashtra' }),
  country: singleLine('Country', 100).meta({ example: 'India' }),
  website: httpUrl(500).meta({ example: 'https://college.example.edu' }),
  logoUrl: httpUrl(1000).meta({ example: 'https://cdn.example.edu/logo.png' }),
  coverImageUrl: httpUrl(1000).meta({ example: 'https://cdn.example.edu/cover.jpg' }),
};

/**
 * `POST /admin/colleges`. Strict: an unknown field (say `isDemo` or `verificationStatus`) is a 400,
 * not silently ignored, so a client can never believe it set something it did not.
 */
export const createCollegeRequestSchema = z
  .strictObject({
    name: collegeFields.name,
    shortName: collegeFields.shortName.optional(),
    description: collegeFields.description.optional(),
    address: collegeFields.address,
    city: collegeFields.city,
    state: collegeFields.state,
    country: collegeFields.country.default('India'),
    latitude,
    longitude,
    serviceRadiusMeters: radius.default(COLLEGE_RADIUS.default),
    website: collegeFields.website.optional(),
    logoUrl: collegeFields.logoUrl.optional(),
    coverImageUrl: collegeFields.coverImageUrl.optional(),
    /** Generated from the name when omitted. */
    slug: slugSchema.optional(),
    /** New colleges start as drafts, invisible to the public, unless published straight away. */
    status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
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
export type CreateCollegeRequest = z.output<typeof createCollegeRequestSchema>;

/**
 * `PATCH /admin/colleges/:id`. Every field is optional and only what is sent changes; optional text
 * and links can be cleared with `null`. Status, verification and demo flags are NOT editable here
 * (they have their own endpoints), and sending one is a 400.
 */
export const updateCollegeRequestSchema = z
  .strictObject({
    name: collegeFields.name.optional(),
    shortName: collegeFields.shortName.nullable().optional(),
    description: collegeFields.description.nullable().optional(),
    address: collegeFields.address.optional(),
    city: collegeFields.city.optional(),
    state: collegeFields.state.optional(),
    country: collegeFields.country.optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    serviceRadiusMeters: radius.optional(),
    website: collegeFields.website.nullable().optional(),
    logoUrl: collegeFields.logoUrl.nullable().optional(),
    coverImageUrl: collegeFields.coverImageUrl.nullable().optional(),
    /** Only while the college is still a DRAFT (published slugs are public links). */
    slug: slugSchema.optional(),
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
export type UpdateCollegeRequest = z.output<typeof updateCollegeRequestSchema>;

/** Optional body of the activate / deactivate / verify / unverify actions. */
export const collegeActionRequestSchema = z
  .strictObject({
    reason: singleLine('Reason', 500).optional().meta({ example: 'Merged into another campus' }),
  })
  .optional();
export type CollegeActionRequest = z.output<typeof collegeActionRequestSchema>;

export const addCollegeImageRequestSchema = z.strictObject({
  imageUrl: httpUrl(1000).meta({ example: 'https://cdn.example.edu/campus-gate.jpg' }),
  altText: singleLine('Alt text', 200).nullable().optional().meta({ example: 'Main gate' }),
  /** Lower numbers show first. Defaults to the end of the list. */
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type AddCollegeImageRequest = z.output<typeof addCollegeImageRequestSchema>;

export const updateCollegeImageRequestSchema = z
  .strictObject({
    altText: singleLine('Alt text', 200).nullable().optional(),
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
export type UpdateCollegeImageRequest = z.output<typeof updateCollegeImageRequestSchema>;
