import { z } from 'zod';

/** Values inlined into the browser bundle. Never add secrets here. */
export const storefrontPublicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_API_URL: z.url({ protocol: /^https?$/ }),
});
export type StorefrontPublicEnv = z.infer<typeof storefrontPublicEnvSchema>;

/** Server-only values (React Server Components, route handlers). */
export const storefrontServerEnvSchema = storefrontPublicEnvSchema.extend({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** Shared with the API; authorises POST /api/revalidate. */
  REVALIDATE_SECRET: z.string().min(32).optional(),
});
export type StorefrontServerEnv = z.infer<typeof storefrontServerEnvSchema>;
