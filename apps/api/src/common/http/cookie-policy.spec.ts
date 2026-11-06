import express from 'express';
import request from 'supertest';
import { setRefreshCookie } from '../../modules/auth/cookies.js';
import { writeGuestCartToken } from '../../modules/cart/cart-cookie.js';
import { cookiePolicy, type CookiePolicy } from './cookie-policy.js';

const TOKEN = 'a'.repeat(43);

async function setCookieHeaders(policy: CookiePolicy): Promise<string[]> {
  const app = express();
  app.get('/', (_req, res) => {
    setRefreshCookie(res, 'admin', TOKEN, 60_000, policy);
    setRefreshCookie(res, 'storefront', TOKEN, 60_000, policy);
    writeGuestCartToken(res, TOKEN, policy);
    res.end();
  });
  const res = await request(app).get('/');
  return ([] as string[]).concat(res.headers['set-cookie'] ?? []);
}

describe('cookie policy', () => {
  it('only goes cross-site in production with the setting on', () => {
    expect(cookiePolicy({ NODE_ENV: 'production', CROSS_SITE_COOKIES: true })).toEqual({
      secure: true,
      crossSite: true,
    });
    expect(cookiePolicy({ NODE_ENV: 'production', CROSS_SITE_COOKIES: false }).crossSite).toBe(
      false,
    );
    // Browsers reject SameSite=None without Secure, so never over plain http.
    expect(cookiePolicy({ NODE_ENV: 'development', CROSS_SITE_COOKIES: true })).toEqual({
      secure: false,
      crossSite: false,
    });
  });

  it('keeps Strict (admin) and Lax (storefront, cart) when the apps share a site', async () => {
    const [admin, storefront, cart] = await setCookieHeaders({ secure: true, crossSite: false });
    expect(admin).toMatch(/^adm_rt=.*HttpOnly; Secure; SameSite=Strict$/);
    expect(storefront).toMatch(/^sf_rt=.*HttpOnly; Secure; SameSite=Lax$/);
    expect(cart).toMatch(/^sf_cart=.*HttpOnly; Secure; SameSite=Lax$/);
    for (const c of [admin, storefront, cart]) expect(c).not.toMatch(/Partitioned/);
  });

  it('sends every cookie as SameSite=None; Secure; Partitioned across sites', async () => {
    const cookies = await setCookieHeaders({ secure: true, crossSite: true });
    expect(cookies).toHaveLength(3);
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/);
      expect(c).toMatch(/Secure/);
      expect(c).toMatch(/SameSite=None/);
      expect(c).toMatch(/Partitioned/);
    }
    // Paths stay narrow.
    expect(cookies[0]).toMatch(/Path=\/api\/v1\/admin\/auth/);
    expect(cookies[1]).toMatch(/Path=\/api\/v1\/auth/);
  });
});
