import type { CookieOptions, Request, Response } from 'express';
import { sameSiteAttributes, type CookiePolicy } from '../../common/http/cookie-policy.js';
import type { Audience } from './auth.types.js';

/**
 * Refresh cookies are host-only on the API, HttpOnly, and scoped to the auth paths that read them.
 * SameSite below applies when the apps share the API's site; see CookiePolicy otherwise.
 */
export const REFRESH_COOKIE: Record<
  Audience,
  { name: string; path: string; sameSite: 'lax' | 'strict' }
> = {
  storefront: { name: 'sf_rt', path: '/api/v1/auth', sameSite: 'lax' },
  admin: { name: 'adm_rt', path: '/api/v1/admin/auth', sameSite: 'strict' },
};

function options(audience: Audience, policy: CookiePolicy, maxAgeMs?: number): CookieOptions {
  const cookie = REFRESH_COOKIE[audience];
  return {
    httpOnly: true,
    ...sameSiteAttributes(policy, cookie.sameSite),
    path: cookie.path,
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function setRefreshCookie(
  res: Response,
  audience: Audience,
  token: string,
  maxAgeMs: number,
  policy: CookiePolicy,
): void {
  res.cookie(REFRESH_COOKIE[audience].name, token, options(audience, policy, maxAgeMs));
}

export function clearRefreshCookie(res: Response, audience: Audience, policy: CookiePolicy): void {
  res.clearCookie(REFRESH_COOKIE[audience].name, options(audience, policy));
}

export function readRefreshCookie(req: Request, audience: Audience): string | null {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE[audience].name
  ];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
}

export function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}
