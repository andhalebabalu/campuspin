import { looksLikeUuid } from '@platform/contracts';
import type { Prisma } from '../../generated/prisma/client.js';

/** What a public card needs. Nothing staff-only is ever selected for a public response. */
export const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  shortName: true,
  city: true,
  state: true,
  logoUrl: true,
  coverImageUrl: true,
  verificationStatus: true,
  // Read only to derive streams, management and courses for the card; never returned whole.
  description: true,
} satisfies Prisma.CollegeSelect;

const IMAGES_SELECT = {
  select: { id: true, imageUrl: true, altText: true, sortOrder: true },
  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
} satisfies Prisma.College$imagesArgs;

export const DETAIL_SELECT = {
  ...CARD_SELECT,
  description: true,
  address: true,
  country: true,
  website: true,
  latitude: true,
  longitude: true,
  serviceRadiusMeters: true,
  images: IMAGES_SELECT,
} satisfies Prisma.CollegeSelect;

export const ADMIN_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  isDemo: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CollegeSelect;

/**
 * Makes a percent sign, an underscore and a backslash in user text match themselves. Prisma's
 * `contains` builds a `LIKE` pattern and does not escape these, so without this a search for `%` would
 * match every row and `_` any single character. (It was never injection: the value is always a bound
 * parameter. It was simply the wrong meaning.) MySQL and MariaDB use the backslash as the default
 * `LIKE` escape character.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * `q` matches the name, short name or city as plain text; `city` is an exact match. Both are compared
 * with the column collation (`utf8mb4_unicode_ci`), so case and accents do not matter.
 */
export function searchFilter(filter: {
  q?: string | undefined;
  city?: string | undefined;
}): Prisma.CollegeWhereInput {
  const term = filter.q?.trim();
  const like = term ? escapeLike(term) : undefined;
  const city = filter.city?.trim();
  return {
    ...(like
      ? {
          OR: [
            { name: { contains: like } },
            { shortName: { contains: like } },
            { city: { contains: like } },
          ],
        }
      : {}),
    ...(city ? { city: { equals: city } } : {}),
  };
}

/** A UUID-shaped value is an id; anything else is a slug. (A slug can never look like an id.) */
export function idOrSlugFilter(value: string): { id: string } | { slug: string } {
  const trimmed = value.trim();
  return looksLikeUuid(trimmed) ? { id: trimmed.toLowerCase() } : { slug: trimmed.toLowerCase() };
}

/**
 * Active places serving each college. A place counts when its link is not EXCLUDED and the place
 * itself is ACTIVE (drafts, pending and rejected places are not on offer yet).
 */
export async function countActivePlaces(
  db: Pick<Prisma.TransactionClient, 'collegePlace'>,
  collegeIds: readonly string[],
): Promise<Map<string, number>> {
  if (collegeIds.length === 0) return new Map();
  const groups = await db.collegePlace.groupBy({
    by: ['collegeId'],
    where: {
      collegeId: { in: [...collegeIds] },
      mode: { not: 'EXCLUDED' },
      place: { status: 'ACTIVE' },
    },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.collegeId, group._count._all]));
}
