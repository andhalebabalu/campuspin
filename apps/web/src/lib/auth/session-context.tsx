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
import { refreshSession } from '@/lib/api/client';
import { authService } from '@/services/auth.service';
import { tokenStore } from './token-store';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
}

interface SessionContextValue extends SessionState {
  /** Signs in and resolves with the signed-in user (e.g. to pick where to go next by role). */
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Stores the new tokens (after login) and fetches the user they belong to. */
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
 * While signed in, the API client rotates the access token shortly before it expires (see
 * `lib/api/client.ts`), so long-lived pages such as the business dashboard keep working.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // Always 'loading' first, on the server AND in the browser: the server cannot see localStorage,
  // so deciding from it here made the first client render differ from the server HTML (a
  // hydration error for every signed-in visitor). The effect settles it right after hydration.
  const [state, setState] = useState<SessionState>({ status: 'loading', user: null });

  useEffect(() => {
    let cancelled = false;
    // Through the app-wide single-flight refresh: Strict Mode runs this effect twice in
    // development, and two refreshes with the same token would look like theft to the server.
    refreshSession()
      .then(async (accessToken) => {
        // No stored session (or a dead one): simply signed out.
        if (!accessToken) throw new Error('No session to restore');
        return (await authService.me()).data;
      })
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
    return user;
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
