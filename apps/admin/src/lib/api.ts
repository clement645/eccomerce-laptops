import { createApiClient } from '@repo/api-client';
import { env } from './env';

/** Access token is held in memory only (set by the auth store in Phase 5). */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** For downloads that are not JSON (e.g. CSV exports). */
export function getAccessToken(): string | null {
  return accessToken;
}

export const api = createApiClient({
  baseUrl: env.VITE_API_URL,
  getAccessToken: () => accessToken,
});
