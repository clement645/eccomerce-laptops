import type { Request, Response } from 'express';
import { sameSiteAttributes, type CookiePolicy } from '../../common/http/cookie-policy.js';
import { GUEST_CART_TTL_MS } from './cart.service.js';

/** Guest cart cookie: opaque, HttpOnly, readable by the cart and checkout endpoints only. */
const NAME = 'sf_cart';
const PATH = '/api/v1';

export function readGuestCartToken(req: Request): string | null {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[NAME];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
}

export function writeGuestCartToken(res: Response, token: string, policy: CookiePolicy): void {
  res.cookie(NAME, token, {
    httpOnly: true,
    ...sameSiteAttributes(policy, 'lax'),
    path: PATH,
    maxAge: GUEST_CART_TTL_MS,
  });
}

export function clearGuestCartToken(res: Response, policy: CookiePolicy): void {
  res.clearCookie(NAME, { httpOnly: true, ...sameSiteAttributes(policy, 'lax'), path: PATH });
}
