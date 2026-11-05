import 'server-only';
import { createApiClient } from '@repo/api-client';
import { getServerEnv } from './env';

/** API client for React Server Components and route handlers. */
export function serverApi() {
  const env = getServerEnv();
  return createApiClient({ baseUrl: env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL });
}
