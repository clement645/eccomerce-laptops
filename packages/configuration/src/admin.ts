import { z } from 'zod';

/** Build-time values inlined into the admin bundle. Never add secrets here. */
export const adminEnvSchema = z.object({
  VITE_API_URL: z.url({ protocol: /^https?$/ }),
  /** For "View in store" links. Optional. */
  VITE_STOREFRONT_URL: z.url({ protocol: /^https?$/ }).optional(),
});
export type AdminEnv = z.infer<typeof adminEnvSchema>;
