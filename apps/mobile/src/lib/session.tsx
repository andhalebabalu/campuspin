import type { AuthUser, LoginRequest, RegisterRequest } from '@platform/contracts';
import { useQueryClient } from '@tanstack/react-query';
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
import { refreshSession } from './api';
import { tokenStore } from './token-store';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Which app a signed-in account gets. The mobile app has no admin panel: staff accounts are told to
 * use the web app instead.
 */
export type AppKind = 'student' | 'business' | 'staff';

const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

export function appKindOf(user: Pick<AuthUser, 'roles'>): AppKind {
  if (user.roles.includes('BUSINESS_OWNER')) return 'business';
  if (user.roles.includes('STUDENT')) return 'student';
  if (user.roles.some((role) => STAFF_ROLES.has(role))) return 'staff';
  return 'student';
}

interface SessionContextValue {
  status: SessionStatus;
  user: AuthUser | null;
  /** The last signed-in user, kept after sign-out (see useUser). */
  lastUser: AuthUser | null;
  app: AppKind | null;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the signed-in user (e.g. after student verification changes their badge). */
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Restores the session once per app start from the refresh token in secure storage, and exposes
 * login/register/logout. The API client rotates the access token shortly before it expires.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setCurrentUser] = useState<AuthUser | null>(null);
  const [lastUser, setLastUser] = useState<AuthUser | null>(null);
  const setUser = useCallback((next: AuthUser | null) => {
    setCurrentUser(next);
    if (next) setLastUser(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then(async (accessToken) => {
        if (!accessToken) throw new Error('No session to restore');
        return (await authService.me()).data;
      })
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(async () => {
        tokenStore.setAccessToken(null);
        if (cancelled) return;
        setUser(null);
        setStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  const login = useCallback(async (credentials: LoginRequest) => {
    const result = await authService.login(credentials);
    tokenStore.setAccessToken(result.data.accessToken);
    await tokenStore.setRefreshToken(result.data.refreshToken);
    const me = (await authService.me()).data;
    setUser(me);
    setStatus('authenticated');
    return me;
  }, [setUser]);

  const register = useCallback(async (data: RegisterRequest) => {
    await authService.register(data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // The server-side session may already be gone; sign out locally regardless.
    }
    tokenStore.setAccessToken(null);
    await tokenStore.setRefreshToken(null);
    queryClient.clear();
    setUser(null);
    setStatus('unauthenticated');
  }, [queryClient, setUser]);

  const refreshUser = useCallback(async () => {
    try {
      setUser((await authService.me()).data);
    } catch {
      // Keep the current user; a failed re-read is not a sign-out.
    }
  }, [setUser]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      lastUser,
      app: user ? appKindOf(user) : null,
      login,
      register,
      logout,
      refreshUser,
    }),
    [status, user, lastUser, login, register, logout, refreshUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}

/**
 * The signed-in user, for screens behind a signed-in guard. Right after sign-out those screens can
 * render once more before the navigator removes them, so they get the last user instead of null.
 */
export function useUser(): AuthUser {
  const { user, lastUser } = useSession();
  const current = user ?? lastUser;
  if (!current) throw new Error('useUser needs a signed-in session');
  return current;
}
