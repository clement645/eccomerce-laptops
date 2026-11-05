import type { CookieOptions, Request, Response } from 'express';
import type { Audience } from './auth.types.js';

/** Refresh cookies are host-only on the API, HttpOnly, and scoped to the auth paths that read them. */
export const REFRESH_COOKIE: Record<
  Audience,
  { name: string; path: string; sameSite: 'lax' | 'strict' }
> = {
  storefront: { name: 'sf_rt', path: '/api/v1/auth', sameSite: 'lax' },
  admin: { name: 'adm_rt', path: '/api/v1/admin/auth', sameSite: 'strict' },
};

function options(audience: Audience, secure: boolean, maxAgeMs?: number): CookieOptions {
  const cookie = REFRESH_COOKIE[audience];
  return {
    httpOnly: true,
    secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function setRefreshCookie(
  res: Response,
  audience: Audience,
  token: string,
  maxAgeMs: number,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE[audience].name, token, options(audience, secure, maxAgeMs));
}

export function clearRefreshCookie(res: Response, audience: Audience, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE[audience].name, options(audience, secure));
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
