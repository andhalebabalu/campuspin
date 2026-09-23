import { DUPLICATE_THRESHOLDS, type DuplicateCandidate, type DuplicateLevel } from '@platform/contracts';
import { distanceMeters } from '../../common/geo/haversine.js';

/**
 * Duplicate-detection scoring, as pure functions with no database and no framework (mirrors
 * `place-rules.ts`). This is "detection v1" from
 * [02 §5.7](../../docs/02-architecture.md#57-suggest-a-place-duplicates-contributions), deliberately
 * simplified: Jaro-Winkler alone for name similarity (no IDF-weighted token Dice, no Devanagari
 * transliteration — just lowercase folding of a few common Indic spelling variants), and no
 * `app_settings`-driven thresholds (see `DUPLICATE_THRESHOLDS` in `@platform/contracts`).
 */

// Category words that would otherwise dilute name similarity: "Sample Mess" vs "Sample Hostel"
// should be judged mostly on "Sample", not partly cancelled out by "Mess" vs "Hostel".
const CATEGORY_STOPWORDS = new Set([
  'mess',
  'hostel',
  'pg',
  'pgs',
  'hotel',
  'restaurant',
  'cafe',
  'library',
  'hall',
  'room',
  'rooms',
  'lodge',
  'lodging',
]);

/**
 * Lowercase, strips diacritics and punctuation, folds a handful of common Indic spelling variants
 * (`aa`→`a`, `w`→`v`, `ph`→`f`) and drops generic category words. Two names that normalize to the
 * same (possibly empty) string are treated as identical by `jaroWinkler`.
 */
export function normalizeName(name: string): string {
  const stripped = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const folded = stripped.replace(/ph/g, 'f').replace(/w/g, 'v').replace(/aa/g, 'a');
  return folded
    .split(/\s+/)
    .filter((token) => token.length > 0 && !CATEGORY_STOPWORDS.has(token))
    .join(' ')
    .trim();
}

/** Jaro similarity (0-1), the base Jaro-Winkler computes a prefix bonus on top of. */
function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);
  const aMatches = new Array<boolean>(aLen).fill(false);
  const bMatches = new Array<boolean>(bLen).fill(false);
  let matches = 0;

  for (let i = 0; i < aLen; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  transpositions = Math.floor(transpositions / 2);

  return (matches / aLen + matches / bLen + (matches - transpositions) / matches) / 3;
}

/** Jaro-Winkler similarity (0-1): Jaro plus a bonus for a shared prefix (up to 4 characters). */
export function jaroWinkler(a: string, b: string): number {
  const jaro = jaroSimilarity(a, b);
  const maxPrefix = Math.min(4, a.length, b.length);
  let prefixLength = 0;
  while (prefixLength < maxPrefix && a[prefixLength] === b[prefixLength]) prefixLength += 1;
  return jaro + prefixLength * 0.1 * (1 - jaro);
}

/** 1.0 at 50 m or closer, falling linearly to 0 at 300 m or further. */
export function geoScore(meters: number): number {
  if (meters <= 50) return 1;
  if (meters >= 300) return 0;
  return 1 - (meters - 50) / 250;
}

export interface CategoryRef {
  id: string;
  /** A leaf category's parent (its "group"); null only for a top-level group, never for a leaf. */
  parentId: string | null;
}

/** Same leaf category = 1, same group (shared parent) = 0.5, otherwise = 0. */
export function categoryScore(a: CategoryRef, b: CategoryRef): number {
  if (a.id === b.id) return 1;
  if (a.parentId !== null && a.parentId === b.parentId) return 0.5;
  return 0;
}

function normalizeAddress(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
}

/** Overlap coefficient (intersection / smaller set) of the two addresses' word tokens. */
export function addressScore(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const tokensA = new Set(normalizeAddress(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeAddress(b).split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
  return intersection / Math.min(tokensA.size, tokensB.size);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** Exact match after stripping formatting and a leading `+91`/`0` = 1, otherwise 0. */
export function phoneScore(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const normalizedA = normalizePhone(a);
  const normalizedB = normalizePhone(b);
  return normalizedA.length >= 6 && normalizedA === normalizedB ? 1 : 0;
}

type InternalLevel = DuplicateLevel | 'none';

function levelOf(score: number): InternalLevel {
  if (score >= DUPLICATE_THRESHOLDS.block) return 'block';
  if (score >= DUPLICATE_THRESHOLDS.suggest) return 'suggest';
  return 'none';
}

export interface ScoreSubject {
  name: string;
  category: CategoryRef;
  latitude: number;
  longitude: number;
  address?: string | undefined;
  phone?: string | undefined;
}

export interface CandidatePlace {
  id: string;
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
  address: string;
  phone: string | null;
  /** Null when the candidate has no primary category on record (never happens for a real place, but kept total). */
  primaryCategory: CategoryRef | null;
}

interface ScoredCandidate extends Omit<DuplicateCandidate, 'level'> {
  level: InternalLevel;
}

/**
 * The composite score for one candidate: `0.45 name + 0.25 geo + 0.15 category + 0.10 address +
 * 0.05 phone`, with two overrides that guarantee a `block`-level score regardless of the blend: an
 * exact phone match, or a near-exact name within 100 m.
 */
export function scoreCandidate(subject: ScoreSubject, candidate: CandidatePlace): ScoredCandidate {
  const meters = Math.round(distanceMeters(subject, candidate));
  const nameSimilarity = jaroWinkler(normalizeName(subject.name), normalizeName(candidate.name));
  const geo = geoScore(meters);
  const category = candidate.primaryCategory
    ? categoryScore(subject.category, candidate.primaryCategory)
    : 0;
  const address = addressScore(subject.address, candidate.address);
  const phone = phoneScore(subject.phone, candidate.phone);

  let composite = 0.45 * nameSimilarity + 0.25 * geo + 0.15 * category + 0.1 * address + 0.05 * phone;
  if (phone === 1) composite = Math.max(composite, 0.9);
  if (nameSimilarity >= 0.92 && meters <= 100) composite = Math.max(composite, 0.9);
  composite = Math.min(1, composite);

  const reasons: string[] = [];
  if (nameSimilarity >= 0.8) reasons.push('Similar name');
  reasons.push(`${meters} m away`);
  if (category === 1) reasons.push('Same category');
  else if (category === 0.5) reasons.push('Same category group');
  if (phone === 1) reasons.push('Same phone number');

  return {
    placeId: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    distanceMeters: meters,
    score: Math.round(composite * 1000) / 1000,
    level: levelOf(composite),
    reasons,
  };
}

/** Every candidate scored, `none`-level ones dropped, best first, ties broken by id (stable paging). */
export function rankCandidates(
  subject: ScoreSubject,
  candidates: readonly CandidatePlace[],
  limit = 5,
): DuplicateCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(subject, candidate))
    .filter((scored): scored is ScoredCandidate & { level: DuplicateLevel } => scored.level !== 'none')
    .sort((a, b) => b.score - a.score || a.placeId.localeCompare(b.placeId))
    .slice(0, limit)
    .map(({ level, ...candidate }) => ({ ...candidate, level }));
}

/** Whether any candidate scored at or above the `block` threshold. */
export function hasBlockingCandidate(candidates: readonly DuplicateCandidate[]): boolean {
  return candidates.some((candidate) => candidate.level === 'block');
}
