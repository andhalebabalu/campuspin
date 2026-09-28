import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { placeCardSchema } from './places.js';
import { multiLineField, singleLineField } from './text.js';

/**
 * Daily-use services: what a place lets students DO through CampusPin. A `ServiceType` (ORDER_FOOD,
 * PRINT, DAILY_MENU, ...) is data managed by staff; its `kind` decides how it behaves. A business
 * switches types on per place (`PlaceService`) with kind-specific settings in `config`.
 */

// ── Service types ────────────────────────────────────────────────────────────────────────────────

// Matches the Prisma `ServiceKind` enum exactly.
export const SERVICE_KINDS = [
  'FOOD_ORDER',
  'DAILY_MENU',
  'TABLE_SERVICE',
  'PRINT_ORDER',
  'SERVICE_REQUEST',
  'BOOKING',
  'OFFERS',
  'LISTING',
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const serviceKindSchema = z.enum(SERVICE_KINDS);

/** Kinds a business switches on for a place. LISTING is discovery only; OFFERS follow live offers. */
export const CONFIGURABLE_SERVICE_KINDS = [
  'FOOD_ORDER',
  'DAILY_MENU',
  'TABLE_SERVICE',
  'PRINT_ORDER',
  'SERVICE_REQUEST',
  'BOOKING',
] as const satisfies readonly ServiceKind[];
export type ConfigurableServiceKind = (typeof CONFIGURABLE_SERVICE_KINDS)[number];

/** A service type key: upper case, e.g. `ORDER_FOOD`. Stable once created. */
export const serviceTypeKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(40)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Use capital letters, digits and underscores')
  .meta({ example: 'ORDER_FOOD' });

export const serviceTypeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** A key from the app icon set. */
  icon: z.string().nullable(),
  kind: serviceKindSchema,
  showOnHome: z.boolean(),
  /** LISTING kind: the category (or group) slug it opens. */
  categorySlug: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceTypeSummarySchema = serviceTypeSchema.pick({
  key: true,
  name: true,
  icon: true,
  kind: true,
});
export type ServiceTypeSummary = z.infer<typeof serviceTypeSummarySchema>;

/** A quick action on the student home: a service type and how many live places offer it now. */
export const quickActionSchema = serviceTypeSchema.omit({ id: true, showOnHome: true }).extend({
  /** 0 = nobody offers it yet: the app shows an empty state, never fake places. */
  available: z.number().int().min(0),
});
export type QuickAction = z.infer<typeof quickActionSchema>;

export const adminServiceTypeSchema = serviceTypeSchema.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']),
  /** Places that have it switched on. */
  placeCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminServiceType = z.infer<typeof adminServiceTypeSchema>;

export const createServiceTypeSchema = z.strictObject({
  key: serviceTypeKeySchema,
  name: singleLineField('Name', 60),
  description: singleLineField('Description', 255).nullable().optional(),
  icon: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,50}$/, 'Use an icon key such as "printer"')
    .nullable()
    .optional(),
  kind: serviceKindSchema,
  showOnHome: z.boolean().default(false),
  categorySlug: z.string().trim().min(1).max(100).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type CreateServiceTypeRequest = z.output<typeof createServiceTypeSchema>;

/** The key and kind never change: stored services and app code depend on them. */
export const updateServiceTypeSchema = createServiceTypeSchema
  .omit({ key: true, kind: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdateServiceTypeRequest = z.output<typeof updateServiceTypeSchema>;

// ── Service settings per kind ────────────────────────────────────────────────────────────────────

const rupees = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be whole rupees`)
    .min(0)
    .max(100_000);

export const PAPER_SIZES = ['A4', 'A3', 'LEGAL', 'LETTER'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/**
 * Kind-specific settings with their defaults. The API validates `config` against the schema of the
 * type's kind, so a bad value can never be stored; students only ever see what is listed here.
 */
export const serviceConfigSchemas = {
  FOOD_ORDER: z.strictObject({
    /** A quick pause switch for rush hour, without switching the service off. */
    acceptingOrders: z.boolean().default(true),
    /** Orders from a table QR code. */
    tableOrdering: z.boolean().default(true),
    /** Orders to collect at the counter (no table). */
    pickupOrdering: z.boolean().default(true),
  }),
  DAILY_MENU: z.strictObject({
    /** Optional monthly price shown next to the menu (whole rupees). */
    monthlyPrice: rupees('Monthly price').nullable().default(null),
  }),
  TABLE_SERVICE: z.strictObject({}),
  PRINT_ORDER: z.strictObject({
    acceptingOrders: z.boolean().default(true),
    bwPricePerPage: rupees('Black & white price').default(2),
    /** null = colour printing is not offered. */
    colorPricePerPage: rupees('Colour price').nullable().default(null),
    doubleSided: z.boolean().default(true),
    paperSizes: z.array(z.enum(PAPER_SIZES)).min(1).max(4).default(['A4']),
    /** null = not offered. Per document. */
    bindingPrice: rupees('Binding price').nullable().default(null),
    /** null = not offered. Per page. */
    laminationPricePerPage: rupees('Lamination price').nullable().default(null),
  }),
  SERVICE_REQUEST: z.strictObject({
    acceptingRequests: z.boolean().default(true),
    /** Students may attach a photo of the problem. */
    photosAllowed: z.boolean().default(true),
  }),
  BOOKING: z.strictObject({
    /** Off = the place shows its details (seats, hours, price) but takes no bookings. */
    bookingEnabled: z.boolean().default(false),
    /** On = bookings are confirmed straight away; off = the business confirms each one. */
    autoConfirm: z.boolean().default(true),
    /** Study spaces: total seats (information only; capacity per slot is on each bookable item). */
    seats: z.number().int().min(1).max(5000).nullable().default(null),
    pricePerDay: rupees('Price per day').nullable().default(null),
    facilities: z.array(singleLineField('Facility', 40)).max(20).default([]),
  }),
} as const satisfies Record<ConfigurableServiceKind, z.ZodType>;

export type FoodOrderConfig = z.output<(typeof serviceConfigSchemas)['FOOD_ORDER']>;
export type DailyMenuConfig = z.output<(typeof serviceConfigSchemas)['DAILY_MENU']>;
export type PrintOrderConfig = z.output<(typeof serviceConfigSchemas)['PRINT_ORDER']>;
export type ServiceRequestConfig = z.output<(typeof serviceConfigSchemas)['SERVICE_REQUEST']>;
export type BookingConfig = z.output<(typeof serviceConfigSchemas)['BOOKING']>;

export const isConfigurableKind = (kind: ServiceKind): kind is ConfigurableServiceKind =>
  (CONFIGURABLE_SERVICE_KINDS as readonly string[]).includes(kind);

/** How an owner's settings form renders one config field; shared so web and mobile agree. */
export interface ServiceConfigField {
  key: string;
  label: string;
  type: 'boolean' | 'rupees' | 'count' | 'paperSizes' | 'tags';
  /** Rupees/count fields that may be left empty (= not offered / not shown). */
  optional?: boolean;
  help?: string;
}

export const SERVICE_CONFIG_FIELDS: Readonly<
  Record<ConfigurableServiceKind, readonly ServiceConfigField[]>
> = {
  FOOD_ORDER: [
    {
      key: 'acceptingOrders',
      label: 'Taking orders now',
      type: 'boolean',
      help: 'Pause during a rush without switching ordering off.',
    },
    { key: 'tableOrdering', label: 'Orders from table QR codes', type: 'boolean' },
    { key: 'pickupOrdering', label: 'Orders to collect at the counter', type: 'boolean' },
  ],
  DAILY_MENU: [
    {
      key: 'monthlyPrice',
      label: 'Monthly price',
      type: 'rupees',
      optional: true,
      help: 'Shown next to your menu.',
    },
  ],
  TABLE_SERVICE: [],
  PRINT_ORDER: [
    { key: 'acceptingOrders', label: 'Taking print orders now', type: 'boolean' },
    { key: 'bwPricePerPage', label: 'Black & white, per page', type: 'rupees' },
    {
      key: 'colorPricePerPage',
      label: 'Colour, per page',
      type: 'rupees',
      optional: true,
      help: 'Leave empty if you do not print in colour.',
    },
    { key: 'doubleSided', label: 'Double-sided printing', type: 'boolean' },
    { key: 'paperSizes', label: 'Paper sizes', type: 'paperSizes' },
    {
      key: 'bindingPrice',
      label: 'Binding, per document',
      type: 'rupees',
      optional: true,
      help: 'Leave empty if you do not bind.',
    },
    {
      key: 'laminationPricePerPage',
      label: 'Lamination, per page',
      type: 'rupees',
      optional: true,
      help: 'Leave empty if you do not laminate.',
    },
  ],
  SERVICE_REQUEST: [
    { key: 'acceptingRequests', label: 'Taking requests now', type: 'boolean' },
    { key: 'photosAllowed', label: 'Students can attach a photo', type: 'boolean' },
  ],
  BOOKING: [
    {
      key: 'bookingEnabled',
      label: 'Take bookings through CampusPin',
      type: 'boolean',
      help: 'Off: students see your details but book in person.',
    },
    { key: 'autoConfirm', label: 'Confirm bookings automatically', type: 'boolean' },
    { key: 'seats', label: 'Total seats', type: 'count', optional: true },
    { key: 'pricePerDay', label: 'Price per day', type: 'rupees', optional: true },
    { key: 'facilities', label: 'Facilities', type: 'tags', help: 'e.g. AC, Wi-Fi, lockers' },
  ],
};

// ── A place's services (owner view) ──────────────────────────────────────────────────────────────

export const placeServiceSchema = z.object({
  serviceType: serviceTypeSummarySchema.extend({ description: z.string().nullable() }),
  /** What the owner chose. The service is live only when `enabled && !disabledByAdmin`. */
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  disabledByAdmin: z.boolean(),
  adminNote: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type PlaceService = z.infer<typeof placeServiceSchema>;

/** `PUT /business/places/:placeId/services/:key`. `config` is checked against the kind's schema. */
export const updatePlaceServiceSchema = z
  .strictObject({
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdatePlaceServiceRequest = z.output<typeof updatePlaceServiceSchema>;

// ── Daily menus ──────────────────────────────────────────────────────────────────────────────────

export const MEAL_SLOTS = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export const mealSlotSchema = z.enum(MEAL_SLOTS);
export const MEAL_LABELS: Readonly<Record<MealSlot, string>> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  SNACKS: 'Evening snacks',
  DINNER: 'Dinner',
};

export const MENU_STATUSES = ['DRAFT', 'PUBLISHED', 'REMOVED'] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];
export const menuStatusSchema = z.enum(MENU_STATUSES);

/** At most this many dishes per meal. */
export const MENU_ITEMS_PER_MEAL_MAX = 30;

/** A calendar date, `YYYY-MM-DD` (India date for menus and bookings). */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Not a real date')
  .meta({ example: '2026-09-28' });

const mealsShape = Object.fromEntries(MEAL_SLOTS.map((meal) => [meal, z.array(z.string())])) as {
  [K in MealSlot]: z.ZodArray<z.ZodString>;
};
export const mealsSchema = z.object(mealsShape);
export type Meals = z.infer<typeof mealsSchema>;

export const dailyMenuSchema = z.object({
  id: z.string(),
  date: z.string(),
  status: menuStatusSchema,
  note: z.string().nullable(),
  meals: mealsSchema,
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type DailyMenu = z.infer<typeof dailyMenuSchema>;

/** The owner also sees why staff removed a menu. */
export const ownerDailyMenuSchema = dailyMenuSchema.extend({
  removedReason: z.string().nullable(),
});
export type OwnerDailyMenu = z.infer<typeof ownerDailyMenuSchema>;

const dishList = z
  .array(singleLineField('Dish', 100))
  .max(MENU_ITEMS_PER_MEAL_MAX, `At most ${MENU_ITEMS_PER_MEAL_MAX} dishes per meal`)
  .default([]);

/**
 * `PUT /business/places/:placeId/menus/:date`: replaces that day's dishes. `publish: true` publishes
 * in the same call ("Publish today's menu"); otherwise a new menu is saved as a draft and a published
 * one stays published with the new dishes.
 */
export const saveDailyMenuSchema = z
  .strictObject({
    meals: z.strictObject({
      BREAKFAST: dishList,
      LUNCH: dishList,
      SNACKS: dishList,
      DINNER: dishList,
    }),
    note: singleLineField('Note', 255).nullable().optional(),
    publish: z.boolean().optional(),
  })
  .refine((value) => MEAL_SLOTS.some((meal) => value.meals[meal].length > 0), {
    message: 'Add at least one dish',
    path: ['meals'],
  });
export type SaveDailyMenuRequest = z.output<typeof saveDailyMenuSchema>;

/** `POST /business/places/:placeId/menus/:date/copy`: copy another day's dishes onto this day. */
export const copyDailyMenuSchema = z.strictObject({ fromDate: dateOnlySchema });
export type CopyDailyMenuRequest = z.output<typeof copyDailyMenuSchema>;

export const listOwnerMenusQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type ListOwnerMenusQuery = z.output<typeof listOwnerMenusQuerySchema>;

/** Today's and tomorrow's published menus of one place. */
export const placeMenusSchema = z.object({
  today: dailyMenuSchema.nullable(),
  tomorrow: dailyMenuSchema.nullable(),
});
export type PlaceMenus = z.infer<typeof placeMenusSchema>;

/** A mess with its published menus, for "Today's mess menu" lists. */
export const messMenuCardSchema = z.object({
  place: placeCardSchema,
  today: dailyMenuSchema.nullable(),
  tomorrow: dailyMenuSchema.nullable(),
  saved: z.boolean(),
});
export type MessMenuCard = z.infer<typeof messMenuCardSchema>;

const coordinates = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
};

export const todaysMenusQuerySchema = z
  .object({
    ...coordinates,
    /** Only places the member saved. */
    saved: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both lat and lng, or neither',
  });
export type TodaysMenusQuery = z.output<typeof todaysMenusQuerySchema>;

/** `GET /service-types/:key/places`: live places offering a service, nearest first with a point. */
export const serviceTypePlacesQuerySchema = paginationQuerySchema
  .extend(coordinates)
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both lat and lng, or neither',
  });
export type ServiceTypePlacesQuery = z.output<typeof serviceTypePlacesQuerySchema>;

// ── Public view of a place's services ────────────────────────────────────────────────────────────

/** One live service of a place as students see it. `config` holds only student-facing settings. */
export const publicPlaceServiceSchema = serviceTypeSummarySchema.extend({
  description: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
});
export type PublicPlaceService = z.infer<typeof publicPlaceServiceSchema>;

// ── Catalogue (price lists: food menu, repairs, haircuts, seats) ─────────────────────────────────

export const MAX_ITEM_OPTIONS = 10;

export const itemOptionSchema = z.object({ name: z.string(), price: z.number().int().min(0) });
export type ItemOption = z.infer<typeof itemOptionSchema>;

export const serviceItemSchema = z.object({
  id: z.string(),
  serviceKey: z.string(),
  section: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().int().min(0),
  isVeg: z.boolean().nullable(),
  options: z.array(itemOptionSchema),
  available: z.boolean(),
  sortOrder: z.number().int(),
  /** Bookable items: minutes per slot (null = a whole-day booking). */
  durationMinutes: z.number().int().nullable(),
  /** Bookable items: bookings allowed per slot. */
  capacity: z.number().int().nullable(),
});
export type ServiceItem = z.infer<typeof serviceItemSchema>;

export const saveServiceItemSchema = z.strictObject({
  serviceKey: serviceTypeKeySchema,
  section: z.string().trim().max(60).default(''),
  name: singleLineField('Name', 100),
  description: singleLineField('Description', 300).nullable().optional(),
  price: z.number().int('Whole rupees only').min(0).max(100_000),
  isVeg: z.boolean().nullable().optional(),
  options: z
    .array(
      z.strictObject({
        name: singleLineField('Add-on', 60),
        price: z.number().int().min(0).max(10_000),
      }),
    )
    .max(MAX_ITEM_OPTIONS)
    .default([]),
  available: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .nullable()
    .optional(),
  capacity: z.number().int().min(1).max(500).nullable().optional(),
});
export type SaveServiceItemRequest = z.output<typeof saveServiceItemSchema>;

export const updateServiceItemSchema = saveServiceItemSchema
  .omit({ serviceKey: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdateServiceItemRequest = z.output<typeof updateServiceItemSchema>;

export const listServiceItemsQuerySchema = z.object({ service: serviceTypeKeySchema.optional() });
export type ListServiceItemsQuery = z.output<typeof listServiceItemsQuerySchema>;

/** Items of one section, for menus shown to students. */
export const itemSectionSchema = z.object({
  name: z.string(),
  items: z.array(serviceItemSchema),
});
export type ItemSection = z.infer<typeof itemSectionSchema>;

/** A live table request type ("Water", "Request bill"), configured per place. */
export const tableRequestTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().nullable(),
});
export type TableRequestType = z.infer<typeof tableRequestTypeSchema>;

export const placeServicesSchema = z.object({
  placeId: z.string(),
  slug: z.string(),
  name: z.string(),
  services: z.array(publicPlaceServiceSchema),
  menus: placeMenusSchema,
  /** Price lists per service key (food menu, repairs, ...), available items only, by section. */
  catalog: z.record(z.string(), z.array(itemSectionSchema)),
  /** What a student can ask for from a table (Table Service). */
  tableRequests: z.array(tableRequestTypeSchema),
});
export type PlaceServices = z.infer<typeof placeServicesSchema>;

// ── Admin ────────────────────────────────────────────────────────────────────────────────────────

const placeRef = z.object({ id: z.string(), slug: z.string(), name: z.string() });

export const adminPlaceServiceSchema = z.object({
  id: z.string(),
  place: placeRef,
  business: z.object({ id: z.string(), name: z.string() }).nullable(),
  serviceType: serviceTypeSummarySchema,
  enabled: z.boolean(),
  disabledByAdmin: z.boolean(),
  adminNote: z.string().nullable(),
  updatedAt: z.string(),
});
export type AdminPlaceService = z.infer<typeof adminPlaceServiceSchema>;

export const adminListPlaceServicesQuerySchema = paginationQuerySchema.extend({
  serviceType: serviceTypeKeySchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type AdminListPlaceServicesQuery = z.output<typeof adminListPlaceServicesQuerySchema>;

export const adminUpdatePlaceServiceSchema = z.strictObject({
  disabledByAdmin: z.boolean(),
  adminNote: singleLineField('Note', 255).nullable().optional(),
});
export type AdminUpdatePlaceServiceRequest = z.output<typeof adminUpdatePlaceServiceSchema>;

export const adminDailyMenuSchema = ownerDailyMenuSchema.extend({ place: placeRef });
export type AdminDailyMenu = z.infer<typeof adminDailyMenuSchema>;

export const adminListMenusQuerySchema = paginationQuerySchema.extend({
  date: dateOnlySchema.optional(),
  status: menuStatusSchema.optional(),
});
export type AdminListMenusQuery = z.output<typeof adminListMenusQuerySchema>;

/** Taking down a menu or an offer: the reason is shown to the business. */
export const moderationRemoveSchema = z.strictObject({
  reason: multiLineField('Reason', 255),
});
export type ModerationRemoveRequest = z.output<typeof moderationRemoveSchema>;
