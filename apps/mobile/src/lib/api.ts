import { createApiClient } from '@platform/api-client';
import { refreshResponseSchema } from '@platform/contracts';
import { env } from './env';
import { tokenStore } from './token-store';

const DEFAULT_HEADERS = { 'X-Client': 'mobile' };
/** Refresh this long before the access token expires, so a request never races expiry. */
const REFRESH_MARGIN_MS = 60_000;

/** Used only to rotate tokens. It sends no access token, so refreshing can never recurse. */
const refreshClient = createApiClient({ baseUrl: env.API_URL, defaultHeaders: DEFAULT_HEADERS });

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

/** The `exp` claim of a JWT in milliseconds, or null if it cannot be read. */
function expiresAt(token: string): number | null {
  try {
    const exp = (JSON.parse(decodeBase64Url(token.split('.')[1] ?? '')) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshing: Promise<string | null> | null = null;

/**
 * Rotates the stored refresh token and resolves with the new access token, or null when there is
 * no session to refresh. SINGLE-FLIGHT: the server rotates refresh tokens and treats a reused one
 * as theft, so two parallel refreshes would sign the user out.
 */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const result = await refreshClient.post('/auth/refresh', {
        body: { refreshToken },
        schema: refreshResponseSchema,
      });
      await tokenStore.setRefreshToken(result.data.refreshToken);
      tokenStore.setAccessToken(result.data.accessToken);
      return result.data.accessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** The access token to send, rotated first when it is about to expire (they live 15 minutes). */
export async function currentAccessToken(): Promise<string | null> {
  const token = tokenStore.getAccessToken();
  if (!token) return null;
  const expiry = expiresAt(token);
  if (expiry === null || expiry - Date.now() > REFRESH_MARGIN_MS) return token;
  return (await refreshSession()) ?? token;
}

/** The single HTTP client for the NestJS API. Screens use a service from src/services. */
export const apiClient = createApiClient({
  baseUrl: env.API_URL,
  defaultHeaders: DEFAULT_HEADERS,
  getAccessToken: currentAccessToken,
});

/** Headers for requests made outside the JSON client (image uploads, private images). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await currentAccessToken();
  return { ...DEFAULT_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Same as `apiClient`, with a longer timeout: photos from a phone camera upload slowly on mobile data. */
export const uploadClient = createApiClient({
  baseUrl: env.API_URL,
  defaultHeaders: DEFAULT_HEADERS,
  getAccessToken: currentAccessToken,
  timeoutMs: 90_000,
});
