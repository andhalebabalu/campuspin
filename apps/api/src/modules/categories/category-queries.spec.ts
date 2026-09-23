import { Prisma } from '../../generated/prisma/client.js';
import { fromOptions, idOrSlugFilter, toOptions } from './category-queries.js';

describe('idOrSlugFilter', () => {
  it('treats an id-shaped value as an id, lower-cased', () => {
    expect(idOrSlugFilter('01A0BABD-B2D2-725F-9C0F-DDBC81685942')).toEqual({
      id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
    });
  });

  it('treats anything else as a slug, trimmed and lower-cased', () => {
    expect(idOrSlugFilter('  Mess ')).toEqual({ slug: 'mess' });
  });
});

describe('toOptions / fromOptions', () => {
  const options = [
    { value: 'veg', label: 'Veg' },
    { value: 'non_veg', label: 'Non-veg' },
  ];

  it('round-trips a list of options through the JSON column', () => {
    const written = fromOptions(options);
    // What actually reaches the database is the same plain array (Prisma serialises it as JSON).
    expect(written).toEqual(options);
    expect(toOptions(written as unknown as Prisma.JsonValue)).toEqual(options);
  });

  it('reading a NULL column gives null', () => {
    expect(toOptions(null)).toBeNull();
  });

  it('leaving options untouched (undefined) writes nothing', () => {
    expect(fromOptions(undefined)).toBeUndefined();
  });

  it('clearing options (null) writes the JSON-column NULL sentinel, not a plain null', () => {
    const written = fromOptions(null);
    expect(written).toBe(Prisma.DbNull);
    expect(written).not.toBeNull(); // a plain `null` would be the wrong Prisma input for a Json column
  });
});
