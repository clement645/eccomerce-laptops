import {
  parseEnv,
  storefrontServerEnvSchema,
  storefrontPublicEnvSchema,
} from '@repo/configuration';

/**
 * NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them at build time.
 */
export const publicEnv = parseEnv('storefront', storefrontPublicEnvSchema, {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

/** Server-only configuration. Importing this from a client component is a bug. */
export function getServerEnv() {
  return parseEnv('storefront', storefrontServerEnvSchema, {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    API_INTERNAL_URL: process.env.API_INTERNAL_URL,
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET,
  });
}
