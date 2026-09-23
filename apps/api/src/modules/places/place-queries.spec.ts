import { escapeLike, idOrSlugFilter, searchFilter } from './place-queries.js';

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

  it('q searches name or address', () => {
    expect(searchFilter({ q: 'mess' })).toEqual({
      OR: [{ name: { contains: 'mess' } }, { address: { contains: 'mess' } }],
    });
  });

  it('city is an exact match', () => {
    expect(searchFilter({ city: 'Ahilyanagar' })).toEqual({ city: { equals: 'Ahilyanagar' } });
  });

  it('escapes a literal percent sign in q, so it does not match every row', () => {
    const filter = searchFilter({ q: '%' });
    expect(filter).toEqual({ OR: [{ name: { contains: '\\%' } }, { address: { contains: '\\%' } }] });
  });

  it('combines q and city', () => {
    expect(searchFilter({ q: 'mess', city: 'Ahilyanagar' })).toEqual({
      OR: [{ name: { contains: 'mess' } }, { address: { contains: 'mess' } }],
      city: { equals: 'Ahilyanagar' },
    });
  });
});
