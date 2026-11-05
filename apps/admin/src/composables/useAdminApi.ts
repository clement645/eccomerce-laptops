import type { RequestOptions } from '@repo/api-client';
import { useAuthStore } from '@/stores/auth';

/** Authenticated calls to /admin/*. Retries once after refreshing an expired access token. */
export function useAdminApi() {
  const auth = useAuthStore();
  const call = <T>(path: string, init?: RequestOptions) => auth.request<T>(`/admin${path}`, init);
  return {
    get: <T>(path: string, query?: RequestOptions['query']) => call<T>(path, { query }),
    post: <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body: unknown) => call<T>(path, { method: 'PUT', body }),
    del: (path: string) => call<void>(path, { method: 'DELETE' }),
    upload: <T>(file: File, folder: string) =>
      call<T>('/media', { method: 'POST', body: file, query: { folder } }),
  };
}
