import { PERMISSION_KEYS, ROLE_KEYS } from '@platform/contracts';
import { verifyPassword } from '../src/common/security/password-hasher.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { runSeed } from '../prisma/seed/index.js';
import { purgeDemoData } from '../prisma/seed/purge.js';
import { createDb, inRollback, makeCollege, makePlace, makeUser } from './support/db.js';

const SEED = {
  demo: true,
  adminEmail: 'seed-test-admin@localhost.test',
  adminPassword: 'ChangeMe123!',
};

describe('Seed data (run inside a rolled-back transaction)', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('seeds roles, permissions, categories, amenities and demo data, and is idempotent', async () => {
    const seeded = await inRollback(db, async (tx) => {
      const first = await runSeed(tx, SEED);
      const second = await runSeed(tx, SEED);

      const roles = await tx.role.findMany({
        include: { permissions: true },
        orderBy: { key: 'asc' },
      });
      const parents = await tx.category.findMany({
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
      });
      const children = await tx.category.count({ where: { parentId: { not: null } } });
      const mess = await tx.category.findUniqueOrThrow({
        where: { slug: 'mess' },
        include: { attributes: true, ratingDimensions: true, parent: true },
      });
      const admin = await tx.user.findUniqueOrThrow({
        where: { email: SEED.adminEmail },
        include: { userRoles: { include: { role: true } } },
      });
      const demoPlaces = await tx.place.findMany({ where: { isDemo: true } });
      const demoColleges = await tx.college.findMany({ where: { isDemo: true } });
      const nonDemoPlaces = await tx.place.count({ where: { isDemo: false } });
      const links = await tx.collegePlace.findMany();

      return {
        first,
        second,
        roles,
        parents,
        children,
        mess,
        admin,
        demoPlaces,
        demoColleges,
        nonDemoPlaces,
        links,
      };
    });

    // Running the seed a second time creates nothing.
    expect(seeded.second.after).toEqual(seeded.first.after);

    // Roles and permissions come from the shared contract.
    expect(seeded.roles.map((r) => r.key).sort()).toEqual([...ROLE_KEYS].sort());
    expect(seeded.first.after.permissions).toBe(PERMISSION_KEYS.length);
    const grants = Object.fromEntries(seeded.roles.map((r) => [r.key, r.permissions.length]));
    expect(grants.SUPER_ADMIN).toBe(PERMISSION_KEYS.length);
    expect(grants.STUDENT).toBeLessThan(grants.MODERATOR ?? 0);
    expect(grants.MODERATOR).toBeLessThan(grants.ADMIN ?? 0);

    // The category tree: 5 groups and the 19 categories from the brief, all data.
    expect(seeded.parents.map((p) => p.name)).toEqual([
      'Accommodation',
      'Food',
      'Study',
      'Daily Needs',
      'Transport',
    ]);
    expect(seeded.children).toBe(19);
    expect(seeded.mess.parent?.name).toBe('Food');
    expect(seeded.mess.attributes.map((a) => a.key).sort()).toEqual([
      'breakfast',
      'dinner',
      'lunch',
      'veg_nonveg',
    ]);
    expect(seeded.mess.ratingDimensions.map((d) => d.key).sort()).toEqual([
      'food',
      'hygiene',
      'price',
    ]);

    // The demo admin: SUPER_ADMIN, verified, and the password is stored only as an Argon2id hash.
    expect(seeded.admin.userRoles.map((ur) => ur.role.key)).toEqual(['SUPER_ADMIN']);
    expect(seeded.admin.emailVerifiedAt).not.toBeNull();
    expect(seeded.admin.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(seeded.admin.passwordHash).not.toContain(SEED.adminPassword);
    await expect(verifyPassword(seeded.admin.passwordHash, SEED.adminPassword)).resolves.toBe(true);
    await expect(verifyPassword(seeded.admin.passwordHash, 'wrong-password')).resolves.toBe(false);

    // Demo data is clearly marked and never mistakable for a real business.
    expect(seeded.demoPlaces).toHaveLength(14);
    expect(seeded.demoColleges).toHaveLength(3);
    for (const place of seeded.demoPlaces) {
      expect(place.name).toMatch(/\(Demo\)$/);
      expect(place.description).toMatch(/Not a real business/);
      expect(place.phone).toBeNull();
      expect(place.email).toBeNull();
    }
    for (const college of seeded.demoColleges) expect(college.name).toMatch(/\(Demo\)$/);

    // Distances are calculated: every link is within the college radius and positive.
    expect(seeded.links.length).toBeGreaterThan(seeded.demoPlaces.length);
    expect(seeded.links.every((l) => l.distanceMeters >= 0 && l.distanceMeters <= 5000)).toBe(true);
  });

  it('seeds only reference data when demo is off (the mode used in production)', async () => {
    const result = await inRollback(db, async (tx) => {
      const seeded = await runSeed(tx, { ...SEED, demo: false });
      return {
        seeded,
        demoPlaces: await tx.place.count({ where: { isDemo: true } }),
        admin: await tx.user.count({ where: { email: SEED.adminEmail } }),
      };
    });

    expect(result.seeded.after.roles).toBe(ROLE_KEYS.length);
    expect(result.seeded.after.categories).toBe(24);
    expect(result.admin).toBe(0);
    // No demo rows and no demo admin were created by this run.
    expect(result.seeded.after.places).toBe(result.seeded.before.places);
    expect(result.seeded.after.colleges).toBe(result.seeded.before.colleges);
  });

  it('purges demo data and demo accounts but keeps reference data and real rows', async () => {
    const result = await inRollback(db, async (tx) => {
      await runSeed(tx, SEED);

      // A non-demo college, a demo account with a review on a demo place (a dependent row).
      const realCollege = await makeCollege(tx, { isDemo: false });
      const reviewer = await makeUser(tx);
      const demoPlace = await tx.place.findFirstOrThrow({ where: { isDemo: true } });
      await tx.review.create({ data: { placeId: demoPlace.id, userId: reviewer.id, rating: 4 } });
      const realPlaceOwner = await tx.user.create({
        data: { name: 'Real owner', email: `real-${Date.now()}@example.org`, passwordHash: 'x' },
      });
      const realPlace = await makePlace(tx, realPlaceOwner.id, { isDemo: false });

      const purged = await purgeDemoData(tx);
      return {
        purged,
        demoPlaces: await tx.place.count({ where: { isDemo: true } }),
        demoColleges: await tx.college.count({ where: { isDemo: true } }),
        demoUsers: await tx.user.count({ where: { email: { endsWith: '@localhost.test' } } }),
        reviews: await tx.review.count({ where: { placeId: demoPlace.id } }),
        roles: await tx.role.count(),
        categories: await tx.category.count(),
        realCollegeKept: (await tx.college.count({ where: { id: realCollege.id } })) === 1,
        realPlaceKept: (await tx.place.count({ where: { id: realPlace.id } })) === 1,
        realOwnerKept: (await tx.user.count({ where: { id: realPlaceOwner.id } })) === 1,
      };
    });

    expect(result.purged.places).toBe(14);
    expect(result.purged.colleges).toBe(3);
    expect(result).toMatchObject({
      demoPlaces: 0,
      demoColleges: 0,
      demoUsers: 0,
      reviews: 0,
      roles: 5,
      categories: 24,
      realCollegeKept: true,
      realPlaceKept: true,
      realOwnerKept: true,
    });
  });
});
