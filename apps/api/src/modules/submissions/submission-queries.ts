import type { Prisma } from '../../generated/prisma/client.js';
import { boundingBox } from '../../common/geo/bounding-box.js';

/**
 * Duplicate-detection candidate pool: statuses that are still "live enough" to collide with a new
 * suggestion. INACTIVE and REJECTED places are dead ends — a place a student suggests near one of
 * those is not a duplicate of it. A PENDING place (one created by an earlier, still-unreviewed
 * submission) IS a candidate, which is how "other pending suggestions are candidates too" ([02
 * §5.7](../../docs/02-architecture.md#57-suggest-a-place-duplicates-contributions)) is satisfied
 * without a separate query against `place_submissions`.
 */
const CANDIDATE_STATUSES: readonly string[] = ['DRAFT', 'PENDING', 'ACTIVE'];

/**
 * Widest radius any scoring signal uses (the original design's separate ~300 m / exact-phone /
 * ~2 km windows collapse into one pool: every candidate in it is fully scored, so a closer or
 * phone-matching candidate still scores higher — the radius only bounds pool MEMBERSHIP, not the
 * score). A phone match on a place further than this is treated as a coincidence, not scored at all
 * — simpler than a separate city-wide phone query, and documented as a deferred nuance.
 */
const CANDIDATE_RADIUS_METERS = 2000;

export function candidateFilter(center: {
  latitude: number;
  longitude: number;
}): Prisma.PlaceWhereInput {
  const box = boundingBox(center, CANDIDATE_RADIUS_METERS);
  return {
    status: { in: CANDIDATE_STATUSES } as Prisma.PlaceWhereInput['status'],
    latitude: { gte: box.minLatitude, lte: box.maxLatitude },
    ...(box.minLongitude !== null && box.maxLongitude !== null
      ? { longitude: { gte: box.minLongitude, lte: box.maxLongitude } }
      : {}),
  };
}

/** What duplicate scoring needs from a candidate place, including its primary category's group. */
export const CANDIDATE_SELECT = {
  id: true,
  name: true,
  slug: true,
  latitude: true,
  longitude: true,
  address: true,
  phone: true,
  categories: {
    where: { isPrimary: true },
    select: { category: { select: { id: true, parentId: true } } },
    take: 1,
  },
} satisfies Prisma.PlaceSelect;

export const SUBMISSION_IMAGES_SELECT = {
  select: { id: true, imageUrl: true, altText: true, sortOrder: true },
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
} satisfies Prisma.PlaceSubmission$imagesArgs;

export const SUBMISSION_SELECT = {
  id: true,
  name: true,
  category: { select: { id: true, slug: true, name: true } },
  collegeId: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  phone: true,
  priceAmount: true,
  priceUnit: true,
  description: true,
  status: true,
  submittedById: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
  resultingPlaceId: true,
  duplicateOfPlaceId: true,
  duplicateCandidates: true,
  images: SUBMISSION_IMAGES_SELECT,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PlaceSubmissionSelect;

export const NEWEST_ORDER_BY: Prisma.PlaceSubmissionOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];
export const OLDEST_ORDER_BY: Prisma.PlaceSubmissionOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];
