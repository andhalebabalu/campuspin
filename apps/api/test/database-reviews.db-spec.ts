import type { PrismaClient } from '../src/generated/prisma/client.js';
import { lockPlace, refreshPlaceRating } from '../src/modules/reviews/place-rating.js';
import { createDb, inRollback, makeCategory, makePlace, makeUser, type Tx } from './support/db.js';

const P2003 = { code: 'P2003' }; // foreign key constraint

/** A place plus `ratings.length` reviewers, one review each with the given rating and status. */
async function placeWithReviews(
  tx: Tx,
  reviews: ReadonlyArray<{
    rating: number;
    status?: 'PUBLISHED' | 'HIDDEN' | 'REPORTED' | 'REMOVED';
  }>,
) {
  const creator = await makeUser(tx);
  const place = await makePlace(tx, creator.id, { status: 'ACTIVE' });
  for (const review of reviews) {
    const author = await makeUser(tx);
    await tx.review.create({
      data: {
        placeId: place.id,
        userId: author.id,
        rating: review.rating,
        status: review.status ?? 'PUBLISHED',
      },
    });
  }
  return place;
}

describe('Real MySQL database: reviews', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('refreshPlaceRating (the raw SQL behind every review write)', () => {
    it('averages visible reviews to two decimals and counts them', async () => {
      const result = await inRollback(db, async (tx) => {
        const place = await placeWithReviews(tx, [{ rating: 5 }, { rating: 4 }, { rating: 4 }]);
        expect(await lockPlace(tx, place.id)).toEqual({ status: 'ACTIVE' });
        return refreshPlaceRating(tx, place.id);
      });
      expect(result).toEqual({ ratingAverage: 4.33, ratingCount: 3 });
    });

    it('counts PUBLISHED and REPORTED, never HIDDEN or REMOVED', async () => {
      const result = await inRollback(db, async (tx) => {
        const place = await placeWithReviews(tx, [
          { rating: 5, status: 'PUBLISHED' },
          { rating: 3, status: 'REPORTED' },
          { rating: 1, status: 'HIDDEN' },
          { rating: 1, status: 'REMOVED' },
        ]);
        await lockPlace(tx, place.id);
        return refreshPlaceRating(tx, place.id);
      });
      expect(result).toEqual({ ratingAverage: 4, ratingCount: 2 });
    });

    it('resets to 0 / 0 when no visible review is left', async () => {
      const result = await inRollback(db, async (tx) => {
        const place = await placeWithReviews(tx, [{ rating: 2, status: 'HIDDEN' }]);
        await tx.place.update({
          where: { id: place.id },
          data: { ratingAverage: 2, ratingCount: 1 },
        });
        await lockPlace(tx, place.id);
        return refreshPlaceRating(tx, place.id);
      });
      expect(result).toEqual({ ratingAverage: 0, ratingCount: 0 });
    });

    it("leaves the place's updatedAt alone (a review is not an edit of the listing)", async () => {
      const [before, after] = await inRollback(db, async (tx) => {
        const place = await placeWithReviews(tx, [{ rating: 5 }]);
        const old = new Date('2026-01-01T00:00:00.000Z');
        await tx.$executeRaw`UPDATE places SET updatedAt = ${old} WHERE id = ${place.id}`;
        await lockPlace(tx, place.id);
        await refreshPlaceRating(tx, place.id);
        const reloaded = await tx.place.findUniqueOrThrow({ where: { id: place.id } });
        return [old, reloaded.updatedAt] as const;
      });
      expect(after.toISOString()).toBe(before.toISOString());
    });

    it('lockPlace answers null for a place that does not exist', async () => {
      const result = await inRollback(db, (tx) =>
        lockPlace(tx, '00000000-0000-7000-8000-000000000000'),
      );
      expect(result).toBeNull();
    });
  });

  describe('referential integrity', () => {
    it("deletes a review's dimension ratings with it", async () => {
      const remaining = await inRollback(db, async (tx) => {
        const place = await placeWithReviews(tx, []);
        const author = await makeUser(tx);
        const category = await makeCategory(tx);
        const dimension = await tx.categoryRatingDimension.create({
          data: { categoryId: category.id, key: 'food', label: 'Food' },
        });
        const review = await tx.review.create({
          data: {
            placeId: place.id,
            userId: author.id,
            rating: 4,
            ratings: { create: [{ dimensionId: dimension.id, rating: 5 }] },
          },
        });
        await tx.review.delete({ where: { id: review.id } });
        return tx.reviewRating.count({ where: { dimensionId: dimension.id } });
      });
      expect(remaining).toBe(0);
    });

    it('restricts deleting a rating dimension that a review rates', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const place = await placeWithReviews(tx, []);
          const author = await makeUser(tx);
          const category = await makeCategory(tx);
          const dimension = await tx.categoryRatingDimension.create({
            data: { categoryId: category.id, key: 'food', label: 'Food' },
          });
          await tx.review.create({
            data: {
              placeId: place.id,
              userId: author.id,
              rating: 4,
              ratings: { create: [{ dimensionId: dimension.id, rating: 5 }] },
            },
          });
          await tx.categoryRatingDimension.delete({ where: { id: dimension.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it('restricts deleting a place that has reviews (history survives)', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const place = await placeWithReviews(tx, [{ rating: 3 }]);
          await tx.place.delete({ where: { id: place.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });
  });
});
