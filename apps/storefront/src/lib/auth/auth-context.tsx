'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, createApiClient, type RequestOptions } from '@repo/api-client';
import type { AuthResponse, SessionUser } from '@repo/shared-types';
import { PUBLIC_API_URL } from '@/lib/public-config';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: SessionUser | null;
  /** Store a successful login response. */
  signIn: (response: AuthResponse) => void;
  signOut: () => Promise<void>;
  setUser: (user: SessionUser) => void;
  /** Authenticated API request; refreshes the access token once on 401. */
  request: <T>(path: string, init?: RequestOptions) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const publicApi = createApiClient({ baseUrl: PUBLIC_API_URL });
/** Header required by the API on cookie-authenticated endpoints (CSRF defence). */
const COOKIE_REQUEST_HEADERS = { 'X-Requested-With': 'fetch' };

/**
 * Non-secret hint that this browser has signed in, so anonymous visitors don't send a refresh
 * request on every page view. The HttpOnly cookie remains the only credential.
 */
const SESSION_HINT = 'sf_signed_in';
function setHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(SESSION_HINT, '1');
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    // storage unavailable (private mode): we simply try a refresh every time
  }
}
function hasHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === '1';
  } catch {
    return true;
  }
}

/**
 * The access token lives only in memory (never localStorage), so XSS cannot read a long-lived
 * credential. The HttpOnly refresh cookie restores the session on page load.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const tokenRef = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<Promise<string | null> | null>(null);
  // Lets the expiry timer call the latest refresh without a declaration-order dependency.
  const refreshRef = useRef<() => Promise<string | null>>(() => Promise.resolve(null));

  const accept = useCallback((response: AuthResponse) => {
    tokenRef.current = response.accessToken;
    setHint(true);
    setUser(response.user);
    setStatus('authenticated');
    clearTimeout(refreshTimer.current);
    // Refresh a minute before expiry so requests rarely hit a 401.
    refreshTimer.current = setTimeout(
      () => void refreshRef.current(),
      Math.max(30, response.expiresIn - 60) * 1000,
    );
  }, []);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setHint(false);
    clearTimeout(refreshTimer.current);
    setUser(null);
    setStatus('anonymous');
  }, []);

  /** Single-flight refresh: concurrent callers share one request. */
  const refresh = useCallback((): Promise<string | null> => {
    inflight.current ??= (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await publicApi.request<AuthResponse>('/auth/refresh', {
            method: 'POST',
            headers: COOKIE_REQUEST_HEADERS,
          });
          accept(response);
          return response.accessToken;
        } catch (error) {
          // Another tab refreshed at the same moment; the browser now holds the new cookie.
          if (error instanceof ApiError && error.code === 'REFRESH_IN_PROGRESS' && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            continue;
          }
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) clear();
          else setStatus((current) => (current === 'loading' ? 'anonymous' : current));
          return null;
        }
      }
      return null;
    })().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, [accept, clear]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (hasHint()) void refresh();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with browser storage
    else setStatus('anonymous');
    return () => clearTimeout(refreshTimer.current);
  }, [refresh]);

  const request = useCallback(
    async <T,>(path: string, init: RequestOptions = {}): Promise<T> => {
      const call = (token: string | null) =>
        createApiClient({ baseUrl: PUBLIC_API_URL, getAccessToken: () => token }).request<T>(
          path,
          init,
        );
      try {
        return await call(tokenRef.current ?? (await refresh()));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          const token = await refresh();
          if (token) return call(token);
        }
        throw error;
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await publicApi.request('/auth/logout', { method: 'POST', headers: COOKIE_REQUEST_HEADERS });
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn: accept, signOut, setUser, request }),
    [status, user, accept, signOut, request],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export { publicApi };
