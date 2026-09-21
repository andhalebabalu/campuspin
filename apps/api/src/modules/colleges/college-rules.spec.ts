import type { CollegeCard } from '@platform/contracts';
import { distanceMeters } from '../../common/geo/haversine.js';
import { destination, seededRandom } from '../../../test/support/geo.js';
import {
  type ExistingLink,
  type LinkPlan,
  type PlacePoint,
  affectsProximity,
  diffFields,
  metersFrom,
  planLinks,
  planStatusChange,
  planVerificationChange,
  sortCards,
} from './college-rules.js';

describe('planStatusChange', () => {
  it.each([
    ['activate', 'DRAFT', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'INACTIVE', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'ACTIVE', { kind: 'noop' }],
    ['deactivate', 'ACTIVE', { kind: 'change', to: 'INACTIVE' }],
    ['deactivate', 'INACTIVE', { kind: 'noop' }],
  ] as const)('%s a %s college -> %j', (action, current, expected) => {
    expect(planStatusChange(action, current)).toEqual(expected);
  });

  it('refuses to deactivate a draft, with a message that says what to do instead', () => {
    const plan = planStatusChange('deactivate', 'DRAFT');
    expect(plan.kind).toBe('invalid');
    expect(plan.kind === 'invalid' && plan.message).toMatch(/never been published.*Activate it/s);
  });

  it('is idempotent: applying a change and repeating it ends in a no-op', () => {
    for (const action of ['activate', 'deactivate'] as const) {
      const first = planStatusChange(action, 'ACTIVE');
      const settled = first.kind === 'change' ? first.to : 'ACTIVE';
      expect(planStatusChange(action, settled).kind).not.toBe('invalid');
      const again = planStatusChange(action, settled);
      const final = again.kind === 'change' ? again.to : settled;
      expect(planStatusChange(action, final).kind).toBe('noop');
    }
  });
});

describe('planVerificationChange', () => {
  it.each([
    ['verify', 'PENDING', { kind: 'change', to: 'VERIFIED' }],
    ['verify', 'REJECTED', { kind: 'change', to: 'VERIFIED' }],
    ['verify', 'VERIFIED', { kind: 'noop' }],
    ['unverify', 'VERIFIED', { kind: 'change', to: 'PENDING' }],
    ['unverify', 'REJECTED', { kind: 'change', to: 'PENDING' }],
    ['unverify', 'PENDING', { kind: 'noop' }],
  ] as const)('%s a %s college -> %j', (action, current, expected) => {
    expect(planVerificationChange(action, current)).toEqual(expected);
  });
});

describe('diffFields', () => {
  const current = { name: 'A', shortName: null as string | null, latitude: 19, city: 'Pune' };

  it('lists only the fields whose value really changes', () => {
    expect(diffFields(current, { name: 'B', city: 'Pune' })).toEqual(['name']);
    expect(diffFields(current, { name: 'A', city: 'Pune' })).toEqual([]);
  });

  it('sees null -> value and value -> null as changes', () => {
    expect(diffFields(current, { shortName: 'X' })).toEqual(['shortName']);
    expect(diffFields<typeof current>({ ...current, shortName: 'X' }, { shortName: null })).toEqual(
      ['shortName'],
    );
    expect(diffFields(current, { shortName: null })).toEqual([]);
  });

  it('ignores fields that are undefined, and treats 0 as a real value', () => {
    expect(diffFields(current, { name: undefined })).toEqual([]);
    expect(diffFields(current, { latitude: 0 })).toEqual(['latitude']);
  });

  it('reports in the order the patch lists them', () => {
    expect(diffFields(current, { city: 'Nashik', name: 'Z' })).toEqual(['city', 'name']);
  });
});

describe('affectsProximity', () => {
  it('is true only for the fields that decide which places belong to a college', () => {
    expect(affectsProximity(['latitude'])).toBe(true);
    expect(affectsProximity(['name', 'longitude'])).toBe(true);
    expect(affectsProximity(['serviceRadiusMeters'])).toBe(true);
    expect(affectsProximity(['name', 'address', 'city', 'website'])).toBe(false);
    expect(affectsProximity([])).toBe(false);
  });
});

