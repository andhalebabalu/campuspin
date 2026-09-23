import { z } from 'zod';
import {
  createSlugSchema,
  idOrSlugField,
  machineKeyField,
  multiLineField,
  singleLineField,
  uuidSchema,
} from './text.js';

/**
 * Category, attribute, rating-dimension and amenity contracts. The category tree is two levels
 * (a group such as "Accommodation", containing categories such as "PG" and "Hostel"); attributes
 * and rating dimensions belong to a leaf category, amenities are a flat list any place can use.
 *
 * The dataset is small and staff-curated (tens of rows, not thousands), so admin reads return the
 * whole tree or the whole amenity list rather than a paginated page.
 */

export const ACTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];
export const activeStatusSchema = z.enum(ACTIVE_STATUSES);

export const ATTRIBUTE_DATA_TYPES = [
  'BOOLEAN',
  'INTEGER',
  'DECIMAL',
  'TEXT',
  'ENUM',
  'MULTI_ENUM',
  'DATE',
] as const;
export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPES)[number];
export const attributeDataTypeSchema = z.enum(ATTRIBUTE_DATA_TYPES);

/** Data types whose values come from a fixed list, so they need `options`. */
const CHOICE_DATA_TYPES: readonly AttributeDataType[] = ['ENUM', 'MULTI_ENUM'];

export const PRICE_UNITS = [
  'ONE_TIME',
  'HOUR',
  'DAY',
  'WEEK',
  'MONTH',
  'SEMESTER',
  'YEAR',
  'MEAL',
  'PAGE',
  'KG',
  'TRIP',
] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];
export const priceUnitSchema = z.enum(PRICE_UNITS);

export const MAX_ATTRIBUTE_OPTIONS = 50;
const SORT_ORDER_MAX = 10_000;
const sortOrderField = z.number().int().min(0).max(SORT_ORDER_MAX);

/** No public route under `/categories` collides with a slug today; kept for parity with colleges. */
const RESERVED_CATEGORY_SLUGS: readonly string[] = [];

export const categorySlugSchema = createSlugSchema({
  reservedWords: RESERVED_CATEGORY_SLUGS,
  example: 'mess',
  minLength: 2,
  maxLength: 100,
});

/** The `:idOrSlug` of a public category URL. */
export const categoryIdOrSlugSchema = idOrSlugField('mess');

// ── Attributes and rating dimensions ────────────────────────────────────────────────────────────

export const categoryOptionSchema = z.object({
  value: machineKeyField('Option value', 60, 'veg'),
  label: singleLineField('Option label', 100).meta({ example: 'Veg' }),
});
export type CategoryOption = z.infer<typeof categoryOptionSchema>;

export const categoryAttributeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  dataType: attributeDataTypeSchema,
  required: z.boolean(),
  filterable: z.boolean(),
  searchable: z.boolean(),
  unit: z.string().nullable(),
  options: z.array(categoryOptionSchema).nullable(),
  helpText: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type CategoryAttribute = z.infer<typeof categoryAttributeSchema>;

export const categoryRatingDimensionSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
});
export type CategoryRatingDimension = z.infer<typeof categoryRatingDimensionSchema>;

// ── Public reads ─────────────────────────────────────────────────────────────────────────────────

export const categorySummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  defaultPriceUnit: priceUnitSchema.nullable(),
});
export type CategorySummary = z.infer<typeof categorySummarySchema>;

/** `GET /categories`: a group and its (active) children, in display order. */
export const categoryGroupSchema = categorySummarySchema.extend({
  children: z.array(categorySummarySchema),
});
export type CategoryGroup = z.infer<typeof categoryGroupSchema>;

/** `GET /categories/:idOrSlug`: works for a group (empty attributes/dimensions) or a leaf category. */
export const categoryDetailSchema = categorySummarySchema.extend({
  parentId: z.string().nullable(),
  attributes: z.array(categoryAttributeSchema),
  ratingDimensions: z.array(categoryRatingDimensionSchema),
});
export type CategoryDetail = z.infer<typeof categoryDetailSchema>;

export const amenitySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type Amenity = z.infer<typeof amenitySchema>;

// ── Admin reads ──────────────────────────────────────────────────────────────────────────────────

