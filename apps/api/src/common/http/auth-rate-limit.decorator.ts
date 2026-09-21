import { SetMetadata } from '@nestjs/common';

export const AUTH_RATE_LIMIT_KEY = 'platform:auth-rate-limit';

/**
 * Applies the stricter `AUTH_RATE_LIMIT` (per client IP, per route) instead of the global
 * `THROTTLE_LIMIT`. Put it on every route that checks a credential or sends an email.
 */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMIT_KEY, true);
