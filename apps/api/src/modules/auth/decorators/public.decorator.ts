import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'platform:is-public';

/**
 * Opts a route (or a whole controller) out of authentication. The API is secure by default: every
 * route requires a valid access token unless it says `@Public()` explicitly.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
