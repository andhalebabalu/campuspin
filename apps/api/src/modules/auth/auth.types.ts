import type { Request } from 'express';

/**
 * The caller, as established by `JwtAuthGuard` from a verified access token. The roles here come
 * from the SIGNED token (never from anything the client sends), so they are trustworthy but can be
 * up to one access-token lifetime old; `/auth/me` and every refresh read them fresh from the database.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: readonly string[];
  /** The session (refresh-token family) this access token belongs to. */
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
