import { randomInt, timingSafeEqual } from 'node:crypto';
import { STUDENT_CODE_LENGTH, type StudentBadge } from '@platform/contracts';
import { hashToken } from '../../common/security/token-hash.js';

/**
 * Student verification rules as pure functions (no database, no framework), unit-tested directly.
 */

/** The part after "@", lowercase. */
export function emailDomain(email: string): string {
  return email
    .slice(email.lastIndexOf('@') + 1)
    .trim()
    .toLowerCase();
}

/**
 * True when the address is on one of the college's official domains, or a subdomain of one
 * ("asha@students.abc.edu.in" matches "abc.edu.in"; "asha@notabc.edu.in" does not).
 */
export function domainAllowed(email: string, domains: readonly string[]): boolean {
  const domain = emailDomain(email);
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** "asha.kulkarni@abc.edu.in" -> "as***@abc.edu.in": enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** A uniformly random numeric code, leading zeros kept ("004817"). */
export function generateCode(): string {
  return String(randomInt(0, 10 ** STUDENT_CODE_LENGTH)).padStart(STUDENT_CODE_LENGTH, '0');
}

/** Compares a typed code with the stored hash in constant time. */
export function codeMatches(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface BadgeSource {
  verifiedCollege: { id: string; slug: string; name: string } | null;
  studentVerifiedUntil: Date | null;
}

/** Verified = a verified college, not yet lapsed. A lapsed one shows no college at all. */
export function studentBadge(user: BadgeSource, now: Date = new Date()): StudentBadge {
  const lapsed =
    user.studentVerifiedUntil !== null && user.studentVerifiedUntil.getTime() <= now.getTime();
  // `!= null`: a missing relation (undefined) must never count as verified.
  const verified = user.verifiedCollege != null && !lapsed;
  return {
    verified,
    college:
      verified && user.verifiedCollege
        ? {
            id: user.verifiedCollege.id,
            slug: user.verifiedCollege.slug,
            name: user.verifiedCollege.name,
          }
        : null,
    verifiedUntil:
      verified && user.studentVerifiedUntil ? user.studentVerifiedUntil.toISOString() : null,
  };
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}
