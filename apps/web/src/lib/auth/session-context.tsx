'use client';

import type { AuthUser, LoginRequest, RegisterRequest } from '@platform/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService } from '@/services/auth.service';
import { tokenStore } from './token-store';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
}

interface SessionContextValue extends SessionState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Stores the new tokens and fetches the user they belong to. */
async function establishSession(accessToken: string, refreshToken: string): Promise<AuthUser> {
  tokenStore.setAccessToken(accessToken);
  tokenStore.setRefreshToken(refreshToken);
  const me = await authService.me();
  return me.data;
}

function clearSession(): void {
  tokenStore.setAccessToken(null);
  tokenStore.setRefreshToken(null);
}

/**
 * Bootstraps the session once per app load from the refresh token in `localStorage` (the access
 * token itself is never persisted), and exposes login/register/logout to the rest of the app.
 * There is deliberately no per-request "401 -> silent refresh -> retry" interceptor yet: every page
 * built in this phase either needs no session (public browsing) or only reads it for display, so
 * that additional plumbing is left for the phase that adds the first session-gated page.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // Lazy initial state (rather than an effect) so the "no stored session" case never needs a
  // synchronous setState from inside an effect: there is simply nothing to bootstrap.
  const [state, setState] = useState<SessionState>(() => ({
    status: tokenStore.getStoredRefreshToken() ? 'loading' : 'unauthenticated',
    user: null,
  }));

  useEffect(() => {
    const storedRefreshToken = tokenStore.getStoredRefreshToken();
    if (!storedRefreshToken) return;

    let cancelled = false;
    authService
      .refresh(storedRefreshToken)
      .then((result) => establishSession(result.data.accessToken, result.data.refreshToken))
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch(() => {
        clearSession();
        if (!cancelled) setState({ status: 'unauthenticated', user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    const result = await authService.login(credentials);
    const user = await establishSession(result.data.accessToken, result.data.refreshToken);
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    await authService.register(data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // The server-side session may already be gone (expired token, etc.); clear locally regardless.
    }
    clearSession();
    setState({ status: 'unauthenticated', user: null });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