export const adminCategorySummarySchema = categorySummarySchema.extend({
  status: activeStatusSchema,
});
export type AdminCategorySummary = z.infer<typeof adminCategorySummarySchema>;

/** `GET /admin/categories`: the full tree, every status, groups and children alike. */
export const adminCategoryGroupSchema = adminCategorySummarySchema.extend({
  children: z.array(adminCategorySummarySchema),
});
export type AdminCategoryGroup = z.infer<typeof adminCategoryGroupSchema>;

export const adminCategorySchema = categoryDetailSchema.extend({
  status: activeStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminCategory = z.infer<typeof adminCategorySchema>;

export const adminAmenitySchema = amenitySchema.extend({ status: activeStatusSchema });
export type AdminAmenity = z.infer<typeof adminAmenitySchema>;

// ── Admin: categories ────────────────────────────────────────────────────────────────────────────

const categoryFields = {
  name: singleLineField('Name', 100).meta({ example: 'Mess' }),
  description: multiLineField('Description', 500).meta({ example: 'Monthly meal plans.' }),
  icon: singleLineField('Icon', 50).meta({ example: 'utensils' }),
};

/**
 * `POST /admin/categories`. Omit `parentId` to create a top-level GROUP (e.g. "Food"); set it to the
 * id of an existing group to create a category inside it (e.g. "Mess" inside "Food"). The tree is
 * exactly two levels: a category that already has a parent cannot itself be used as a parent (the
 * service checks this, since it needs a database lookup). `parentId` cannot be changed afterwards.
 */
export const createCategoryRequestSchema = z.strictObject({
  name: categoryFields.name,
  slug: categorySlugSchema.optional(),
  description: categoryFields.description.optional(),
  icon: categoryFields.icon.optional(),
  parentId: uuidSchema.optional(),
  sortOrder: sortOrderField.default(0),
  defaultPriceUnit: priceUnitSchema.optional(),
});
export type CreateCategoryRequest = z.output<typeof createCategoryRequestSchema>;

/**
 * `PATCH /admin/categories/:id`. Every field is optional and only what is sent changes; optional
 * text can be cleared with `null`. `parentId` and `status` are not editable here: moving a category
 * to a different group is not supported, and status has its own activate/deactivate actions.
 */
export const updateCategoryRequestSchema = z
  .strictObject({
    name: categoryFields.name.optional(),
    description: categoryFields.description.nullable().optional(),
    icon: categoryFields.icon.nullable().optional(),
    sortOrder: sortOrderField.optional(),
    defaultPriceUnit: priceUnitSchema.nullable().optional(),
    slug: categorySlugSchema.optional(),
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
export type UpdateCategoryRequest = z.output<typeof updateCategoryRequestSchema>;

/** Optional body of the activate / deactivate actions on a category or an amenity. */
export const categoryActionRequestSchema = z
  .strictObject({
    reason: singleLineField('Reason', 500)
      .optional()
      .meta({ example: 'Merged into another category' }),
  })
  .optional();
export type CategoryActionRequest = z.output<typeof categoryActionRequestSchema>;

// ── Admin: attributes ────────────────────────────────────────────────────────────────────────────

/** True when `options` has a repeated `value` (each option must be selectable unambiguously). */
function hasDuplicateOptionValues(options: readonly CategoryOption[]): boolean {
  const values = options.map((option) => option.value);
  return new Set(values).size !== values.length;
}

/**
 * `POST /admin/categories/:id/attributes`. `key` is permanent: it is how a place's value for this
 * attribute is looked up, so it is never edited afterwards, only `dataType` alongside it (an ENUM
 * needs `options`; other types must not have any).
 */
export const createCategoryAttributeRequestSchema = z
  .strictObject({
    key: machineKeyField('Key', 60, 'seating_capacity'),
    name: singleLineField('Name', 100).meta({ example: 'Seating capacity' }),
    dataType: attributeDataTypeSchema,
    required: z.boolean().default(false),
    filterable: z.boolean().default(false),
    searchable: z.boolean().default(false),
    unit: singleLineField('Unit', 20).optional().meta({ example: 'seats' }),
    options: z.array(categoryOptionSchema).max(MAX_ATTRIBUTE_OPTIONS).optional(),
    helpText: singleLineField('Help text', 255).optional(),
    sortOrder: sortOrderField.default(0),
  })
  .check((ctx) => {
    const { dataType, options } = ctx.value;
    const needsOptions = CHOICE_DATA_TYPES.includes(dataType);
    if (needsOptions && (!options || options.length === 0)) {
      ctx.issues.push({
        code: 'custom',
        message: 'ENUM and MULTI_ENUM attributes need at least one option',
        input: options,
        path: ['options'],
      });
    } else if (!needsOptions && options && options.length > 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'Only ENUM and MULTI_ENUM attributes take options',
        input: options,
        path: ['options'],
      });
    } else if (options && hasDuplicateOptionValues(options)) {
      ctx.issues.push({
        code: 'custom',
        message: 'Option values must be unique',
        input: options,
        path: ['options'],
      });
    }
  });
export type CreateCategoryAttributeRequest = z.output<typeof createCategoryAttributeRequestSchema>;

/**
 * `PATCH /admin/categories/:id/attributes/:attributeId`. `key` and `dataType` are not editable
 * (recreate the attribute instead); the options-required-for-ENUM rule is re-checked by the service
 * against the attribute's existing `dataType`, since a patch here does not repeat it.
 */
export const updateCategoryAttributeRequestSchema = z
  .strictObject({
    name: singleLineField('Name', 100).optional(),
    required: z.boolean().optional(),
    filterable: z.boolean().optional(),
    searchable: z.boolean().optional(),
    unit: singleLineField('Unit', 20).nullable().optional(),
    options: z.array(categoryOptionSchema).max(MAX_ATTRIBUTE_OPTIONS).nullable().optional(),
    helpText: singleLineField('Help text', 255).nullable().optional(),
    sortOrder: sortOrderField.optional(),
  })
  .check((ctx) => {
    if (Object.keys(ctx.value).length === 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send at least one field to change',
        input: ctx.value,
      });
    }
    const { options } = ctx.value;
    if (options && hasDuplicateOptionValues(options)) {
      ctx.issues.push({
        code: 'custom',
        message: 'Option values must be unique',
        input: options,
        path: ['options'],
      });
    }
  });
