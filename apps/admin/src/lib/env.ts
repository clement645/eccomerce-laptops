import { adminEnvSchema, parseEnv } from '@repo/configuration';

export const env = parseEnv('admin', adminEnvSchema, {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_STOREFRONT_URL: import.meta.env.VITE_STOREFRONT_URL || undefined,
});