const card = (over: Partial<CollegeCard> & { id: string; name: string }): CollegeCard => ({
  slug: over.id,
  shortName: null,
  city: 'C',
  state: 'S',
  logoUrl: null,
  coverImageUrl: null,
  verified: false,
  placeCount: 0,
  distanceMeters: null,
  ...over,
});

describe('sortCards', () => {
  it('orders by distance, nearest first, with unknown distances last', () => {
    const cards = [
      card({ id: '1', name: 'Far', distanceMeters: 9000 }),
      card({ id: '2', name: 'Unknown', distanceMeters: null }),
      card({ id: '3', name: 'Near', distanceMeters: 120 }),
    ];
    expect(sortCards(cards, 'nearest').map((c) => c.name)).toEqual(['Near', 'Far', 'Unknown']);
  });

  it('orders by number of places, most first', () => {
    const cards = [
      card({ id: '1', name: 'A', placeCount: 2 }),
      card({ id: '2', name: 'B', placeCount: 14 }),
      card({ id: '3', name: 'C', placeCount: 0 }),
    ];
    expect(sortCards(cards, 'popular').map((c) => c.name)).toEqual(['B', 'A', 'C']);
  });

  it('breaks ties by name, then id, so a page boundary never repeats or skips a row', () => {
    const cards = [
      card({ id: 'b', name: 'Same', placeCount: 5 }),
      card({ id: 'a', name: 'Same', placeCount: 5 }),
      card({ id: 'c', name: 'Alpha', placeCount: 5 }),
    ];
    expect(sortCards(cards, 'popular').map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not change the input array', () => {
    const cards = [
      card({ id: '1', name: 'B', placeCount: 1 }),
      card({ id: '2', name: 'A', placeCount: 9 }),
    ];
    const snapshot = cards.map((c) => c.id);
    sortCards(cards, 'popular');
    expect(cards.map((c) => c.id)).toEqual(snapshot);
  });
});

describe('metersFrom', () => {
  it('is null without a point, and a rounded straight-line distance with one', () => {
    const target = { latitude: 19.1, longitude: 74.75 };
    expect(metersFrom(undefined, target)).toBeNull();
    const meters = metersFrom({ latitude: 19.096, longitude: 74.748 }, target);
    expect(Number.isInteger(meters)).toBe(true);
    expect(meters).toBe(
      Math.round(distanceMeters({ latitude: 19.096, longitude: 74.748 }, target)),
    );
    expect(metersFrom(target, target)).toBe(0);
  });
});

describe('planLinks', () => {
  const college = { latitude: 19.096, longitude: 74.748, serviceRadiusMeters: 1000 };
  const place = (id: string, bearing: number, meters: number): PlacePoint => ({
    id,
    ...destination(college, bearing, meters),
  });
  const link = (
    id: string,
    at: { latitude: number; longitude: number },
    mode: ExistingLink['mode'] = 'AUTO',
    stored = Math.round(distanceMeters(college, at)),
  ): ExistingLink => ({ placeId: id, mode, distanceMeters: stored, ...at });

  const empty: LinkPlan = {
    create: [],
    replaceAuto: [],
    refreshOverrides: [],
    remove: [],
    unchanged: 0,
  };

  it('links places within the radius, with their rounded distance, and ignores those beyond it', () => {
    const plan = planLinks(
      college,
      [place('near', 0, 10), place('edge', 90, 990), place('far', 180, 1500)],
      [],
    );

    expect(plan.create.map((c) => c.placeId).sort()).toEqual(['edge', 'near']);
    for (const created of plan.create) {
      expect(Number.isInteger(created.distanceMeters)).toBe(true);
      expect(created.distanceMeters).toBeLessThanOrEqual(1000);
    }
    expect(plan.create.find((c) => c.placeId === 'near')?.distanceMeters).toBe(10);
  });

  it('applies the seed rule exactly: round(distance) <= radius', () => {
    // 1000.4 m rounds to 1000 (in), 1000.6 m rounds to 1001 (out).
    const plan = planLinks(college, [place('in', 45, 1000.4), place('out', 45, 1000.6)], []);
    expect(plan.create.map((c) => c.placeId)).toEqual(['in']);
  });

  it('leaves a correct link untouched', () => {
    const p = place('a', 0, 300);
    expect(planLinks(college, [p], [link('a', p)])).toEqual({ ...empty, unchanged: 1 });
  });

  it('rewrites an AUTO link whose distance changed, and removes one that left the radius', () => {
    const near = place('near', 0, 300);
    const gone = place('gone', 0, 2000);
    const plan = planLinks(
      college,
      [near],
      [link('near', near, 'AUTO', 999), link('gone', gone, 'AUTO', 500)],
    );

    expect(plan.replaceAuto).toEqual([{ placeId: 'near', distanceMeters: 300 }]);
    expect(plan.remove).toEqual(['gone']);
    expect(plan.create).toEqual([]);
  });

  it('never drops or recreates a staff decision: PINNED stays even out of range, EXCLUDED stays in range', () => {
    const pinned = place('pinned', 0, 5000);
    const excluded = place('excluded', 90, 200);
    const plan = planLinks(
      college,
      [excluded],
      [link('pinned', pinned, 'PINNED'), link('excluded', excluded, 'EXCLUDED')],
    );

    expect(plan.remove).toEqual([]);
    expect(plan.create).toEqual([]); // the excluded place is not offered again as a new AUTO link
    expect(plan.replaceAuto).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });

  it("keeps an override's distance fresh without touching its mode", () => {
    const pinned = place('pinned', 0, 4000);
    const plan = planLinks(college, [], [link('pinned', pinned, 'PINNED', 1234)]);
    expect(plan.refreshOverrides).toEqual([
      { placeId: 'pinned', distanceMeters: Math.round(distanceMeters(college, pinned)) },
    ]);
  });

  it('does not offer an already linked place twice', () => {
    const p = place('a', 0, 100);
    expect(planLinks(college, [p, p], [link('a', p)]).create).toEqual([]);
    expect(planLinks(college, [p, p], []).create).toHaveLength(2); // callers pass distinct candidates
  });

  it('is idempotent: applying the plan and planning again changes nothing (property test)', () => {
    const random = seededRandom(7);
    for (let round = 0; round < 200; round += 1) {
      const radius = 200 + Math.floor(random() * 3000);
      const c = {
        latitude: 19 + random() * 0.1,
        longitude: 74.7 + random() * 0.1,
        serviceRadiusMeters: radius,
      };
      const places: PlacePoint[] = Array.from({ length: 30 }, (_, i) => ({
        id: `p${i}`,
        ...destination(c, random() * 360, random() * radius * 2),
      }));
      const modes: ExistingLink['mode'][] = ['AUTO', 'AUTO', 'AUTO', 'PINNED', 'EXCLUDED'];
      // A messy starting state: some links stale, some for places out of range.
      const existing: ExistingLink[] = places
        .filter(() => random() < 0.6)
        .map((p) => ({
          placeId: p.id,
          mode: modes[Math.floor(random() * modes.length)] ?? 'AUTO',
          distanceMeters: Math.floor(random() * radius),
          latitude: p.latitude,
          longitude: p.longitude,
        }));

      const plan = planLinks(c, places, existing);

      const byId = new Map(places.map((p) => [p.id, p]));
      const next = new Map(existing.map((l) => [l.placeId, { ...l }]));
      for (const id of plan.remove) next.delete(id);
      for (const r of [...plan.replaceAuto, ...plan.refreshOverrides]) {
        const l = next.get(r.placeId);
        if (l) l.distanceMeters = r.distanceMeters;
      }
      for (const created of plan.create) {
        const p = byId.get(created.placeId);
        if (p)
          next.set(created.placeId, {
            placeId: p.id,
            mode: 'AUTO',
            distanceMeters: created.distanceMeters,
            latitude: p.latitude,
            longitude: p.longitude,
          });
      }

      const again = planLinks(c, places, [...next.values()]);
      expect(again.create).toEqual([]);
      expect(again.replaceAuto).toEqual([]);
      expect(again.refreshOverrides).toEqual([]);
      expect(again.remove).toEqual([]);
    }
  });
});
