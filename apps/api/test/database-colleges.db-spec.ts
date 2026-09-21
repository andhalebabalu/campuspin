import type { PrismaClient } from '../src/generated/prisma/client.js';
import { distanceMeters } from '../src/common/geo/haversine.js';
import type { PrismaService } from '../src/infra/database/prisma.service.js';
import { CollegeProximityService } from '../src/modules/colleges/college-proximity.service.js';
import { createDb, inRollback, makeCollege, makePlace, makeUser } from './support/db.js';
import { destination, seededRandom } from './support/geo.js';

// Far from the demo colleges (Ahilyanagar, 19.09 N 74.75 E) so nothing here touches their places.
const ORIGIN = { latitude: 19.5, longitude: 75.5 };

describe('Real MySQL database: college proximity', () => {
  let db: PrismaClient;
  // Every call passes its own transaction, so the service never uses this connection itself.
  const service = () => new CollegeProximityService(undefined as unknown as PrismaService);

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('reproduces exactly the links the Phase 2 seed created for the demo colleges', async ({
    skip,
  }) => {
    const outcome = await inRollback(db, async (tx) => {
      const colleges = await tx.college.findMany({ where: { isDemo: true }, select: { id: true } });
      const snapshot = () =>
        tx.collegePlace.findMany({
          where: { college: { isDemo: true }, place: { isDemo: true } },
          orderBy: [{ collegeId: 'asc' }, { placeId: 'asc' }],
          select: { collegeId: true, placeId: true, mode: true, distanceMeters: true },
        });

      const before = await snapshot();
      if (colleges.length === 0 || before.length === 0) return 'no-demo-data' as const;

      const results = [];
      for (const college of colleges) results.push(await service().recompute(college.id, tx));
      return { before, after: await snapshot(), results };
    });

    if (outcome === 'no-demo-data') return skip('the demo data was purged (npm run db:purge-demo)');
    // Same rule, same rounding: nothing to create, rewrite or remove, and every distance is identical.
    expect(outcome.after).toEqual(outcome.before);
    for (const result of outcome.results) {
      expect(result).toMatchObject({ created: 0, rewritten: 0, refreshedOverrides: 0, removed: 0 });
    }
  });

  it('links exactly the places within the radius, with the rounded straight-line distance', async () => {
    await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const college = await makeCollege(tx, { ...ORIGIN, serviceRadiusMeters: 1000 });
      const near = await makePlace(tx, user.id, destination(ORIGIN, 0, 120));
      const edge = await makePlace(tx, user.id, destination(ORIGIN, 135, 990));
      await makePlace(tx, user.id, destination(ORIGIN, 270, 1300));
      await makePlace(tx, user.id, destination(ORIGIN, 90, 50_000));

      const result = await service().recompute(college.id, tx);

      const links = await tx.collegePlace.findMany({ where: { collegeId: college.id } });
      expect(links.map((link) => link.placeId).sort()).toEqual([near.id, edge.id].sort());
      for (const link of links) {
        const place = link.placeId === near.id ? near : edge;
        expect(link.mode).toBe('AUTO');
        expect(link.distanceMeters).toBe(Math.round(distanceMeters(ORIGIN, place)));
      }
      expect(result).toEqual({
        created: 2,
        rewritten: 0,
        refreshedOverrides: 0,
        removed: 0,
        total: 2,
      });
    });
  });

  it('is idempotent: a second recompute changes nothing', async () => {
    await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const college = await makeCollege(tx, { ...ORIGIN, serviceRadiusMeters: 2000 });
      for (const [bearing, meters] of [
        [0, 100],
        [90, 900],
        [180, 1500],
      ] as const) {
        await makePlace(tx, user.id, destination(ORIGIN, bearing, meters));
      }
      await service().recompute(college.id, tx);
      const first = await tx.collegePlace.findMany({
        where: { collegeId: college.id },
        orderBy: { placeId: 'asc' },
      });

      const again = await service().recompute(college.id, tx);

      expect(again).toMatchObject({
        created: 0,
        rewritten: 0,
        refreshedOverrides: 0,
        removed: 0,
        total: 3,
      });
      expect(
        await tx.collegePlace.findMany({
          where: { collegeId: college.id },
          orderBy: { placeId: 'asc' },
        }),
      ).toEqual(first);
    });
  });

  it('follows the college when it moves, and never disturbs a staff decision', async () => {
    await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const college = await makeCollege(tx, { ...ORIGIN, serviceRadiusMeters: 1000 });
      const westPlace = await makePlace(tx, user.id, destination(ORIGIN, 270, 400));
      const eastPlace = await makePlace(tx, user.id, destination(ORIGIN, 90, 400));
      const pinned = await makePlace(tx, user.id, destination(ORIGIN, 0, 9000));
      await service().recompute(college.id, tx);
      await tx.collegePlace.create({
        data: { collegeId: college.id, placeId: pinned.id, mode: 'PINNED', distanceMeters: 9000 },
      });
      await tx.collegePlace.update({
        where: { collegeId_placeId: { collegeId: college.id, placeId: eastPlace.id } },
        data: { mode: 'EXCLUDED' },
      });

      // Move 1.2 km east: the west place drops out; the excluded and pinned decisions stay.
      const moved = destination(ORIGIN, 90, 1200);
      await tx.college.update({ where: { id: college.id }, data: moved });
      const result = await service().recompute(college.id, tx);

      const links = Object.fromEntries(
        (await tx.collegePlace.findMany({ where: { collegeId: college.id } })).map((link) => [
          link.placeId,
          link,
        ]),
      );
      expect(links[westPlace.id]).toBeUndefined();
      expect(links[eastPlace.id]?.mode).toBe('EXCLUDED');
      expect(links[pinned.id]?.mode).toBe('PINNED');
      expect(links[eastPlace.id]?.distanceMeters).toBe(
        Math.round(distanceMeters(moved, eastPlace)),
      );
      expect(links[pinned.id]?.distanceMeters).toBe(Math.round(distanceMeters(moved, pinned)));
      expect(result.removed).toBe(1);
      expect(result.refreshedOverrides).toBe(2);
    });
  });

  it('finds exactly the places a full scan would (the bounding box loses none, on real DOUBLE columns)', async () => {
    await inRollback(db, async (tx) => {
      const random = seededRandom(424242);
      const user = await makeUser(tx);
      const radius = 3000;
      const college = await makeCollege(tx, { ...ORIGIN, serviceRadiusMeters: radius });

      // 150 places scattered out to 2.5x the radius in every direction, all at once.
      const placed: Array<Awaited<ReturnType<typeof makePlace>>> = [];
      for (let index = 0; index < 150; index += 1) {
        const at = destination(ORIGIN, random() * 360, random() * radius * 2.5);
        placed.push(await makePlace(tx, user.id, at));
      }

      await service().recompute(college.id, tx);

      const linked = new Set(
        (await tx.collegePlace.findMany({ where: { collegeId: college.id } })).map(
          (link) => link.placeId,
        ),
      );
      const expected = placed
        .filter((place) => Math.round(distanceMeters(ORIGIN, place)) <= radius)
        .map((place) => place.id);
      expect(expected.length).toBeGreaterThan(20); // the scatter really put many inside...
      expect(expected.length).toBeLessThan(150); // ...and many outside
      expect([...linked].filter((id) => placed.some((place) => place.id === id)).sort()).toEqual(
        expected.sort(),
      );
    });
  });

  it('counts links of every place status, so a place is linked before it is approved', async () => {
    await inRollback(db, async (tx) => {
      const user = await makeUser(tx);
      const college = await makeCollege(tx, { ...ORIGIN, serviceRadiusMeters: 1000 });
      for (const status of ['DRAFT', 'PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED'] as const) {
        await makePlace(tx, user.id, { ...destination(ORIGIN, 45, 200), status });
      }

      const result = await service().recompute(college.id, tx);

      expect(result.created).toBe(5);
    });
  });

  it("rolls its writes back with the caller's transaction (nothing leaks out of a failed change)", async () => {
    const user = await db.user.findFirst({ select: { id: true } });
    expect(user).not.toBeNull();
    const before = await db.collegePlace.count();

    await inRollback(db, async (tx) => {
      const author = await makeUser(tx);
      const college = await makeCollege(tx, { ...ORIGIN, serviceRadiusMeters: 1000 });
      await makePlace(tx, author.id, destination(ORIGIN, 0, 100));
      await service().recompute(college.id, tx);
      expect(await tx.collegePlace.count()).toBe(before + 1);
    });

    expect(await db.collegePlace.count()).toBe(before);
  });
});
