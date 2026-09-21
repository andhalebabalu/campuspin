import type { PrismaService } from '../../infra/database/prisma.service.js';
import { destination } from '../../../test/support/geo.js';
import { distanceMeters } from '../../common/geo/haversine.js';
import { type Db, CollegeProximityService } from './college-proximity.service.js';

interface Place {
  id: string;
  latitude: number;
  longitude: number;
}
interface Link {
  collegeId: string;
  placeId: string;
  mode: 'AUTO' | 'PINNED' | 'EXCLUDED';
  distanceMeters: number;
  computedAt: Date;
}
type Where = Record<string, unknown>;

/** An in-memory stand-in for the four Prisma delegates the service uses. It records every write. */
class FakeDb {
  readonly writes: string[] = [];
  readonly queries: Where[] = [];
  readonly createManyBatches: number[] = [];
  readonly deleteWheres: Where[] = [];
  links: Link[] = [];

  private readonly college: { latitude: number; longitude: number; serviceRadiusMeters: number };

  constructor(
    college: { latitude: number; longitude: number; serviceRadiusMeters: number },
    readonly places: Place[],
  ) {
    // A copy, so a test that "moves" the college cannot disturb the shared fixture.
    this.college = { ...college };
  }

  college_ = {
    findUniqueOrThrow: () => Promise.resolve(this.college),
  };

  place_ = {
    // Honour the latitude / longitude ranges, as the database's index scan would.
    findMany: ({
      where,
    }: {
      where: { latitude: { gte: number; lte: number }; longitude?: { gte: number; lte: number } };
    }) => {
      this.queries.push(where);
      return Promise.resolve(
        this.places.filter(
          (place) =>
            place.latitude >= where.latitude.gte &&
            place.latitude <= where.latitude.lte &&
            (where.longitude === undefined ||
              (place.longitude >= where.longitude.gte && place.longitude <= where.longitude.lte)),
        ),
      );
    },
  };

  collegePlace_ = {
    findMany: () =>
      Promise.resolve(
        this.links.map((link) => {
          const place = this.places.find((candidate) => candidate.id === link.placeId);
          if (!place) throw new Error('link without a place');
          return {
            placeId: link.placeId,
            mode: link.mode,
            distanceMeters: link.distanceMeters,
            place,
          };
        }),
      ),
    deleteMany: ({ where }: { where: { placeId: { in: string[] }; mode: string } }) => {
      this.writes.push('deleteMany');
      this.deleteWheres.push(where);
      this.links = this.links.filter(
        (link) => !(where.placeId.in.includes(link.placeId) && link.mode === where.mode),
      );
      return Promise.resolve({ count: 0 });
    },
    createMany: ({ data }: { data: Array<Omit<Link, 'computedAt'> & { computedAt: Date }> }) => {
      this.writes.push('createMany');
      this.createManyBatches.push(data.length);
      for (const row of data) {
        if (!this.links.some((link) => link.placeId === row.placeId)) this.links.push(row);
      }
      return Promise.resolve({ count: data.length });
    },
    update: ({
      where,
      data,
    }: {
      where: { collegeId_placeId: { placeId: string } };
      data: { distanceMeters: number };
    }) => {
      this.writes.push('update');
      const link = this.links.find(
        (candidate) => candidate.placeId === where.collegeId_placeId.placeId,
      );
      if (link) link.distanceMeters = data.distanceMeters;
      return Promise.resolve(link);
    },
  };

  /** The names the service expects (`college`, `place`, `collegePlace`). */
  asDb(): Db {
    return {
      college: this.college_,
      place: this.place_,
      collegePlace: this.collegePlace_,
    } as unknown as Db;
  }
}

const COLLEGE = { latitude: 19.096, longitude: 74.748, serviceRadiusMeters: 1000 };
const at = (id: string, bearing: number, meters: number): Place => ({
  id,
  ...destination(COLLEGE, bearing, meters),
});
const explode = { college: {} } as unknown as PrismaService; // proves the passed transaction is used

