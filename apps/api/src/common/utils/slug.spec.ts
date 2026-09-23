import { pickFreeSlug, randomizedSlug, slugRoot, slugify } from './slug.js';

// Full edge-case coverage lives with the first caller (college-slug.spec.ts); this is a smoke test
// proving the shared, parameterised location behaves the same for a second, differently-configured caller.
describe('slugify', () => {
  it('folds accents, lower-cases and joins with hyphens', () => {
    expect(slugify("Café de l'École")).toBe('cafe-de-l-ecole');
  });
});

describe('slugRoot', () => {
  it('falls back when the name gives nothing usable, respecting a custom minLength', () => {
    expect(slugRoot('a', { reservedWords: [], fallback: 'category', minLength: 2 })).toBe(
      'category',
    );
    expect(slugRoot('ab', { reservedWords: [], fallback: 'category', minLength: 2 })).toBe('ab');
  });

  it('avoids a caller-specific reserved word', () => {
    expect(slugRoot('new', { reservedWords: ['new'], fallback: 'x' })).toBe('new-x');
  });
});

describe('pickFreeSlug and randomizedSlug', () => {
  it('counts up from a taken root, and randomizedSlug always differs', () => {
    expect(pickFreeSlug('mess', new Set(['mess']))).toBe('mess-2');
    expect(randomizedSlug('mess')).toMatch(/^mess-[0-9a-f]{6}$/);
  });
});
