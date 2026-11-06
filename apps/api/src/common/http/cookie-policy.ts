import type { ApiEnv } from '@repo/configuration';
import type { CookieOptions } from 'express';

export interface CookiePolicy {
  /** Secure flag (production, https). */
  secure: boolean;
  /** Apps and API on different sites: SameSite=None with Partitioned (needs Secure). */
  crossSite: boolean;
}

export function cookiePolicy(env: Pick<ApiEnv, 'NODE_ENV' | 'CROSS_SITE_COOKIES'>): CookiePolicy {
  const secure = env.NODE_ENV === 'production';
  // Browsers reject SameSite=None without Secure, so it only applies over https.
  return { secure, crossSite: secure && env.CROSS_SITE_COOKIES };
}

/**
 * Secure, SameSite and Partitioned attributes. Partitioned (CHIPS) keys the cookie to the site
 * the person is on (the admin or storefront), so it still works where third-party cookies are
 * blocked by default, such as Chrome's incognito mode.
 */
export function sameSiteAttributes(
  policy: CookiePolicy,
  sameSite: 'lax' | 'strict',
): Pick<CookieOptions, 'secure' | 'sameSite' | 'partitioned'> {
  return policy.crossSite
    ? { secure: true, sameSite: 'none', partitioned: true }
    : { secure: policy.secure, sameSite };
}
