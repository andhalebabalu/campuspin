import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createDb, inRollback, makeCategory, makePlace, makeUser } from './support/db.js';

const P2002 = { code: 'P2002' }; // unique constraint
const P2003 = { code: 'P2003' }; // foreign key constraint

describe('Real MySQL database: places and their categories, amenities, hours and prices', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('uniqueness', () => {
    it('rejects a duplicate place slug', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const first = await makePlace(tx, user.id);
          await makePlace(tx, user.id, { slug: first.slug });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('rejects two hour rows for the same place, day and position', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const place = await makePlace(tx, user.id);
          await tx.placeHour.create({
            data: { placeId: place.id, dayOfWeek: 1, is24Hours: true, sortOrder: 0 },
          });
          await tx.placeHour.create({
            data: { placeId: place.id, dayOfWeek: 1, isClosed: true, sortOrder: 0 },
          });
        }),
      ).rejects.toMatchObject(P2002);
    });
  });

  describe('referential integrity', () => {
    it('restricts deleting a category still classifying a place', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const category = await makeCategory(tx);
          const place = await makePlace(tx, user.id);
          await tx.placeCategory.create({
            data: { placeId: place.id, categoryId: category.id, isPrimary: true },
          });
          await tx.category.delete({ where: { id: category.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it('restricts deleting an amenity still attached to a place', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const place = await makePlace(tx, user.id);
          const amenity = await tx.amenity.create({
            data: { key: 'wifi-place-db-test', name: 'WiFi' },
          });
          await tx.placeAmenity.create({ data: { placeId: place.id, amenityId: amenity.id } });
          await tx.amenity.delete({ where: { id: amenity.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it('cascades deleting a place to its categories, amenities, hours, price options and images', async () => {
      await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        const category = await makeCategory(tx);
        const amenity = await tx.amenity.create({
          data: { key: 'wifi-place-db-test-2', name: 'WiFi' },
        });
        const place = await makePlace(tx, user.id);
        await tx.placeCategory.create({
          data: { placeId: place.id, categoryId: category.id, isPrimary: true },
        });
        await tx.placeAmenity.create({ data: { placeId: place.id, amenityId: amenity.id } });
        await tx.placeHour.create({
          data: { placeId: place.id, dayOfWeek: 1, is24Hours: true, sortOrder: 0 },
        });
        await tx.placePriceOption.create({
          data: { placeId: place.id, label: 'Monthly', amount: 3000, unit: 'MONTH', sortOrder: 0 },
        });
        await tx.placeImage.create({
          data: { placeId: place.id, imageUrl: 'https://example.com/a.jpg' },
        });

        await tx.place.delete({ where: { id: place.id } });

        expect(await tx.placeCategory.count({ where: { placeId: place.id } })).toBe(0);
        expect(await tx.placeAmenity.count({ where: { placeId: place.id } })).toBe(0);
        expect(await tx.placeHour.count({ where: { placeId: place.id } })).toBe(0);
        expect(await tx.placePriceOption.count({ where: { placeId: place.id } })).toBe(0);
        expect(await tx.placeImage.count({ where: { placeId: place.id } })).toBe(0);
        // The category and amenity themselves are untouched: only the links are cascaded.
        expect(await tx.category.findUnique({ where: { id: category.id } })).not.toBeNull();
        expect(await tx.amenity.findUnique({ where: { id: amenity.id } })).not.toBeNull();
      });
    });
  });

  describe('a place can belong to several categories, with exactly one primary', () => {
    it('stores multiple category links and their isPrimary flag', async () => {
      await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        const place = await makePlace(tx, user.id);
        const a = await makeCategory(tx);
        const b = await makeCategory(tx);
        await tx.placeCategory.create({
          data: { placeId: place.id, categoryId: a.id, isPrimary: true },
        });
        await tx.placeCategory.create({
          data: { placeId: place.id, categoryId: b.id, isPrimary: false },
        });

        const links = await tx.placeCategory.findMany({ where: { placeId: place.id } });
        expect(links).toHaveLength(2);
        expect(links.filter((link) => link.isPrimary)).toHaveLength(1);
      });
    });
  });
});
