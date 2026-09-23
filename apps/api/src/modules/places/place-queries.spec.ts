import {
  escapeLike,
  idOrSlugFilter,
  priceFilter,
  searchFilter,
  verifiedFilter,
} from './place-queries.js';

describe('idOrSlugFilter', () => {
  it('treats an id-shaped value as an id, lower-cased', () => {
    expect(idOrSlugFilter('01A0BABD-B2D2-725F-9C0F-DDBC81685942')).toEqual({
      id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
    });
  });

  it('treats anything else as a slug, trimmed and lower-cased', () => {
    expect(idOrSlugFilter('  Sample-Mess ')).toEqual({ slug: 'sample-mess' });
  });
});

describe('escapeLike', () => {
  it('escapes %, _ and \\ so they match themselves literally', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLike('Sample Mess')).toBe('Sample Mess');
  });
});

describe('searchFilter', () => {
  it('is empty with no filters', () => {
    expect(searchFilter({})).toEqual({});
  });

  it('q searches name, description or address', () => {
    expect(searchFilter({ q: 'mess' })).toEqual({
      OR: [
        { name: { contains: 'mess' } },
        { description: { contains: 'mess' } },
        { address: { contains: 'mess' } },
      ],
    });
  });

  it('city is an exact match', () => {
    expect(searchFilter({ city: 'Ahilyanagar' })).toEqual({ city: { equals: 'Ahilyanagar' } });
  });

  it('escapes a literal percent sign in q, so it does not match every row', () => {
    const filter = searchFilter({ q: '%' });
    expect(filter).toEqual({
      OR: [
        { name: { contains: '\\%' } },
        { description: { contains: '\\%' } },
        { address: { contains: '\\%' } },
      ],
    });
  });

  it('combines q and city', () => {
    expect(searchFilter({ q: 'mess', city: 'Ahilyanagar' })).toEqual({
      OR: [
        { name: { contains: 'mess' } },
        { description: { contains: 'mess' } },
        { address: { contains: 'mess' } },
      ],
      city: { equals: 'Ahilyanagar' },
    });
  });
});

describe('priceFilter', () => {
  it('is empty with no bounds', () => {
    expect(priceFilter({})).toEqual({});
  });

  it('never matches a place with no price at all', () => {
    const filter = priceFilter({ minPrice: 1000 });
    expect(filter).toEqual({ AND: [{ priceMin: { not: null } }, { priceMax: { gte: 1000 } }] });
  });

  it('maxPrice keeps places whose cheapest tier is affordable', () => {
    expect(priceFilter({ maxPrice: 5000 })).toEqual({
      AND: [{ priceMin: { not: null } }, { priceMin: { lte: 5000 } }],
    });
  });

  it('minPrice and maxPrice together express a range overlap', () => {
    expect(priceFilter({ minPrice: 1000, maxPrice: 5000 })).toEqual({
      AND: [{ priceMin: { not: null } }, { priceMin: { lte: 5000 } }, { priceMax: { gte: 1000 } }],
    });
  });
});

describe('verifiedFilter', () => {
  it('filters to VERIFIED only when true', () => {
    expect(verifiedFilter(true)).toEqual({ verificationStatus: 'VERIFIED' });
  });

  it('is empty (no filter) when false', () => {
    expect(verifiedFilter(false)).toEqual({});
  });
});
