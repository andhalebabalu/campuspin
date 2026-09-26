import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'platform:is-public';

/**
 * Opts a route (or a whole controller) out of authentication. The API is secure by default: every
 * route requires a valid access token unless it says `@Public()` explicitly.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_OPTIONAL_AUTH_KEY = 'platform:optional-auth';

/**
 * A public route that also recognises a signed-in caller: with no token it runs anonymously, with a
 * valid token the caller is on `request.user` (read it with `@Viewer()`), and with an invalid or
 * expired token it answers 401 so the client refreshes instead of silently seeing less.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
