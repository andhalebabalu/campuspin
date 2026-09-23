import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createDb, inRollback, makeCategory, makePlace, makeUser } from './support/db.js';

const P2002 = { code: 'P2002' }; // unique constraint
const P2003 = { code: 'P2003' }; // foreign key constraint

describe('Real MySQL database: categories, attributes, rating dimensions and amenities', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('uniqueness', () => {
    it('rejects a duplicate category slug', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const first = await makeCategory(tx);
          await makeCategory(tx, { slug: first.slug });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('rejects a duplicate attribute key within the same category, but allows it in another', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const category = await makeCategory(tx);
          await tx.categoryAttribute.create({
            data: { categoryId: category.id, key: 'seating', name: 'Seating', dataType: 'INTEGER' },
          });
          await tx.categoryAttribute.create({
            data: {
              categoryId: category.id,
              key: 'seating',
              name: 'Seating again',
              dataType: 'INTEGER',
            },
          });
        }),
      ).rejects.toMatchObject(P2002);

      await inRollback(db, async (tx) => {
        const a = await makeCategory(tx);
        const b = await makeCategory(tx);
        await tx.categoryAttribute.create({
          data: { categoryId: a.id, key: 'seating', name: 'Seating', dataType: 'INTEGER' },
        });
        await expect(
          tx.categoryAttribute.create({
            data: { categoryId: b.id, key: 'seating', name: 'Seating', dataType: 'INTEGER' },
          }),
        ).resolves.toBeDefined();
      });
    });

    it('rejects a duplicate rating-dimension key within the same category, but allows it in another', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const category = await makeCategory(tx);
          await tx.categoryRatingDimension.create({
            data: { categoryId: category.id, key: 'food', label: 'Food' },
          });
          await tx.categoryRatingDimension.create({
            data: { categoryId: category.id, key: 'food', label: 'Food again' },
          });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('rejects a duplicate amenity key', async () => {
      await expect(
        inRollback(db, async (tx) => {
          await tx.amenity.create({ data: { key: 'wifi-db-test', name: 'WiFi' } });
          await tx.amenity.create({ data: { key: 'wifi-db-test', name: 'WiFi again' } });
        }),
      ).rejects.toMatchObject(P2002);
    });
  });

  describe('a category self-relation (group -> children)', () => {
    it('lets a category reference an existing parent, and cascades nothing when the parent is untouched', async () => {
      await inRollback(db, async (tx) => {
        const group = await makeCategory(tx);
        const child = await makeCategory(tx, { parentId: group.id });
        expect((await tx.category.findUniqueOrThrow({ where: { id: child.id } })).parentId).toBe(
          group.id,
        );
      });
    });

    it('restricts deleting a group that still has a child (FK default RESTRICT)', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const group = await makeCategory(tx);
          await makeCategory(tx, { parentId: group.id });
          await tx.category.delete({ where: { id: group.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });
  });

  describe('referential integrity used by the API to refuse a delete', () => {
    it('restricts deleting an attribute that already has a value on a place', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const category = await makeCategory(tx);
          const attribute = await tx.categoryAttribute.create({
            data: { categoryId: category.id, key: 'seating', name: 'Seating', dataType: 'INTEGER' },
          });
          const place = await makePlace(tx, user.id);
          await tx.placeAttributeValue.create({
            data: { placeId: place.id, attributeId: attribute.id, valueNumber: 40 },
          });

          await tx.categoryAttribute.delete({ where: { id: attribute.id } });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it('allows deleting an attribute that has never been used', async () => {
      await inRollback(db, async (tx) => {
        const category = await makeCategory(tx);
        const attribute = await tx.categoryAttribute.create({
          data: { categoryId: category.id, key: 'seating', name: 'Seating', dataType: 'INTEGER' },
        });
        await expect(
          tx.categoryAttribute.delete({ where: { id: attribute.id } }),
        ).resolves.toBeDefined();
      });
    });
  });

  describe('the options JSON column', () => {
    it('round-trips a real ENUM options array through MariaDB', async () => {
      const options = [
        { value: 'veg', label: 'Veg' },
        { value: 'non_veg', label: 'Non-veg' },
      ];
      await inRollback(db, async (tx) => {
        const category = await makeCategory(tx);
        const attribute = await tx.categoryAttribute.create({
          data: { categoryId: category.id, key: 'diet', name: 'Diet', dataType: 'ENUM', options },
        });
        const reloaded = await tx.categoryAttribute.findUniqueOrThrow({
          where: { id: attribute.id },
        });
        expect(reloaded.options).toEqual(options);
      });
    });
  });
});
