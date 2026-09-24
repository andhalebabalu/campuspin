import { z } from 'zod';

/**
 * Reusable plain-text field builders shared by every resource's contracts (colleges, categories,
 * and future ones). Kept in one place so the "no markup, no control characters, http(s)-only
 * links, slugs cannot collide with a fixed route" rules are defined once and cannot drift between
 * resources.
 */

const SINGLE_LINE_FORBIDDEN = /[<>\p{Cc}\p{Cs}\p{Co}\p{Bidi_Control}]/u;
// Multi-line text may also contain tab, line feed and carriage return.
const MULTI_LINE_FORBIDDEN = /[<>\p{Cs}\p{Co}\p{Bidi_Control}]|(?![\t\n\r])\p{Cc}/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True for text shaped like an id. The public API resolves such a value as an id, never a slug. */
export const looksLikeUuid = (value: string): boolean => UUID_SHAPE.test(value.toLowerCase());

export const uuidSchema = z.uuid();

/**
 * Trimmed, every run of whitespace (tabs and line breaks from a paste included) collapsed to one
 * space, then any markup or remaining control character refused. Collapsing comes first on purpose:
 * a stray newline is harmless and gets normalised, a NUL byte or a bidi override is not and is refused.
 */
export function singleLineField(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `Use at most ${max} characters`)
    .transform((value) => value.replace(/\s+/g, ' '))
    .refine((value) => !SINGLE_LINE_FORBIDDEN.test(value), {
      message: `${label} contains characters that are not allowed`,
    });
}

export function multiLineField(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `Use at most ${max} characters`)
    .refine((value) => !MULTI_LINE_FORBIDDEN.test(value), {
      message: `${label} contains characters that are not allowed`,
    })
    .transform((value) => value.replace(/\r\n?/g, '\n'));
}

/** http(s) only (no `javascript:`, `data:` or `ftp:`), and never with `user:password@`. */
export function httpUrlField(max: number) {
  return (
    z
      .url({ protocol: /^https?$/ })
      .max(max, `Use at most ${max} characters`)
      // `user:password@host` puts an `@` in the authority (the part before the first `/`, `?` or `#`).
      // Done with a pattern, not `new URL`, because this package also runs where that global is absent.
      .refine((value) => !/^https?:\/\/[^/?#]*@/i.test(value), {
        message: 'The link must not contain a username or password',
      })
  );
}

/**
 * A URL slug: lowercase, single hyphens, 3-120 characters, never a word the caller reserves for a
 * fixed route (so `/things/<slug>` can never clash with `/things/popular`) and never id-shaped
 * (so the API can always tell a slug from an id at a glance).
 */
export function createSlugSchema(options: {
  reservedWords: readonly string[];
  example: string;
  minLength?: number;
  maxLength?: number;
}) {
  const min = options.minLength ?? 3;
  const max = options.maxLength ?? 120;
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(min, `Use at least ${min} characters`)
    .max(max, `Use at most ${max} characters`)
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens')
    .refine((value) => !options.reservedWords.includes(value), {
      message: 'This slug is reserved',
    })
    .refine((value) => !looksLikeUuid(value), { message: 'A slug must not look like an id' })
    .meta({ example: options.example });
}

/** A public `:idOrSlug` path parameter: either one, resolved by the service with `looksLikeUuid`. */
export function idOrSlugField(example: string) {
  return z.string().trim().min(1).max(200).meta({ example });
}

const MACHINE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * A stable machine identifier (a category attribute key, a rating dimension key, an amenity key):
 * lowercase, starting with a letter, otherwise letters, digits and underscores. Meant to be typed
 * once by staff and then never change, so filters and stored values keep meaning it.
 */
export function machineKeyField(label: string, max: number, example: string) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(1, `${label} is required`)
    .max(max, `Use at most ${max} characters`)
    .regex(
      MACHINE_KEY_PATTERN,
      'Use lowercase letters, numbers and underscores, starting with a letter',
    )
    .meta({ example });
}

/** A phone number as people type it: digits with optional `+`, spaces, dashes, dots and brackets. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\-.\s]{6,20}$/, 'Enter a valid phone number')
  .meta({ example: '+91 98765 43210' });
