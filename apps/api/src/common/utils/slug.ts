import { randomBytes } from 'node:crypto';
import { looksLikeUuid } from '@platform/contracts';

const MAX_ROOT_LENGTH = 80;

/**
 * Turns a name into a URL slug: ASCII, lower case, words joined by single hyphens. Accents are
 * folded (`Café` -> `cafe`) and `&` becomes `and`. Letters that have no ASCII form (Devanagari, for
 * one) are dropped, so a name written only in such a script gives an empty string and the caller
 * falls back to a generic slug. Shared by every resource that generates a slug from a name
 * (colleges, categories, ...).
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

export interface SlugRootOptions {
  /** Words the caller's contract refuses as a slug (so `/things/<slug>` can't clash with a route). */
  reservedWords: readonly string[];
  /** Used whenever the name alone cannot produce a usable slug. */
  fallback: string;
  /** The contract's minimum slug length. Default 3 (colleges' bound; categories pass 2). */
  minLength?: number;
}

/**
 * The slug a name would get before uniqueness is applied. It is never shorter than the caller's
 * contract allows, never one of the caller's reserved words, and never shaped like an id.
 */
export function slugRoot(name: string, options: SlugRootOptions): string {
  const minLength = options.minLength ?? 3;
  const slug = slugify(name);
  if (slug.length < minLength) return options.fallback;
  if (options.reservedWords.includes(slug)) return `${slug}-${options.fallback}`;
  if (looksLikeUuid(slug)) return `${options.fallback}-${slug}`;
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