describe('CollegeProximityService.recompute', () => {
  it('links the places within the radius and no others, storing rounded distances', async () => {
    const fake = new FakeDb(COLLEGE, [
      at('near', 0, 100),
      at('edge', 90, 950),
      at('far', 180, 3000),
      at('very-far', 0, 40_000),
    ]);

    const result = await new CollegeProximityService(explode).recompute('c1', fake.asDb());

    expect(fake.links.map((link) => link.placeId).sort()).toEqual(['edge', 'near']);
    for (const link of fake.links) {
      expect(link.mode).toBe('AUTO');
      expect(link.collegeId).toBe('c1');
      const place = fake.places.find((candidate) => candidate.id === link.placeId);
      expect(link.distanceMeters).toBe(Math.round(distanceMeters(COLLEGE, place as Place)));
    }
    expect(result).toEqual({
      created: 2,
      rewritten: 0,
      refreshedOverrides: 0,
      removed: 0,
      total: 2,
    });
  });

  it('asks the database only for places inside a bounding box, never the whole table', async () => {
    const fake = new FakeDb(COLLEGE, [at('near', 0, 100)]);

    await new CollegeProximityService(explode).recompute('c1', fake.asDb());

    expect(fake.queries).toHaveLength(1);
    const where = fake.queries[0] as {
      latitude: { gte: number; lte: number };
      longitude: { gte: number; lte: number };
    };
    expect(where.latitude.lte - where.latitude.gte).toBeLessThan(0.05); // ~2 km, not the planet
    expect(where.longitude.lte - where.longitude.gte).toBeLessThan(0.05);
    expect(where.latitude.gte).toBeLessThan(19.096);
    expect(where.latitude.lte).toBeGreaterThan(19.096);
  });

  it('is a no-op the second time: nothing is written when nothing changed', async () => {
    const fake = new FakeDb(COLLEGE, [at('a', 0, 100), at('b', 90, 500)]);
    const service = new CollegeProximityService(explode);
    await service.recompute('c1', fake.asDb());
    fake.writes.length = 0;

    const again = await service.recompute('c1', fake.asDb());

    expect(fake.writes).toEqual([]);
    expect(again).toEqual({
      created: 0,
      rewritten: 0,
      refreshedOverrides: 0,
      removed: 0,
      total: 2,
    });
  });

  it('follows the college when it moves: places that fall out are unlinked, new ones linked', async () => {
    const west = at('west', 270, 400);
    const east = at('east', 90, 400);
    const fake = new FakeDb(COLLEGE, [west, east]);
    const service = new CollegeProximityService(explode);
    await service.recompute('c1', fake.asDb());
    expect(fake.links).toHaveLength(2);

    // Move the college 1.2 km east: the western place is now out of range.
    Object.assign(COLLEGE_MUTABLE(fake), destination(COLLEGE, 90, 1200));
    const result = await service.recompute('c1', fake.asDb());

    expect(fake.links.map((link) => link.placeId)).toEqual(['east']);
    expect(result.removed).toBe(1);
    expect(result.rewritten).toBe(1); // the eastern place is still in range, at a new distance
  });

  it('only ever deletes AUTO links, so a staff decision survives a recompute', async () => {
    const fake = new FakeDb(COLLEGE, [
      at('pinned', 0, 5000),
      at('hidden', 90, 200),
      at('auto', 180, 300),
    ]);
    fake.links = [
      {
        collegeId: 'c1',
        placeId: 'pinned',
        mode: 'PINNED',
        distanceMeters: 1,
        computedAt: new Date(0),
      },
      {
        collegeId: 'c1',
        placeId: 'hidden',
        mode: 'EXCLUDED',
        distanceMeters: 1,
        computedAt: new Date(0),
      },
    ];

    const result = await new CollegeProximityService(explode).recompute('c1', fake.asDb());

    // Pinned (out of range) and excluded (in range) are both still there, with fresh distances.
    expect(fake.links.find((link) => link.placeId === 'pinned')?.mode).toBe('PINNED');
    expect(fake.links.find((link) => link.placeId === 'hidden')?.mode).toBe('EXCLUDED');
    expect(fake.links.find((link) => link.placeId === 'auto')?.mode).toBe('AUTO');
    expect(result.refreshedOverrides).toBe(2);
    expect(result.removed).toBe(0);
    for (const where of fake.deleteWheres) expect(where.mode).toBe('AUTO');
  });

  it('writes in batches so a dense area never becomes one enormous statement', async () => {
    const places = Array.from({ length: 1200 }, (_, index) =>
      at(`p${index}`, index % 360, 100 + (index % 800)),
    );
    const fake = new FakeDb(COLLEGE, places);

    const result = await new CollegeProximityService(explode).recompute('c1', fake.asDb());

    expect(result.created).toBe(1200);
    expect(fake.createManyBatches).toEqual([500, 500, 200]);
  });

  it("uses the client it is given (a caller's transaction), never its own connection", async () => {
    const fake = new FakeDb(COLLEGE, [at('near', 0, 100)]);
    // `explode` has no place/collegePlace delegates: reaching for it would throw.
    await expect(
      new CollegeProximityService(explode).recompute('c1', fake.asDb()),
    ).resolves.toBeDefined();
  });
});

/** The fake keeps the college object it was built with; tests mutate that to "move" the college. */
function COLLEGE_MUTABLE(fake: FakeDb): { latitude: number; longitude: number } {
  return (fake as unknown as { college: { latitude: number; longitude: number } }).college;
}
