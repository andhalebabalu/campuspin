import type { DuplicateCandidate, PlaceSubmission, PriceUnit, SubmissionStatus } from '@platform/contracts';
import type { CandidatePlace } from './duplicate-rules.js';

/**
 * Row -> response mapping, field by field (mirrors `place-mappers.ts`): a response is built from an
 * explicit list, never a spread, so a column added later cannot leak into the API by accident.
 */

export interface CandidateRow {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  address: string;
  phone: string | null;
  categories: Array<{ category: { id: string; parentId: string | null } }>;
}

export function toCandidatePlace(row: CandidateRow): CandidatePlace {
  const primary = row.categories[0]?.category ?? null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    phone: row.phone,
    primaryCategory: primary ? { id: primary.id, parentId: primary.parentId } : null,
  };
}

export interface SubmissionImageRow {
  id: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
}

export interface SubmissionRow {
  id: string;
  name: string;
  category: { id: string; slug: string; name: string };
  collegeId: string | null;
  address: string;
  city: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  priceAmount: number | null;
  priceUnit: PriceUnit | null;
  description: string | null;
  status: SubmissionStatus;
  submittedById: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  resultingPlaceId: string | null;
  duplicateOfPlaceId: string | null;
  // Stored as `Json?`; always written by this module as a `DuplicateCandidate[]` (see
  // `duplicate-rules.ts`), so reading it back is a narrowing, not a validation.
  duplicateCandidates: unknown;
  images: SubmissionImageRow[];
  createdAt: Date;
  updatedAt: Date;
}

function toStoredCandidates(value: unknown): DuplicateCandidate[] {
  return Array.isArray(value) ? (value as DuplicateCandidate[]) : [];
}

export function toPlaceSubmission(row: SubmissionRow): PlaceSubmission {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    collegeId: row.collegeId,
    address: row.address,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    priceAmount: row.priceAmount,
    priceUnit: row.priceUnit,
    description: row.description,
    status: row.status,
    submittedById: row.submittedById,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewNote: row.reviewNote,
    resultingPlaceId: row.resultingPlaceId,
    duplicateOfPlaceId: row.duplicateOfPlaceId,
    duplicateCandidates: toStoredCandidates(row.duplicateCandidates),
    images: row.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      altText: image.altText,
      sortOrder: image.sortOrder,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
