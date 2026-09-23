const REFRESH_TOKEN_KEY = 'link.refreshToken';

type Listener = () => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Holds the access token in memory (never persisted) and the refresh token in `localStorage` (so a
 * page reload can restore the session). A plain module, not React state, because the API client is
 * a singleton created outside any component tree and reads the access token synchronously.
 */
export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
    notify();
  },

  getStoredRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setRefreshToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (token) window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
      else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // Private browsing or blocked storage: the session just won't survive a reload.
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
