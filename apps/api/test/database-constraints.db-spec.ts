import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  createDb,
  inRollback,
  makeBusiness,
  makeCategory,
  makeCollege,
  makePlace,
  makeUser,
  type Tx,
} from './support/db.js';

/** The failing statement must be the LAST one; the transaction is rolled back either way. */
const P2002 = { code: 'P2002' };

describe('Real MySQL database: constraints keep the data valid', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('unique constraints prevent accidental duplicates', () => {
    it('rejects a duplicate college slug', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const first = await makeCollege(tx);
          await makeCollege(tx, { slug: first.slug });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('rejects a duplicate place slug and a duplicate category slug', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const first = await makePlace(tx, user.id);
          await makePlace(tx, user.id, { slug: first.slug });
        }),
      ).rejects.toMatchObject(P2002);

      await expect(
        inRollback(db, async (tx) => {
          const first = await makeCategory(tx);
          await makeCategory(tx, { slug: first.slug });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('rejects a duplicate email, ignoring letter case', async () => {
      await expect(
        inRollback(db, async (tx) => {
          await makeUser(tx, { email: 'Student.Case@Localhost.test' });
          await makeUser(tx, { email: 'student.case@localhost.test' });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('rejects saving the same place twice', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const place = await makePlace(tx, user.id);
          await tx.savedPlace.create({ data: { userId: user.id, placeId: place.id } });
          await tx.savedPlace.create({ data: { userId: user.id, placeId: place.id } });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('allows only one review per user per place', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const place = await makePlace(tx, user.id);
          await tx.review.create({ data: { placeId: place.id, userId: user.id, rating: 5 } });
          await tx.review.create({ data: { placeId: place.id, userId: user.id, rating: 4 } });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('allows only one report per user per review', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const author = await makeUser(tx);
          const reporter = await makeUser(tx);
          const place = await makePlace(tx, author.id);
          const review = await tx.review.create({
            data: { placeId: place.id, userId: author.id, rating: 1 },
          });
          const data = { reviewId: review.id, reportedById: reporter.id, reason: 'SPAM' as const };
          await tx.reviewReport.create({ data });
          await tx.reviewReport.create({ data });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('prevents a user being a member of the same business twice', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const owner = await makeUser(tx);
          const business = await makeBusiness(tx, owner.id);
          await tx.businessMember.create({
            data: { businessProfileId: business.id, userId: owner.id },
          });
          await tx.businessMember.create({
            data: { businessProfileId: business.id, userId: owner.id },
          });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('prevents a duplicate category attribute key, a duplicate place↔category link and a duplicate role grant', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const category = await makeCategory(tx);
          const data = { categoryId: category.id, key: 'k', name: 'K', dataType: 'TEXT' as const };
          await tx.categoryAttribute.create({ data });
          await tx.categoryAttribute.create({ data });
        }),
      ).rejects.toMatchObject(P2002);

      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const category = await makeCategory(tx);
          const place = await makePlace(tx, user.id);
          await tx.placeCategory.create({ data: { placeId: place.id, categoryId: category.id } });
          await tx.placeCategory.create({ data: { placeId: place.id, categoryId: category.id } });
        }),
      ).rejects.toMatchObject(P2002);

      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const role = await tx.role.create({
            data: { key: `ROLE_${Date.now()}`, name: 'Test role' },
          });
          await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
          await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('allows only ONE open claim per place and business, but keeps decided claims as history', async () => {
      const claimBase = async (tx: Tx) => {
        const owner = await makeUser(tx);
        const business = await makeBusiness(tx, owner.id);
        const place = await makePlace(tx, owner.id);
        return { owner, business, place, key: `${place.id}:${business.id}` };
      };

      // A second OPEN claim for the same place + business is rejected.
      await expect(
        inRollback(db, async (tx) => {
          const { owner, business, place, key } = await claimBase(tx);
          const data = {
            placeId: place.id,
            businessProfileId: business.id,
            requestedById: owner.id,
            activeKey: key,
          };
          await tx.placeClaim.create({ data });
          await tx.placeClaim.create({ data });
        }),
      ).rejects.toMatchObject(P2002);

      // Decided claims (activeKey NULL) can pile up: the claim history is preserved.
      const decided = await inRollback(db, async (tx) => {
        const { owner, business, place } = await claimBase(tx);
        const data = { placeId: place.id, businessProfileId: business.id, requestedById: owner.id };
        await tx.placeClaim.create({ data: { ...data, status: 'REJECTED' } });
        await tx.placeClaim.create({ data: { ...data, status: 'CANCELLED' } });
        return tx.placeClaim.count({ where: { placeId: place.id } });
      });
      expect(decided).toBe(2);
    });
  });

  describe('CHECK constraints reject impossible values', () => {
    const rejected = /constraint|check/i;

    it('accepts ratings 1..5 and rejects anything else', async () => {
      const stored = await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        const place = await makePlace(tx, user.id);
        return tx.review.create({ data: { placeId: place.id, userId: user.id, rating: 5 } });
      });
      expect(stored.rating).toBe(5);

      for (const rating of [0, 6, -1]) {
        await expect(
          inRollback(db, async (tx) => {
            const user = await makeUser(tx);
            const place = await makePlace(tx, user.id);
            await tx.review.create({ data: { placeId: place.id, userId: user.id, rating } });
          }),
        ).rejects.toThrow(rejected);
      }
    });

    it('rejects latitudes and longitudes outside the valid range', async () => {
      for (const coordinates of [
        { latitude: 91 },
        { latitude: -91 },
        { longitude: 181 },
        { longitude: -181 },
      ]) {
        await expect(inRollback(db, (tx) => makeCollege(tx, coordinates))).rejects.toThrow(
          rejected,
        );
        await expect(
          inRollback(db, async (tx) => {
            const user = await makeUser(tx);
            await makePlace(tx, user.id, coordinates);
          }),
        ).rejects.toThrow(rejected);
      }
    });

    it('rejects a negative price and a maximum price below the minimum', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          await makePlace(tx, user.id, { priceMin: -1 });
        }),
      ).rejects.toThrow(rejected);

      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          await makePlace(tx, user.id, { priceMin: 5000, priceMax: 3000 });
        }),
      ).rejects.toThrow(rejected);
    });

    it('rejects a year of study outside 1..10', async () => {
      await expect(inRollback(db, (tx) => makeUser(tx, { year: 0 }))).rejects.toThrow(rejected);
      await expect(inRollback(db, (tx) => makeUser(tx, { year: 11 }))).rejects.toThrow(rejected);
      await expect(inRollback(db, (tx) => makeUser(tx, { year: 3 }))).resolves.toMatchObject({
        year: 3,
      });
    });

    it('validates opening hours: weekday, HH:mm format, and a coherent open/closed/24h state', async () => {
      const hourOn = (data: Record<string, unknown>) =>
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const place = await makePlace(tx, user.id);
          await tx.placeHour.create({ data: { placeId: place.id, dayOfWeek: 1, ...data } });
        });

      // valid: normal, overnight, closed, 24 h
      await expect(hourOn({ openTime: '09:00', closeTime: '17:30' })).resolves.toBeUndefined();
      await expect(hourOn({ openTime: '22:00', closeTime: '02:00' })).resolves.toBeUndefined();
      await expect(hourOn({ isClosed: true })).resolves.toBeUndefined();
      await expect(hourOn({ is24Hours: true })).resolves.toBeUndefined();

      // invalid
      await expect(hourOn({ dayOfWeek: 8, openTime: '09:00', closeTime: '17:00' })).rejects.toThrow(
        rejected,
      );
      await expect(hourOn({ dayOfWeek: 0, openTime: '09:00', closeTime: '17:00' })).rejects.toThrow(
        rejected,
      );
      await expect(hourOn({ openTime: '25:00', closeTime: '17:00' })).rejects.toThrow(rejected);
      await expect(hourOn({ openTime: '9:00', closeTime: '17:00' })).rejects.toThrow(rejected);
      await expect(hourOn({ openTime: '09:60', closeTime: '17:00' })).rejects.toThrow(rejected);
      await expect(hourOn({ isClosed: true, is24Hours: true })).rejects.toThrow(rejected);
      await expect(hourOn({ openTime: '09:00' })).rejects.toThrow(rejected);
    });
  });

  describe('foreign keys reject rows that point at nothing', () => {
    it('rejects a place created by a user that does not exist', async () => {
      await expect(
        inRollback(db, (tx) => makePlace(tx, '00000000-0000-7000-8000-000000000000')),
      ).rejects.toThrow();
    });

    it('rejects a review for a place that does not exist', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          await tx.review.create({
            data: { placeId: '00000000-0000-7000-8000-000000000000', userId: user.id, rating: 3 },
          });
        }),
      ).rejects.toThrow();
    });
  });
});
