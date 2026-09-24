import { REVIEW_STATUSES } from '@platform/contracts';
import {
  buildHistogram,
  canAuthorChange,
  displayName,
  isVisible,
  planModeration,
  roundRating,
  unknownDimensionIds,
} from './review-rules.js';

describe('isVisible / canAuthorChange', () => {
  it.each([
    ['PUBLISHED', true],
    ['REPORTED', true],
    ['HIDDEN', false],
    ['REMOVED', false],
  ] as const)('%s -> %s', (status, expected) => {
    expect(isVisible(status)).toBe(expected);
    expect(canAuthorChange(status)).toBe(expected);
  });
});

describe('planModeration', () => {
  it.each([
    ['hide', 'PUBLISHED', { kind: 'change', to: 'HIDDEN' }],
    ['hide', 'REPORTED', { kind: 'change', to: 'HIDDEN' }],
    ['hide', 'HIDDEN', { kind: 'noop' }],
    ['restore', 'HIDDEN', { kind: 'change', to: 'PUBLISHED' }],
    ['restore', 'REPORTED', { kind: 'change', to: 'PUBLISHED' }],
    ['restore', 'PUBLISHED', { kind: 'noop' }],
    ['remove', 'PUBLISHED', { kind: 'change', to: 'REMOVED' }],
    ['remove', 'HIDDEN', { kind: 'change', to: 'REMOVED' }],
    ['remove', 'REPORTED', { kind: 'change', to: 'REMOVED' }],
    ['remove', 'REMOVED', { kind: 'noop' }],
  ] as const)('%s a %s review -> %j', (action, current, expected) => {
    expect(planModeration(action, current)).toEqual(expected);
  });

  it.each(['hide', 'restore'] as const)(
    'refuses to %s a removed review: removal is final',
    (action) => {
      const plan = planModeration(action, 'REMOVED');
      expect(plan.kind).toBe('invalid');
      expect(plan.kind === 'invalid' && plan.message).toMatch(/final/);
    },
  );

  it('is idempotent: applying any valid action twice ends in a no-op', () => {
    for (const action of ['hide', 'restore', 'remove'] as const) {
      for (const status of REVIEW_STATUSES) {
        const first = planModeration(action, status);
        if (first.kind !== 'change') continue;
        expect(planModeration(action, first.to)).toEqual({ kind: 'noop' });
      }
    }
  });
});

describe('roundRating', () => {
  it('keeps two decimals', () => {
    expect(roundRating(4.333333)).toBe(4.33);
    expect(roundRating(4.666666)).toBe(4.67);
    expect(roundRating(5)).toBe(5);
  });
});

describe('buildHistogram', () => {
  it('lists 5 down to 1 with zeros filled in', () => {
    expect(
      buildHistogram([
        { rating: 4, count: 3 },
        { rating: 1, count: 1 },
      ]),
    ).toEqual([
      { rating: 5, count: 0 },
      { rating: 4, count: 3 },
      { rating: 3, count: 0 },
      { rating: 2, count: 0 },
      { rating: 1, count: 1 },
    ]);
  });

  it('is all zeros for no reviews', () => {
    expect(buildHistogram([]).every((entry) => entry.count === 0)).toBe(true);
  });
});

describe('unknownDimensionIds', () => {
  it("returns only the ids outside the place's dimensions", () => {
    const allowed = new Set(['food', 'price']);
    expect(
      unknownDimensionIds([{ dimensionId: 'food' }, { dimensionId: 'wifi' }], allowed),
    ).toEqual(['wifi']);
    expect(unknownDimensionIds([], allowed)).toEqual([]);
  });
});

describe('displayName', () => {
  it.each([
    ['Asha Kulkarni', 'Asha K.'],
    ['  Asha   Ravi  Kulkarni ', 'Asha K.'],
    ['Asha', 'Asha'],
    ['asha kulkarni', 'asha K.'],
    ['आशा कुलकर्णी', 'आशा क.'],
    ['   ', 'Student'],
  ])('%j -> %j', (name, expected) => {
    expect(displayName(name)).toBe(expected);
  });

  it('never contains the full surname', () => {
    expect(displayName('Asha Kulkarni')).not.toContain('Kulkarni');
  });
});
