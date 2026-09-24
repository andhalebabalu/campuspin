import { describe, expect, it } from 'vitest';
import {
  adminListReviewsQuerySchema,
  createReviewRequestSchema,
  hideReviewRequestSchema,
  listMyReviewsQuerySchema,
  listPlaceReviewsQuerySchema,
  listPlacesQuerySchema,
  removeReviewRequestSchema,
  restoreReviewRequestSchema,
  updateReviewRequestSchema,
} from './index.js';

const DIMENSION_ID = '01a0babd-b2d2-725f-9c0f-ddbc81685942';
const OTHER_DIMENSION_ID = '01a0babd-b2d2-725f-9c0f-ddbc81685943';

describe('createReviewRequestSchema', () => {
  it('accepts a bare overall rating and defaults dimensionRatings to []', () => {
    const parsed = createReviewRequestSchema.parse({ rating: 5 });
    expect(parsed).toEqual({ rating: 5, dimensionRatings: [] });
  });

  it.each([0, 6, 3.5, '4'])('rejects rating %j', (rating) => {
    expect(createReviewRequestSchema.safeParse({ rating }).success).toBe(false);
  });

  it('accepts a comment and dimension ratings', () => {
    const parsed = createReviewRequestSchema.parse({
      rating: 4,
      comment: '  Good food.\r\nFair price.  ',
      dimensionRatings: [
        { dimensionId: DIMENSION_ID, rating: 5 },
        { dimensionId: OTHER_DIMENSION_ID, rating: 3 },
      ],
    });
    expect(parsed.comment).toBe('Good food.\nFair price.');
    expect(parsed.dimensionRatings).toHaveLength(2);
  });

  it('rejects the same dimension twice', () => {
    const result = createReviewRequestSchema.safeParse({
      rating: 4,
      dimensionRatings: [
        { dimensionId: DIMENSION_ID, rating: 5 },
        { dimensionId: DIMENSION_ID, rating: 3 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['dimensionRatings', 1, 'dimensionId']);
  });

  it('rejects markup, an over-long comment and an empty one', () => {
    expect(createReviewRequestSchema.safeParse({ rating: 4, comment: '<b>hi</b>' }).success).toBe(
      false,
    );
    expect(
      createReviewRequestSchema.safeParse({ rating: 4, comment: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(createReviewRequestSchema.safeParse({ rating: 4, comment: '   ' }).success).toBe(false);
  });

  it('rejects unknown fields (status, userId, placeId cannot be set by the author)', () => {
    expect(createReviewRequestSchema.safeParse({ rating: 4, status: 'PUBLISHED' }).success).toBe(
      false,
    );
    expect(createReviewRequestSchema.safeParse({ rating: 4, userId: DIMENSION_ID }).success).toBe(
      false,
    );
  });
});

describe('updateReviewRequestSchema', () => {
  it('needs at least one field', () => {
    expect(updateReviewRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts comment: null (clear it) and an empty dimension list (clear them)', () => {
    expect(updateReviewRequestSchema.parse({ comment: null })).toEqual({ comment: null });
    expect(updateReviewRequestSchema.parse({ dimensionRatings: [] })).toEqual({
      dimensionRatings: [],
    });
  });

  it('accepts a rating alone', () => {
    expect(updateReviewRequestSchema.parse({ rating: 2 })).toEqual({ rating: 2 });
  });
});

describe('review list queries', () => {
  it('defaults the public list to the most recent first', () => {
    expect(listPlaceReviewsQuerySchema.parse({})).toMatchObject({ sort: 'recent', page: 1 });
    expect(listPlaceReviewsQuerySchema.safeParse({ sort: 'best' }).success).toBe(false);
  });

  it('checks placeId on /me/reviews is an id', () => {
    expect(listMyReviewsQuerySchema.safeParse({ placeId: 'sample-mess' }).success).toBe(false);
    expect(listMyReviewsQuerySchema.safeParse({ placeId: DIMENSION_ID }).success).toBe(true);
  });

  it('filters the admin queue by status', () => {
    expect(adminListReviewsQuerySchema.parse({ status: 'HIDDEN' })).toMatchObject({
      status: 'HIDDEN',
      sort: 'newest',
    });
    expect(adminListReviewsQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});

describe('moderation requests', () => {
  it('hide and remove need a reason; restore does not', () => {
    expect(hideReviewRequestSchema.safeParse({}).success).toBe(false);
    expect(removeReviewRequestSchema.safeParse({}).success).toBe(false);
    expect(hideReviewRequestSchema.safeParse({ reason: 'Abusive' }).success).toBe(true);
    expect(restoreReviewRequestSchema.safeParse(undefined).success).toBe(true);
    expect(restoreReviewRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe('listPlacesQuerySchema rating options', () => {
  it('accepts sort=rating and a minRating between 1 and 5', () => {
    expect(listPlacesQuerySchema.parse({ sort: 'rating', minRating: '4' })).toMatchObject({
      sort: 'rating',
      minRating: 4,
    });
    expect(listPlacesQuerySchema.parse({ minRating: '3.5' }).minRating).toBe(3.5);
  });

  it.each(['0', '5.5', 'good'])('rejects minRating=%s', (minRating) => {
    expect(listPlacesQuerySchema.safeParse({ minRating }).success).toBe(false);
  });
});
