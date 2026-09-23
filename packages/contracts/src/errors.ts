import { z } from 'zod';

/**
 * Machine-readable error codes returned in `error.code`.
 * Clients localise and branch on the code, never on the human-readable `message`.
 * Domain codes (auth, duplicates, uploads, ...) are added by the phase that introduces them.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'DATABASE_UNAVAILABLE',
  'INTERNAL_ERROR',
  // Authentication (Phase 3). The HTTP status disambiguates where a code is reused.
  'INVALID_CREDENTIALS', // 401: wrong email or password (deliberately not saying which)
  'EMAIL_NOT_VERIFIED', // 403: credentials are right, but the email is not verified yet
  'ACCOUNT_SUSPENDED', // 403: credentials are right, but a moderator suspended the account
  'ACCOUNT_DEACTIVATED', // 403: credentials are right, but the account is deactivated
  'EMAIL_ALREADY_REGISTERED', // 409
  'TOKEN_INVALID', // 401 refresh token / 400 email-link token: unknown, already used or revoked
  'TOKEN_EXPIRED', // 401 access token (refresh it) / 400 email-link token (request a new one)
  // Student submissions (Phase 8). 409: server-side duplicate detection scored an existing place
  // at or above the "block" threshold and the caller did not confirm this is a different place.
  'DUPLICATE_PLACE_SUSPECTED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);
