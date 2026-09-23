import { type CategoryOption, looksLikeUuid } from '@platform/contracts';
import { Prisma } from '../../generated/prisma/client.js';

/** A group, a child inside one, and the admin tree are all shown in this order. */
export const CATEGORY_ORDER_BY: Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

/** Attributes are always shown in the order staff set for them. */
const ATTRIBUTE_ORDER_BY: Prisma.CategoryAttributeOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

/** Rating dimensions are always shown in the order staff set for them. */
const RATING_DIMENSION_ORDER_BY: Prisma.CategoryRatingDimensionOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];

export const AMENITY_ORDER_BY: Prisma.AmenityOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

export const ATTRIBUTE_SELECT = {
  id: true,
  key: true,
  name: true,
  dataType: true,
  required: true,
  filterable: true,
  searchable: true,
  unit: true,
  options: true,
  helpText: true,
  sortOrder: true,
} satisfies Prisma.CategoryAttributeSelect;

export const RATING_DIMENSION_SELECT = {
  id: true,
  key: true,
  label: true,
  sortOrder: true,
} satisfies Prisma.CategoryRatingDimensionSelect;

/** What a public tree node (a group, or a child inside one) needs. */
export const SUMMARY_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  icon: true,
  sortOrder: true,
  defaultPriceUnit: true,
} satisfies Prisma.CategorySelect;

export const ADMIN_SUMMARY_SELECT = {
  ...SUMMARY_SELECT,
  status: true,
} satisfies Prisma.CategorySelect;

/** Only ACTIVE children, for the public tree. */
export const PUBLIC_CHILDREN_SELECT = {
  where: { status: 'ACTIVE' },
  select: SUMMARY_SELECT,
  orderBy: CATEGORY_ORDER_BY,
} satisfies Prisma.Category$childrenArgs;

/** Every child, any status, for the admin tree. */
export const ADMIN_CHILDREN_SELECT = {
  select: ADMIN_SUMMARY_SELECT,
  orderBy: CATEGORY_ORDER_BY,
} satisfies Prisma.Category$childrenArgs;

const ATTRIBUTES_SELECT = {
  select: ATTRIBUTE_SELECT,
  orderBy: ATTRIBUTE_ORDER_BY,
} satisfies Prisma.Category$attributesArgs;

const RATING_DIMENSIONS_SELECT = {
  select: RATING_DIMENSION_SELECT,
  orderBy: RATING_DIMENSION_ORDER_BY,
} satisfies Prisma.Category$ratingDimensionsArgs;

export const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  parentId: true,
  attributes: ATTRIBUTES_SELECT,
  ratingDimensions: RATING_DIMENSIONS_SELECT,
} satisfies Prisma.CategorySelect;

export const ADMIN_DETAIL_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

export const AMENITY_SELECT = {
  id: true,
  key: true,
  name: true,
  icon: true,
  sortOrder: true,
} satisfies Prisma.AmenitySelect;

export const ADMIN_AMENITY_SELECT = {
  ...AMENITY_SELECT,
  status: true,
} satisfies Prisma.AmenitySelect;

/** A UUID-shaped value is an id; anything else is a slug. (A slug can never look like an id.) */
export function idOrSlugFilter(value: string): { id: string } | { slug: string } {
  const trimmed = value.trim();
  return looksLikeUuid(trimmed) ? { id: trimmed.toLowerCase() } : { slug: trimmed.toLowerCase() };
}

/**
 * `CategoryAttribute.options` is stored as free-form JSON (Prisma's `Json?`). Only this API ever
 * writes it, always through `categoryOptionSchema`, so a plain cast back is safe; this function is
 * the one place that cast happens, so a future format change has one call site to update.
 */
export function toOptions(value: Prisma.JsonValue | null): CategoryOption[] | null {
  return value === null ? null : (value as unknown as CategoryOption[]);
}

/**
 * The reverse of `toOptions`, for writing `options` back. `undefined` means "leave untouched" (the
 * key is omitted from the update), `null` means "clear it" and must be `Prisma.DbNull` (a JSON
 * column's own `null` value needs that sentinel, not a plain JS `null`, or Prisma rejects the write).
 */
export function fromOptions(
  value: readonly CategoryOption[] | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.DbNull : value;
}
