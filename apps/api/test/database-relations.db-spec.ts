import { distanceMeters } from '../src/common/geo/haversine.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  createDb,
  inRollback,
  makeCategory,
  makeCollege,
  makePlace,
  makeUser,
} from './support/db.js';

describe('Real MySQL database: create, read and relate data', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('creates and reads a college with its images', async () => {
    const college = await inRollback(db, async (tx) => {
      const created = await makeCollege(tx, {
        name: 'नमुना महाविद्यालय (Demo)',
        images: { create: [{ imageUrl: 'https://example.com/a.jpg', sortOrder: 0 }] },
      });
      return tx.college.findUniqueOrThrow({
        where: { id: created.id },
        include: { images: true },
      });
    });

    // Devanagari survives the round trip (utf8mb4).
    expect(college.name).toBe('नमुना महाविद्यालय (Demo)');
    expect(college.status).toBe('DRAFT');
    expect(college.verificationStatus).toBe('PENDING');
    expect(college.country).toBe('India');
    expect(college.images).toHaveLength(1);
    expect(college.createdAt).toBeInstanceOf(Date);
    expect(college.updatedAt).toBeInstanceOf(Date);
  });

  it('builds a category tree (group → child) with category-specific attributes', async () => {
    const result = await inRollback(db, async (tx) => {
      const group = await makeCategory(tx, { name: 'Food (test)' });
      const mess = await makeCategory(tx, { name: 'Mess (test)', parentId: group.id });
      await tx.categoryAttribute.create({
        data: {
          categoryId: mess.id,
          key: 'veg_nonveg',
          name: 'Veg / Non-veg',
          dataType: 'ENUM',
          required: true,
          filterable: true,
          options: [
            { value: 'veg', label: 'Veg' },
            { value: 'non_veg', label: 'Non-veg' },
          ],
        },
      });
      return tx.category.findUniqueOrThrow({
        where: { id: group.id },
        include: { children: { include: { attributes: true } } },
      });
    });

    expect(result.children).toHaveLength(1);
    const attribute = result.children[0]?.attributes[0];
    expect(attribute?.key).toBe('veg_nonveg');
    expect(attribute?.required).toBe(true);
    // A JSON column round-trips as real JSON on MariaDB, not as a string.
    expect(attribute?.options).toEqual([
      { value: 'veg', label: 'Veg' },
      { value: 'non_veg', label: 'Non-veg' },
    ]);
  });

  it('lets ONE place belong to several categories', async () => {
    const place = await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const library = await makeCategory(tx, { name: 'Library (test)' });
      const readingRoom = await makeCategory(tx, { name: 'Reading Room (test)' });
      const created = await makePlace(tx, user.id, {
        categories: {
          create: [
            { categoryId: library.id, isPrimary: true },
            { categoryId: readingRoom.id, isPrimary: false },
          ],
        },
      });
      return tx.place.findUniqueOrThrow({
        where: { id: created.id },
        include: { categories: { include: { category: true }, orderBy: { isPrimary: 'desc' } } },
      });
    });

    expect(place.categories).toHaveLength(2);
    expect(place.categories[0]?.isPrimary).toBe(true);
    expect(place.categories.map((c) => c.category.name).sort()).toEqual([
      'Library (test)',
      'Reading Room (test)',
    ]);
  });

  it('lets ONE place serve several colleges, each with its own calculated distance', async () => {
    const { links, expected } = await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const near = await makeCollege(tx, { latitude: 19.096, longitude: 74.748 });
      const far = await makeCollege(tx, { latitude: 19.11, longitude: 74.761 });
      const place = await makePlace(tx, user.id, { latitude: 19.0975, longitude: 74.7495 });

      // Distance is DERIVED from the two coordinates, never typed in.
      const toNear = Math.round(distanceMeters(near, place));
      const toFar = Math.round(distanceMeters(far, place));
      await tx.collegePlace.createMany({
        data: [
          { collegeId: near.id, placeId: place.id, distanceMeters: toNear },
          { collegeId: far.id, placeId: place.id, distanceMeters: toFar },
        ],
      });

      return {
        links: await tx.collegePlace.findMany({
          where: { placeId: place.id },
          orderBy: { distanceMeters: 'asc' },
        }),
        expected: { toNear, toFar, nearId: near.id, farId: far.id },
      };
    });

    expect(links).toHaveLength(2);
    // "Nearest first" is a plain sorted read of the stored, calculated distance.
    expect(links.map((l) => l.collegeId)).toEqual([expected.nearId, expected.farId]);
    expect(links.map((l) => l.distanceMeters)).toEqual([expected.toNear, expected.toFar]);
    expect(expected.toNear).toBeLessThan(expected.toFar);
    expect(links.every((l) => l.mode === 'AUTO')).toBe(true);
  });

  it('stores and reads a complete place: images, amenities, hours, prices and typed attributes', async () => {
    const place = await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const category = await makeCategory(tx);
      const wifi = await tx.amenity.create({ data: { key: `wifi-${Date.now()}`, name: 'WiFi' } });
      const seating = await tx.categoryAttribute.create({
        data: { categoryId: category.id, key: 'seating', name: 'Seats', dataType: 'INTEGER' },
      });
      const occupancy = await tx.categoryAttribute.create({
        data: {
          categoryId: category.id,
          key: 'occupancy',
          name: 'Occupancy',
          dataType: 'MULTI_ENUM',
        },
      });

      const created = await makePlace(tx, user.id, {
        priceMin: 3500,
        priceMax: 6500,
        priceUnit: 'MONTH',
        images: { create: [{ imageUrl: 'https://example.com/p.jpg', isCover: true }] },
        amenities: { create: [{ amenityId: wifi.id }] },
        hours: {
          create: [
            {
              dayOfWeek: 1,
              openTime: '12:00',
              closeTime: '15:00',
              slotLabel: 'Lunch',
              sortOrder: 0,
            },
            {
              dayOfWeek: 1,
              openTime: '19:00',
              closeTime: '22:00',
              slotLabel: 'Dinner',
              sortOrder: 1,
            },
            { dayOfWeek: 7, isClosed: true },
          ],
        },
        priceOptions: {
          create: [
            { label: 'Single', amount: 6500, unit: 'MONTH' },
            { label: 'Triple', amount: 3500, unit: 'MONTH' },
          ],
        },
        attributeValues: {
          create: [
            { attributeId: seating.id, valueNumber: 60 },
            { attributeId: occupancy.id, valueJson: ['single', 'double'] },
          ],
        },
      });
      return tx.place.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          images: true,
          amenities: { include: { amenity: true } },
          hours: { orderBy: [{ dayOfWeek: 'asc' }, { sortOrder: 'asc' }] },
          priceOptions: true,
          attributeValues: true,
        },
      });
    });

    expect(place.images).toHaveLength(1);
    expect(place.amenities[0]?.amenity.name).toBe('WiFi');
    // Two slots on Monday (lunch + dinner) and a closed Sunday.
    expect(
      place.hours.map((h) => `${h.dayOfWeek}:${h.slotLabel ?? (h.isClosed ? 'closed' : '')}`),
    ).toEqual(['1:Lunch', '1:Dinner', '7:closed']);
    expect(place.priceOptions).toHaveLength(2);
    expect(place.priceMin).toBe(3500);
    expect(place.priceMax).toBe(6500);
    expect(place.attributeValues.find((v) => v.valueNumber === 60)).toBeDefined();
    expect(place.attributeValues.find((v) => v.valueJson !== null)?.valueJson).toEqual([
      'single',
      'double',
    ]);
    expect(place.status).toBe('DRAFT');
    expect(place.version).toBe(1);
    expect(place.ratingCount).toBe(0);
  });

  it('deleting a place removes its owned rows, but a category or creator in use is protected', async () => {
    const outcome = await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const category = await makeCategory(tx);
      const college = await makeCollege(tx);
      const place = await makePlace(tx, user.id, {
        categories: { create: [{ categoryId: category.id, isPrimary: true }] },
        images: { create: [{ imageUrl: 'https://example.com/x.jpg' }] },
        hours: { create: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' }] },
        colleges: { create: [{ collegeId: college.id, distanceMeters: 100 }] },
      });

      // RESTRICT: a category used by a place cannot be deleted.
      const categoryDelete = await tx.category.delete({ where: { id: category.id } }).then(
        () => 'deleted',
        () => 'blocked',
      );
      // RESTRICT: the user who created a place cannot be deleted.
      const userDelete = await tx.user.delete({ where: { id: user.id } }).then(
        () => 'deleted',
        () => 'blocked',
      );

      // CASCADE: deleting the place removes its images, hours, category links and college links.
      await tx.place.delete({ where: { id: place.id } });
      return {
        categoryDelete,
        userDelete,
        images: await tx.placeImage.count({ where: { placeId: place.id } }),
        hours: await tx.placeHour.count({ where: { placeId: place.id } }),
        categories: await tx.placeCategory.count({ where: { placeId: place.id } }),
        collegeLinks: await tx.collegePlace.count({ where: { placeId: place.id } }),
        collegeStillExists: (await tx.college.count({ where: { id: college.id } })) === 1,
      };
    });

    expect(outcome.categoryDelete).toBe('blocked');
    expect(outcome.userDelete).toBe('blocked');
    expect(outcome).toMatchObject({
      images: 0,
      hours: 0,
      categories: 0,
      collegeLinks: 0,
      collegeStillExists: true,
    });
  });

  it('models business ownership: a business with members owns places', async () => {
    const business = await inRollback(db, async (tx) => {
      const owner = await makeUser(tx);
      const manager = await makeUser(tx);
      const profile = await tx.businessProfile.create({
        data: {
          ownerId: owner.id,
          businessName: 'Test Business',
          slug: `test-business-${Date.now()}`,
          isDemo: true,
          members: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: manager.id, role: 'MANAGER' },
            ],
          },
        },
      });
      await makePlace(tx, owner.id, { businessProfileId: profile.id, status: 'PENDING' });
      return tx.businessProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: { members: true, places: true },
      });
    });

    expect(business.members.map((m) => m.role).sort()).toEqual(['MANAGER', 'OWNER']);
    expect(business.places).toHaveLength(1);
    expect(business.places[0]?.status).toBe('PENDING');
    expect(business.verificationStatus).toBe('PENDING');
  });
});
