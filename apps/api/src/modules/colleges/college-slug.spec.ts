import { RESERVED_COLLEGE_SLUGS, slugSchema } from '@platform/contracts';
import { pickFreeSlug, randomizedSlug, slugRoot, slugify } from './college-slug.js';

describe('slugify', () => {
  it.each([
    ['Sample Arts & Science College', 'sample-arts-and-science-college'],
    ['  Sample   Arts  College  ', 'sample-arts-college'],
    ['Sample Arts & Science College (Demo)', 'sample-arts-and-science-college-demo'],
    ["St. Xavier's College, Pune", 'st-xavier-s-college-pune'],
    ["Café de l'École", 'cafe-de-l-ecole'],
    ['ABC-123 / Campus #2', 'abc-123-campus-2'],
    ['---Edge---', 'edge'],
  ])('%j -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('gives nothing for a name in a script with no ASCII form (the caller falls back)', () => {
    expect(slugify('अहिल्यानगर महाविद्यालय')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('keeps the meaningful ASCII part of a mixed-script name', () => {
    expect(slugify('MIT अहिल्यानगर')).toBe('mit');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'word '.repeat(40)}end`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('never produces markup, spaces or anything outside a-z, 0-9 and hyphen', () => {
    expect(slugify('<script>alert(1)</script> "College"; DROP TABLE')).toMatch(/^[a-z0-9-]*$/);
  });
});

describe('slugRoot', () => {
  it('is the slugified name when that is usable', () => {
    expect(slugRoot('Sample Arts College')).toBe('sample-arts-college');
  });

  it.each(['', 'ab', '--', 'अहिल्यानगर'])(
    'falls back to "college" for %j (too short or empty)',
    (name) => {
      expect(slugRoot(name)).toBe('college');
    },
  );

  it('never returns a word reserved for fixed routes', () => {
    for (const reserved of RESERVED_COLLEGE_SLUGS) {
      const root = slugRoot(reserved);
      expect(root).not.toBe(reserved);
      expect(slugSchema.safeParse(root).success).toBe(true);
    }
  });

  it('never returns something shaped like an id', () => {
    const root = slugRoot('01a0babd-b2d2-725f-9c0f-ddbc81685942');
    expect(slugSchema.safeParse(root).success).toBe(true);
  });

  it('always satisfies the slug contract, whatever the name', () => {
    for (const name of [
      'Sample',
      'X',
      '12',
      'College (Demo)',
      '   ',
      '😀😀😀',
      'Ünïcödé Cöllege',
      'a'.repeat(300),
    ]) {
      expect(slugSchema.safeParse(slugRoot(name)).success).toBe(true);
    }
  });
});

describe('pickFreeSlug', () => {
  it('uses the root when it is free', () => {
    expect(pickFreeSlug('sample-college', new Set())).toBe('sample-college');
  });

  it('counts up from -2 until it finds a free one', () => {
    expect(pickFreeSlug('sample-college', new Set(['sample-college']))).toBe('sample-college-2');
    expect(
      pickFreeSlug(
        'sample-college',
        new Set(['sample-college', 'sample-college-2', 'sample-college-3']),
      ),
    ).toBe('sample-college-4');
  });

  it('fills a gap rather than always going past the highest', () => {
    expect(pickFreeSlug('c', new Set(['c', 'c-3']))).toBe('c-2');
  });

  it('is not fooled by similar-looking slugs', () => {
    expect(pickFreeSlug('sample', new Set(['sample-college', 'sampler']))).toBe('sample');
  });
});

describe('randomizedSlug', () => {
  it('is the root plus a short random suffix, and still a valid slug', () => {
    const slug = randomizedSlug('sample-college');
    expect(slug).toMatch(/^sample-college-[0-9a-f]{6}$/);
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });

  it('differs between calls', () => {
    expect(new Set(Array.from({ length: 50 }, () => randomizedSlug('x'))).size).toBe(50);
  });
});
