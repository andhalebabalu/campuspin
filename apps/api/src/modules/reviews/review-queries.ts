import type { Prisma } from '../../generated/prisma/client.js';
import { VISIBLE_REVIEW_STATUSES } from './review-rules.js';

export const DIMENSION_RATINGS_SELECT = {
  select: {
    rating: true,
    dimension: { select: { id: true, key: true, label: true, sortOrder: true } },
  },
  orderBy: [{ dimension: { sortOrder: 'asc' } }, { dimension: { label: 'asc' } }],
} satisfies Prisma.Review$ratingsArgs;

/** What a public review needs. The author's name only (turned into a display name), nothing else. */
export const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  user: { select: { name: true } },
  ratings: DIMENSION_RATINGS_SELECT,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReviewSelect;

export const REVIEW_SELECT = {
  ...PUBLIC_REVIEW_SELECT,
  place: { select: { id: true, slug: true, name: true } },
  userId: true,
  status: true,
  moderationNote: true,
  moderatedById: true,
  moderatedAt: true,
} satisfies Prisma.ReviewSelect;

export const visibleOnly = {
  status: { in: [...VISIBLE_REVIEW_STATUSES] },
} satisfies Prisma.ReviewWhereInput;

/** Explicitly typed and mutable: a Prisma `orderBy` array must never be an `as const` tuple. */
export const PUBLIC_ORDER_BY: Record<
  'recent' | 'highest' | 'lowest',
  Prisma.ReviewOrderByWithRelationInput[]
> = {
  recent: [{ createdAt: 'desc' }, { id: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

export const ADMIN_ORDER_BY: Record<'newest' | 'oldest', Prisma.ReviewOrderByWithRelationInput[]> =
  {
    newest: [{ createdAt: 'desc' }, { id: 'desc' }],
    oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  };
