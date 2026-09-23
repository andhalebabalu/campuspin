import { describe, expect, it } from 'vitest';
import {
  createSlugSchema,
  httpUrlField,
  idOrSlugField,
  looksLikeUuid,
  machineKeyField,
  multiLineField,
  singleLineField,
  uuidSchema,
} from './index.js';

describe('looksLikeUuid', () => {
  it('is true for id-shaped text, any letter case', () => {
    expect(looksLikeUuid('01a0babd-b2d2-725f-9c0f-ddbc81685942')).toBe(true);
    expect(looksLikeUuid('01A0BABD-B2D2-725F-9C0F-DDBC81685942')).toBe(true);
  });

  it('is false for a slug or arbitrary text', () => {
    expect(looksLikeUuid('sample-college')).toBe(false);
    expect(looksLikeUuid('01a0babd-b2d2-725f-9c0f-ddbc8168594')).toBe(false); // one char short
  });
});

describe('uuidSchema', () => {
  it('accepts a UUID and rejects everything else', () => {
    expect(uuidSchema.safeParse('01a0babd-b2d2-725f-9c0f-ddbc81685942').success).toBe(true);
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('singleLineField', () => {
  const field = singleLineField('Name', 20);

  it('trims and collapses internal whitespace', () => {
    expect(field.parse('  Asha   Patil ')).toBe('Asha Patil');
    expect(field.parse('Two\nLines')).toBe('Two Lines');
  });

  it('enforces the length bounds', () => {
    expect(field.safeParse('').success).toBe(false);
    expect(field.safeParse('x'.repeat(21)).success).toBe(false);
    expect(field.safeParse('x'.repeat(20)).success).toBe(true);
  });

  it('refuses markup, NUL and bidi overrides', () => {
    const nul = String.fromCharCode(0);
    const rlo = String.fromCodePoint(0x202e);
    for (const value of ['<b>x</b>', `a${nul}b`, `a${rlo}b`]) {
      expect(field.safeParse(value).success).toBe(false);
    }
  });

  it('accepts other scripts', () => {
    expect(field.safeParse('अहिल्यानगर').success).toBe(true);
  });
});

describe('multiLineField', () => {
  const field = multiLineField('Description', 30);

  it('keeps line breaks and normalises CRLF to LF', () => {
    expect(field.parse('Line one\r\nLine two')).toBe('Line one\nLine two');
    expect(field.parse('a\nb')).toBe('a\nb');
  });

  it('still refuses markup and non-whitespace control characters', () => {
    const nul = String.fromCharCode(0);
    expect(field.safeParse('<script>').success).toBe(false);
    expect(field.safeParse(`bad${nul}byte`).success).toBe(false);
  });
});

describe('httpUrlField', () => {
  const field = httpUrlField(50);

  it.each([
    ['https://example.com', true],
    ['http://example.com/page', true],
    ['javascript:alert(1)', false],
    ['data:text/html;base64,AAAA', false],
    ['ftp://example.com', false],
    ['//example.com', false],
    ['example.com', false],
    ['https://user:pw@example.com', false],
    ['https://user@example.com', false],
    ['https://example.com/team/@head', true],
    ['https://example.com/?contact=a@b.example', true],
  ])('%s is accepted: %s', (url, accepted) => {
    expect(field.safeParse(url).success).toBe(accepted);
  });

  it('enforces the length bound', () => {
    expect(field.safeParse(`https://example.com/${'a'.repeat(50)}`).success).toBe(false);
  });
});

describe('createSlugSchema', () => {
  const schema = createSlugSchema({ reservedWords: ['new', 'popular'], example: 'sample' });

  it('lower-cases and trims', () => {
    expect(schema.parse('  My-Slug ')).toBe('my-slug');
  });

  it.each(['ab', 'has space', 'under_score', '-lead', 'trail-', 'double--hyphen', 'x'.repeat(121)])(
    'rejects %j',
    (value) => {
      expect(schema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects reserved words and id-shaped values', () => {
    expect(schema.safeParse('new').success).toBe(false);
    expect(schema.safeParse('popular').success).toBe(false);
    expect(schema.safeParse('01a0babd-b2d2-725f-9c0f-ddbc81685942').success).toBe(false);
  });

  it('honours custom length bounds', () => {
    const short = createSlugSchema({
      reservedWords: [],
      example: 'ab',
      minLength: 2,
      maxLength: 10,
    });
    expect(short.safeParse('ab').success).toBe(true);
    expect(short.safeParse('a').success).toBe(false);
    expect(short.safeParse('a'.repeat(11)).success).toBe(false);
  });
});

describe('idOrSlugField', () => {
  it('accepts short and long text within bounds', () => {
    const field = idOrSlugField('sample');
    expect(field.safeParse('x').success).toBe(true);
    expect(field.safeParse('x'.repeat(200)).success).toBe(true);
    expect(field.safeParse('x'.repeat(201)).success).toBe(false);
    expect(field.safeParse('').success).toBe(false);
  });
});

describe('machineKeyField', () => {
  const field = machineKeyField('Key', 20, 'seating_capacity');

  it('lower-cases and trims', () => {
    expect(field.parse('  Seating_Capacity ')).toBe('seating_capacity');
  });

  it.each(['1abc', '-abc', 'has space', 'has-hyphen', ''])('rejects %j', (value) => {
    expect(field.safeParse(value).success).toBe(false);
  });

  it('accepts a lowercase key starting with a letter', () => {
    expect(field.safeParse('a1_b2').success).toBe(true);
  });

  it('enforces the length bound', () => {
    expect(field.safeParse('a'.repeat(21)).success).toBe(false);
  });
});
