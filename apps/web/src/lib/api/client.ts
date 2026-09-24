import { createApiClient } from '@platform/api-client';
import { refreshResponseSchema } from '@platform/contracts';
import { tokenStore } from '@/lib/auth/token-store';
import { env } from '@/lib/env';

const DEFAULT_HEADERS = { 'X-Client': 'web' };
/** Refresh this long before the access token actually expires, so a request never races expiry. */
const REFRESH_MARGIN_MS = 60_000;

/** Used only to rotate tokens. It sends no access token, so refreshing can never recurse. */
const refreshClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  defaultHeaders: DEFAULT_HEADERS,
});

/** The `exp` claim of a JWT in milliseconds, or null if it cannot be read. */
function expiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshing: Promise<string | null> | null = null;

/**
 * Rotates the stored refresh token and resolves with the new access token, or null when there is
 * no session to refresh (none stored, revoked, expired). SINGLE-FLIGHT for the whole app: the server
 * rotates refresh tokens and treats a reused one as theft, so two parallel refreshes (a page's
 * requests racing, or React Strict Mode running the session bootstrap twice) would sign the user
 * out. Every caller that needs a refresh goes through here.
 */
export function refreshSession(): Promise<string | null> {
  const refreshToken = tokenStore.getStoredRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  refreshing ??= refreshClient
    .post('/auth/refresh', { body: { refreshToken }, schema: refreshResponseSchema })
    .then((result) => {
      tokenStore.setRefreshToken(result.data.refreshToken);
      tokenStore.setAccessToken(result.data.accessToken);
      return result.data.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * The access token to send, rotated first when it is about to expire (access tokens live 15
 * minutes, so a page left open — the business dashboard, a long form — would otherwise start failing
 * with 401).
 */
async function currentAccessToken(): Promise<string | null> {
  const token = tokenStore.getAccessToken();
  if (!token) return null;
  const expiry = expiresAt(token);
  if (expiry === null || expiry - Date.now() > REFRESH_MARGIN_MS) return token;

  // No session left to refresh: send the old token and let the request answer 401.
  return (await refreshSession()) ?? token;
}

/**
 * The single HTTP client for the NestJS API. It centralises the base URL, headers,
 * response parsing and error handling. Components never call fetch() directly: they use
 * a service from src/services, which uses this client.
 */
export const apiClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  defaultHeaders: DEFAULT_HEADERS,
  getAccessToken: currentAccessToken,
});
