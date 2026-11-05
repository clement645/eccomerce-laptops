import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ApiError, type RequestOptions } from '@repo/api-client';
import type {
  AdminAuthResponse,
  AdminLoginChallenge,
  AdminUser,
  MfaSetupResponse,
  Permission,
} from '@repo/shared-types';
import { api, setAccessToken } from '@/lib/api';

/** Header required by the API on cookie-authenticated endpoints (CSRF defence). */
const COOKIE_REQUEST = { 'X-Requested-With': 'fetch' };

/**
 * Staff session. The access token lives only in memory; the HttpOnly, SameSite=Strict refresh cookie
 * restores the session on reload. Staff sessions end after a fixed 12 hours.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AdminUser | null>(null);
  const status = ref<'unknown' | 'authenticated' | 'anonymous'>('unknown');
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<boolean> | null = null;

  const isAuthenticated = computed(() => status.value === 'authenticated');
  const can = (permission: Permission) => user.value?.permissions.includes(permission) ?? false;

  function accept(response: AdminAuthResponse) {
    setAccessToken(response.accessToken);
    user.value = response.user;
    status.value = 'authenticated';
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), Math.max(30, response.expiresIn - 60) * 1000);
  }

  function clear() {
    setAccessToken(null);
    clearTimeout(refreshTimer);
    user.value = null;
    status.value = 'anonymous';
  }

  /** Single-flight refresh; resolves to whether a session exists. */
  function refresh(): Promise<boolean> {
    inflight ??= (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          accept(
            await api.request<AdminAuthResponse>('/admin/auth/refresh', {
              method: 'POST',
              headers: COOKIE_REQUEST,
            }),
          );
          return true;
        } catch (error) {
          if (error instanceof ApiError && error.code === 'REFRESH_IN_PROGRESS' && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            continue;
          }
          clear();
          return false;
        }
      }
      return false;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function ensureSession(): Promise<boolean> {
    if (status.value === 'authenticated') return true;
    if (status.value === 'anonymous') return false;
    return refresh();
  }

  const login = (email: string, password: string) =>
    api.request<AdminLoginChallenge>('/admin/auth/login', {
      method: 'POST',
      body: { email, password },
    });

  const setupMfa = (challengeToken: string) =>
    api.request<MfaSetupResponse>('/admin/auth/mfa/setup', {
      method: 'POST',
      body: { challengeToken },
    });

  async function verifyMfa(challengeToken: string, code: string) {
    accept(
      await api.request<AdminAuthResponse>('/admin/auth/mfa/verify', {
        method: 'POST',
        body: { challengeToken, code },
      }),
    );
  }

  async function logout() {
    try {
      await api.request('/admin/auth/logout', { method: 'POST', headers: COOKIE_REQUEST });
    } finally {
      clear();
    }
  }

  /** Authenticated request that refreshes once on 401. */
  async function request<T>(path: string, init?: RequestOptions): Promise<T> {
    try {
      return await api.request<T>(path, init);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && (await refresh()))
        return api.request<T>(path, init);
      throw error;
    }
  }

  return {
    user,
    status,
    isAuthenticated,
    can,
    ensureSession,
    login,
    setupMfa,
    verifyMfa,
    logout,
    request,
  };
});
