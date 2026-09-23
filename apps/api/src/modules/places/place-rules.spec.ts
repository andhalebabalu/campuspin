import type { PlaceCard } from '@platform/contracts';
import {
  affectsProximity,
  diffFields,
  metersFrom,
  planStatusChange,
  sortCards,
  summarizePrices,
} from './place-rules.js';

describe('planStatusChange', () => {
  it.each([
    ['activate', 'DRAFT', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'PENDING', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'REJECTED', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'INACTIVE', { kind: 'change', to: 'ACTIVE' }],
    ['activate', 'ACTIVE', { kind: 'noop' }],
    ['deactivate', 'ACTIVE', { kind: 'change', to: 'INACTIVE' }],
    ['deactivate', 'INACTIVE', { kind: 'noop' }],
  ] as const)('%s a %s place -> %j', (action, current, expected) => {
    expect(planStatusChange(action, current)).toEqual(expected);
  });

  it.each(['DRAFT', 'PENDING', 'REJECTED'] as const)(
    'refuses to deactivate a never-published (%s) place, with a message that says what to do instead',
    (current) => {
      const plan = planStatusChange('deactivate', current);
      expect(plan.kind).toBe('invalid');
      expect(plan.kind === 'invalid' && plan.message).toMatch(/never been published.*Activate it/s);
    },
  );

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

describe('affectsProximity', () => {
  it('is true only for coordinate fields', () => {
    expect(affectsProximity(['latitude'])).toBe(true);
    expect(affectsProximity(['longitude'])).toBe(true);
    expect(affectsProximity(['name', 'city'])).toBe(false);
    expect(affectsProximity([])).toBe(false);
  });
});

describe('diffFields (re-exported shared helper)', () => {
  it('reports only the fields that actually changed', () => {
    const current = { name: 'A', city: 'Pune' };
    expect(diffFields(current, { name: 'A', city: 'Nagpur' })).toEqual(['city']);
  });
});

describe('summarizePrices', () => {
  it('compares options in the category default unit when at least one uses it', () => {
    const prices = [
      { amount: 3000, unit: 'MONTH' as const },
      { amount: 120, unit: 'DAY' as const },
      { amount: 3500, unit: 'MONTH' as const },
    ];
    expect(summarizePrices(prices, 'MONTH')).toEqual({
      priceMin: 3000,
      priceMax: 3500,
      priceUnit: 'MONTH',
    });
  });

  it("falls back to the first option's unit when none matches the default", () => {
    const prices = [
      { amount: 100, unit: 'MEAL' as const },
      { amount: 150, unit: 'MEAL' as const },
    ];
    expect(summarizePrices(prices, 'MONTH')).toEqual({
      priceMin: 100,
      priceMax: 150,
      priceUnit: 'MEAL',
    });
  });

  it("falls back to the first option's unit when the category has no default", () => {
    const prices = [{ amount: 500, unit: 'WEEK' as const }];
    expect(summarizePrices(prices, null)).toEqual({
      priceMin: 500,
      priceMax: 500,
      priceUnit: 'WEEK',
    });
  });

  it('is null across the board when there are no price options', () => {
    expect(summarizePrices([], 'MONTH')).toEqual({
      priceMin: null,
      priceMax: null,
      priceUnit: null,
    });
  });

  it('a single option gives the same min and max', () => {
    expect(summarizePrices([{ amount: 3000, unit: 'MONTH' as const }], 'MONTH')).toEqual({
      priceMin: 3000,
      priceMax: 3000,
      priceUnit: 'MONTH',
    });
  });
});

const card = (overrides: Partial<PlaceCard>): PlaceCard => ({
  id: overrides.id ?? '1',
  slug: 'x',
  name: 'X',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  primaryCategory: null,
  coverImageUrl: null,
  verified: false,
  ratingAverage: 0,
  ratingCount: 0,
  priceMin: null,
  priceMax: null,
  priceUnit: null,
  distanceMeters: null,
  ...overrides,
});

describe('sortCards', () => {
  it('nearest: orders by distance, unknown distance last, ties broken by name then id', () => {
    const cards = [
      card({ id: 'b', name: 'B', distanceMeters: 500 }),
      card({ id: 'c', name: 'C', distanceMeters: null }),
      card({ id: 'a', name: 'A', distanceMeters: 100 }),
    ];
    expect(sortCards(cards, 'nearest').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('cheapest: orders by priceMin, no price sorts last (never as "free")', () => {
    const cards = [
      card({ id: 'b', name: 'B', priceMin: 3000 }),
      card({ id: 'c', name: 'C', priceMin: null }),
      card({ id: 'a', name: 'A', priceMin: 1000 }),
    ];
    expect(sortCards(cards, 'cheapest').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const cards = [card({ id: 'b', name: 'B' }), card({ id: 'a', name: 'A' })];
    const original = [...cards];
    sortCards(cards, 'nearest');
    expect(cards).toEqual(original);
  });
});

describe('metersFrom', () => {
  it('is null without a point', () => {
    expect(metersFrom(undefined, { latitude: 19.1, longitude: 74.7 })).toBeNull();
  });

  it('rounds the straight-line distance', () => {
    const meters = metersFrom(
      { latitude: 19.0952, longitude: 74.7496 },
      { latitude: 19.1, longitude: 74.75 },
    );
    expect(meters).toBeGreaterThan(0);
    expect(Number.isInteger(meters)).toBe(true);
  });
});
