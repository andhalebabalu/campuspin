import type {
  ActiveStatus,
  AdminAmenity,
  AdminCategory,
  AdminCategoryGroup,
  AdminCategorySummary,
  Amenity,
  AttributeDataType,
  CategoryAttribute,
  CategoryDetail,
  CategoryGroup,
  CategoryRatingDimension,
  CategorySummary,
  PriceUnit,
} from '@platform/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { toOptions } from './category-queries.js';

/**
 * Row -> response mapping, written out field by field, never by spreading a database row: a column
 * added to a table later cannot leak into the API by accident, and a public response can never
 * carry a staff-only field.
 */

export interface AttributeRow {
  id: string;
  key: string;
  name: string;
  dataType: AttributeDataType;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  unit: string | null;
  options: Prisma.JsonValue | null;
  helpText: string | null;
  sortOrder: number;
}

export interface RatingDimensionRow {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
}

export interface SummaryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  defaultPriceUnit: PriceUnit | null;
}

export interface AdminSummaryRow extends SummaryRow {
  status: ActiveStatus;
}

export interface GroupRow extends SummaryRow {
  children: SummaryRow[];
}

export interface AdminGroupRow extends AdminSummaryRow {
  children: AdminSummaryRow[];
}

export interface DetailRow extends SummaryRow {
  parentId: string | null;
  attributes: AttributeRow[];
  ratingDimensions: RatingDimensionRow[];
}

export interface AdminDetailRow extends DetailRow {
  status: ActiveStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmenityRow {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export interface AdminAmenityRow extends AmenityRow {
  status: ActiveStatus;
}

export function toCategoryAttribute(row: AttributeRow): CategoryAttribute {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    dataType: row.dataType,
    required: row.required,
    filterable: row.filterable,
    searchable: row.searchable,
    unit: row.unit,
    options: toOptions(row.options),
    helpText: row.helpText,
    sortOrder: row.sortOrder,
  };
}

export function toCategoryRatingDimension(row: RatingDimensionRow): CategoryRatingDimension {
  return { id: row.id, key: row.key, label: row.label, sortOrder: row.sortOrder };
}

export function toCategorySummary(row: SummaryRow): CategorySummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    defaultPriceUnit: row.defaultPriceUnit,
  };
}

export function toCategoryGroup(row: GroupRow): CategoryGroup {
  return { ...toCategorySummary(row), children: row.children.map(toCategorySummary) };
}

export function toAdminCategorySummary(row: AdminSummaryRow): AdminCategorySummary {
  return { ...toCategorySummary(row), status: row.status };
}

export function toAdminCategoryGroup(row: AdminGroupRow): AdminCategoryGroup {
  return { ...toAdminCategorySummary(row), children: row.children.map(toAdminCategorySummary) };
}

export function toCategoryDetail(row: DetailRow): CategoryDetail {
  return {
    ...toCategorySummary(row),
    parentId: row.parentId,
    attributes: row.attributes.map(toCategoryAttribute),
    ratingDimensions: row.ratingDimensions.map(toCategoryRatingDimension),
  };
}

export function toAdminCategory(row: AdminDetailRow): AdminCategory {
  return {
    ...toCategoryDetail(row),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAmenity(row: AmenityRow): Amenity {
  return { id: row.id, key: row.key, name: row.name, icon: row.icon, sortOrder: row.sortOrder };
}

export function toAdminAmenity(row: AdminAmenityRow): AdminAmenity {
  return { ...toAmenity(row), status: row.status };
}
