import { randomBytes } from 'node:crypto';
import { RESERVED_COLLEGE_SLUGS, looksLikeUuid } from '@platform/contracts';

const MAX_ROOT_LENGTH = 80;
const MIN_SLUG_LENGTH = 3;
const FALLBACK_ROOT = 'college';

/**
 * Turns a name into a URL slug: ASCII, lower case, words joined by single hyphens. Accents are
 * folded (`Café` -> `cafe`) and `&` becomes `and`. Letters that have no ASCII form (Devanagari, for
 * one) are dropped, so a name written only in such a script gives an empty string and the caller
 * falls back to a generic slug.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ROOT_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * The slug a name would get before uniqueness is applied. It is never shorter than the contract
 * allows, never a word the API reserves for fixed routes, and never shaped like an id.
 */
export function slugRoot(name: string): string {
  const slug = slugify(name);
  if (slug.length < MIN_SLUG_LENGTH) return FALLBACK_ROOT;
  if ((RESERVED_COLLEGE_SLUGS as readonly string[]).includes(slug))
    return `${slug}-${FALLBACK_ROOT}`;
  if (looksLikeUuid(slug)) return `${FALLBACK_ROOT}-${slug}`;
  return slug;
}

/** `root`, else `root-2`, `root-3`, ...: the first one not in `taken`. */
export function pickFreeSlug(root: string, taken: ReadonlySet<string>): string {
  if (!taken.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A slug that is unique for practical purposes, for when two requests raced for the same one. */
export function randomizedSlug(root: string): string {
  return `${root}-${randomBytes(3).toString('hex')}`;
}
