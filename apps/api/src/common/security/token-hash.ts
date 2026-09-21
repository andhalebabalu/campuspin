import { createHash, randomBytes } from 'node:crypto';

/**
 * A fresh, unguessable one-time token for an email link: 256 bits from the OS CSPRNG, URL-safe
 * (43 characters). The raw value goes into the email only; the database stores `hashToken(raw)`.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 (64 hex characters) of a token. A fast hash is correct here, unlike for passwords: the
 * input already has 256 bits of entropy (or is a signed JWT), so there is nothing to brute-force,
 * and lookup by hash stays a single indexed equality query.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * A short, non-reversible fingerprint for logs and audit rows (first 16 hex characters of the
 * SHA-256), so repeated attempts against the same value can be correlated without storing it.
 */
export function fingerprint(value: string): string {
  return hashToken(value).slice(0, 16);
}