export type UpdateCategoryAttributeRequest = z.output<typeof updateCategoryAttributeRequestSchema>;

// ── Admin: rating dimensions ─────────────────────────────────────────────────────────────────────

/** `POST /admin/categories/:id/rating-dimensions`. `key` is permanent (reviews store it). */
export const createCategoryRatingDimensionRequestSchema = z.strictObject({
  key: machineKeyField('Key', 60, 'cleanliness'),
  label: singleLineField('Label', 100).meta({ example: 'Cleanliness' }),
  sortOrder: sortOrderField.default(0),
});
export type CreateCategoryRatingDimensionRequest = z.output<
  typeof createCategoryRatingDimensionRequestSchema
>;

export const updateCategoryRatingDimensionRequestSchema = z
  .strictObject({
    label: singleLineField('Label', 100).optional(),
    sortOrder: sortOrderField.optional(),
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
export type UpdateCategoryRatingDimensionRequest = z.output<
  typeof updateCategoryRatingDimensionRequestSchema
>;

// ── Admin: amenities ─────────────────────────────────────────────────────────────────────────────

/** `POST /admin/amenities`. `key` is permanent (places reference it). */
export const createAmenityRequestSchema = z.strictObject({
  key: machineKeyField('Key', 60, 'wifi'),
  name: singleLineField('Name', 100).meta({ example: 'WiFi' }),
  icon: singleLineField('Icon', 50).optional().meta({ example: 'wifi' }),
  sortOrder: sortOrderField.default(0),
});
export type CreateAmenityRequest = z.output<typeof createAmenityRequestSchema>;

export const updateAmenityRequestSchema = z
  .strictObject({
    name: singleLineField('Name', 100).optional(),
    icon: singleLineField('Icon', 50).nullable().optional(),
    sortOrder: sortOrderField.optional(),
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
export type UpdateAmenityRequest = z.output<typeof updateAmenityRequestSchema>;

export const amenityActionRequestSchema = categoryActionRequestSchema;
export type AmenityActionRequest = CategoryActionRequest;
