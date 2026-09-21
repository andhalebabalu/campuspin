import {
  CARD_SELECT,
  DETAIL_SELECT,
  ADMIN_SELECT,
  escapeLike,
  idOrSlugFilter,
  searchFilter,
} from './college-queries.js';

describe('idOrSlugFilter', () => {
  it('treats an id-shaped value as an id, lower-cased', () => {
    expect(idOrSlugFilter('01A0BABD-B2D2-725F-9C0F-DDBC81685942')).toEqual({
      id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
    });
  });

  it('treats anything else as a slug, trimmed and lower-cased', () => {
    expect(idOrSlugFilter('  Sample-Arts-College ')).toEqual({ slug: 'sample-arts-college' });
    expect(idOrSlugFilter('not-a-uuid-1234')).toEqual({ slug: 'not-a-uuid-1234' });
  });

  it('never puts user text into a filter as anything but a plain string', () => {
    expect(idOrSlugFilter(`x' OR '1'='1`)).toEqual({ slug: `x' or '1'='1` });
  });
});

describe('searchFilter', () => {
  it('is empty when nothing is asked', () => {
    expect(searchFilter({})).toEqual({});
    expect(searchFilter({ q: '   ', city: '  ' })).toEqual({});
    expect(searchFilter({ q: undefined, city: undefined })).toEqual({});
  });

  it('searches the name, short name and city for the text', () => {
    expect(searchFilter({ q: ' science ' })).toEqual({
      OR: [
        { name: { contains: 'science' } },
        { shortName: { contains: 'science' } },
        { city: { contains: 'science' } },
      ],
    });
  });

  it('matches a city exactly', () => {
    expect(searchFilter({ city: ' Ahilyanagar ' })).toEqual({ city: { equals: 'Ahilyanagar' } });
  });

  it('combines both', () => {
    expect(Object.keys(searchFilter({ q: 'x', city: 'y' })).sort()).toEqual(['OR', 'city']);
  });
});

describe('escapeLike', () => {
  const backslash = String.fromCharCode(92);

  it('makes a percent sign, an underscore and a backslash match themselves', () => {
    expect(escapeLike('100%')).toBe(`100${backslash}%`);
    expect(escapeLike('a_b')).toBe(`a${backslash}_b`);
    expect(escapeLike(`c:${backslash}dir`)).toBe(`c:${backslash}${backslash}dir`);
    expect(escapeLike('%_%')).toBe(`${backslash}%${backslash}_${backslash}%`);
  });

  it('leaves ordinary text, other punctuation and other scripts alone', () => {
    for (const text of [
      'plain',
      "St. Xavier's",
      'Sample & Co (Demo)',
      'अहिल्यानगर',
      "' OR 1=1 --",
    ]) {
      expect(escapeLike(text)).toBe(text);
    }
  });

  it('is applied to the search text, so a wildcard cannot match everything', () => {
    const filter = searchFilter({ q: '%' });
    expect(filter).toEqual({
      OR: [
        { name: { contains: `${backslash}%` } },
        { shortName: { contains: `${backslash}%` } },
        { city: { contains: `${backslash}%` } },
      ],
    });
  });

  it('does not touch an exact city match (that is an equality, not a pattern)', () => {
    expect(searchFilter({ city: '50%_town' })).toEqual({ city: { equals: '50%_town' } });
  });
});

describe('selects', () => {
  it('a public card and detail never select a staff-only column', () => {
    for (const select of [CARD_SELECT, DETAIL_SELECT]) {
      for (const staffOnly of ['status', 'isDemo', 'createdById', 'createdAt', 'updatedAt']) {
        expect(select).not.toHaveProperty(staffOnly);
      }
    }
  });

  it('the admin select adds them', () => {
    for (const field of ['status', 'isDemo', 'createdById', 'createdAt', 'updatedAt']) {
      expect(ADMIN_SELECT).toHaveProperty(field);
    }
  });

  it('orders the gallery by position, then age, then id (stable)', () => {
    expect(DETAIL_SELECT.images.orderBy).toEqual([
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });
});
