import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { MailService } from '../src/infrastructure/mail/mail.service.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { hashPassword } from '../src/modules/auth/crypto/password.js';
import { totp } from '../src/modules/auth/crypto/totp.js';
import { createTestApp } from './support/test-app.js';

const run = `auth${Date.now()}`;
const STOREFRONT = 'http://localhost:3000';
const ADMIN = 'http://localhost:5173';
const PASSWORD = 'correct horse battery staple';

describe('Authentication (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  let mail: MailService;
  const http = () => request(app.getHttpServer());

  const email = (name: string) => `${run}-${name}@example.com`;
  const lastToken = (to: string): string => {
    const message = [...mail.outbox].reverse().find((m) => m.to === to);
    const token = message?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    if (!token) throw new Error(`No token email for ${to}`);
    return token;
  };
  const cookieFrom = (res: request.Response, name: string): string | null => {
    const header = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith(`${name}=`));
    return header ? header.split(';')[0]!.slice(name.length + 1) : null;
  };
  const refresh = (cookie: string, origin = STOREFRONT) =>
    http()
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('X-Requested-With', 'fetch')
      .set('Cookie', `sf_rt=${cookie}`);

  async function registeredCustomer(name: string) {
    const address = email(name);
    await http()
      .post('/api/v1/auth/register')
      .send({ email: address, password: PASSWORD, firstName: 'Wanjiku', lastName: 'Mwangi' })
      .expect(202);
    await http()
      .post('/api/v1/auth/verify-email')
      .send({ token: lastToken(address) })
      .expect(200);
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: address, password: PASSWORD })
      .expect(200);
    return {
      email: address,
      accessToken: res.body.accessToken as string,
      cookie: cookieFrom(res, 'sf_rt')!,
      userId: res.body.user.id as string,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService).client;
    mail = app.get(MailService);
  });

  beforeEach(async () => {
    // Each test starts with fresh rate-limit budgets.
    const redis = app.get(RedisService).client;
    const keys = await redis.keys('ecommerce-test:ratelimit:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: run } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('customer registration and email verification', () => {
    it('registers with a generic response and sends a verification link', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: email('new'), password: PASSWORD, firstName: 'Amina', lastName: 'Otieno' })
        .expect(202);
      expect(res.body.message).toMatch(/If that email can be used/);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: email('new') } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.emailVerifiedAt).toBeNull();
      expect(mail.outbox.at(-1)).toMatchObject({
        to: email('new'),
        subject: 'Confirm your email address',
      });
    });

    it('does not reveal existing accounts, and tells the owner instead', async () => {
      const before = mail.outbox.length;
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          email: email('new'),
          password: 'another long passphrase',
          firstName: 'X',
          lastName: 'Y',
        })
        .expect(202);
      expect(res.body.message).toMatch(/If that email can be used/);
      expect(mail.outbox.length).toBe(before + 1);
      expect(mail.outbox.at(-1)?.subject).toBe('You already have an account');
      expect(await prisma.user.count({ where: { email: email('new') } })).toBe(1);
    });

    it('rejects weak passwords with field details', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: email('weak'), password: 'short', firstName: 'A', lastName: 'B' })
        .expect(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'password' })]),
      );
    });

    it('blocks sign-in until the email is verified, and links are single-use', async () => {
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('new'), password: PASSWORD })
        .expect(403);
      // The latest email is the "account exists" notice; the verification link is in the first one.
      const verification = mail.outbox.find(
        (m) => m.to === email('new') && m.subject === 'Confirm your email address',
      )!;
      const verifyToken = verification.text.match(/token=([A-Za-z0-9_-]+)/)![1]!;
      await http().post('/api/v1/auth/verify-email').send({ token: verifyToken }).expect(200);
      const reuse = await http()
        .post('/api/v1/auth/verify-email')
        .send({ token: verifyToken })
        .expect(400);
      expect(reuse.body.error.code).toBe('INVALID_TOKEN');
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('new'), password: PASSWORD })
        .expect(200);
    });
  });

  describe('customer sign-in', () => {
    it('returns an access token and an HttpOnly, path-scoped refresh cookie', async () => {
      const { accessToken } = await registeredCustomer('login');
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('login'), password: PASSWORD })
        .expect(200);
      const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
      expect(setCookie).toMatch(/sf_rt=[A-Za-z0-9_-]{43}/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(setCookie).toMatch(/SameSite=Lax/);
      expect(res.body).toMatchObject({
        expiresIn: 600,
        user: { email: email('login'), firstName: 'Wanjiku', emailVerified: true },
      });
      const stored = await prisma.session.findMany({ where: { user: { email: email('login') } } });
      // Only hashes are stored.
      expect(stored.every((s) => /^[0-9a-f]{64}$/.test(s.refreshTokenHash))).toBe(true);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      await registeredCustomer('wrongpw');
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('wrongpw'), password: 'not the password' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('nobody'), password: 'not the password' })
        .expect(401);
      expect(wrong.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: unknown.body.error.message,
      });
    });

    it('locks the account after 5 failed attempts', async () => {
      await registeredCustomer('lockout');
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/login')
          .send({ email: email('lockout'), password: 'wrong password!' })
          .expect(401);
      }
      const locked = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('lockout'), password: PASSWORD })
        .expect(429);
      expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    });

    it('rate-limits login attempts per client', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (
            await http()
              .post('/api/v1/auth/login')
              .send({ email: email(`rl${i}`), password: 'whatever pass' })
          ).status,
        );
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it('rejects missing, forged, expired and wrong-audience tokens', async () => {
      const { accessToken, userId } = await registeredCustomer('tokens');
      await http().get('/api/v1/auth/me').expect(401);
      const forged = await new SignJWT({ sid: 'x', typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setAudience('storefront')
        .setIssuer('ecommerce-api')
        .setExpirationTime('10m')
        .sign(new TextEncoder().encode('a-different-secret-that-is-long-enough'));
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
      const expired = await new SignJWT({ sid: 'x', typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setAudience('storefront')
        .setIssuer('ecommerce-api')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
        .sign(new TextEncoder().encode('test-access-secret-'.padEnd(48, 'x')));
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
      // Customer tokens never work on staff endpoints.
      await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('refresh tokens and CSRF', () => {
    it('requires the storefront Origin and the custom header', async () => {
      const { cookie } = await registeredCustomer('csrf');
      const noHeader = await http()
        .post('/api/v1/auth/refresh')
        .set('Origin', STOREFRONT)
        .set('Cookie', `sf_rt=${cookie}`)
        .expect(403);
      expect(noHeader.body.error.code).toBe('CSRF_REJECTED');
      await refresh(cookie, 'https://evil.example').expect(403);
      await refresh(cookie, ADMIN).expect(403);
      await http()
        .post('/api/v1/auth/refresh')
        .set('X-Requested-With', 'fetch')
        .set('Cookie', `sf_rt=${cookie}`)
        .expect(403);
    });

    it('rotates the refresh token on every use', async () => {
      const { cookie } = await registeredCustomer('rotate');
      const res = await refresh(cookie).expect(200);
      const next = cookieFrom(res, 'sf_rt')!;
      expect(next).toBeTruthy();
      expect(next).not.toBe(cookie);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      await refresh(next).expect(200);
    });

    it('detects reuse of a stolen refresh token and revokes the whole session', async () => {
      const { cookie } = await registeredCustomer('reuse');
      const legit = cookieFrom(await refresh(cookie).expect(200), 'sf_rt')!;
      // Simulate the attacker replaying the old token after the grace window.
      await prisma.session.updateMany({
        where: { revokedReason: 'rotated', user: { email: email('reuse') } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      await refresh(cookie).expect(401);
      // The legitimate holder is signed out too, forcing a fresh login.
      await refresh(legit).expect(401);
      expect(
        await prisma.auditLog.count({
          where: {
            action: 'auth.refresh_token_reuse',
            actorId: (await prisma.user.findUniqueOrThrow({ where: { email: email('reuse') } })).id,
          },
        }),
      ).toBe(1);
    });

    it('treats a concurrent refresh as a retryable conflict, not theft', async () => {
      const { cookie } = await registeredCustomer('race');
      const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const winner = a.status === 200 ? a : b;
      await refresh(cookieFrom(winner, 'sf_rt')!).expect(200);
    });

    it('logout revokes the session and its access tokens immediately', async () => {
      const { cookie, accessToken } = await registeredCustomer('logout');
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Origin', STOREFRONT)
        .set('X-Requested-With', 'fetch')
        .set('Cookie', `sf_rt=${cookie}`)
        .expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';')).toMatch(/sf_rt=;/);
      await refresh(cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });
  });

  describe('password reset', () => {
    it('responds identically for unknown emails and sends nothing', async () => {
      const before = mail.outbox.length;
      const res = await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('ghost') })
        .expect(202);
      expect(res.body.message).toMatch(/If an account exists/);
      expect(mail.outbox.length).toBe(before);
    });

    it('resets the password once and signs out every session', async () => {
      const { cookie, accessToken } = await registeredCustomer('reset');
      await http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: email('reset') })
        .expect(202);
      const token = lastToken(email('reset'));
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'a brand new passphrase' })
        .expect(200);
      await http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'another new passphrase' })
        .expect(400);
      await refresh(cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('reset'), password: PASSWORD })
        .expect(401);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('reset'), password: 'a brand new passphrase' })
        .expect(200);
      expect(mail.outbox.at(-1)?.subject).toBe('Your password was changed');
    });
  });

  describe('account', () => {
    it('updates the profile with a normalised phone number', async () => {
      const { accessToken } = await registeredCustomer('profile');
      const res = await http()
        .patch('/api/v1/account/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          firstName: 'Achieng',
          lastName: 'Odhiambo',
          phone: '0712 345 678',
          marketingOptIn: true,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        firstName: 'Achieng',
        phone: '254712345678',
        marketingOptIn: true,
      });
    });

    it('manages addresses with exactly one default, and hides them from other users', async () => {
      const owner = await registeredCustomer('addr');
      const other = await registeredCustomer('addr-other');
      const auth = { Authorization: `Bearer ${owner.accessToken}` };
      const body = {
        recipientName: 'Wanjiku Mwangi',
        phone: '0712345678',
        county: 'Nairobi',
        town: 'Westlands',
        street: 'Waiyaki Way',
      };

      const first = (
        await http().post('/api/v1/account/addresses').set(auth).send(body).expect(201)
      ).body;
      expect(first.isDefault).toBe(true);
      const second = (
        await http()
          .post('/api/v1/account/addresses')
          .set(auth)
          .send({ ...body, county: 'Kiambu', town: 'Ruiru' })
          .expect(201)
      ).body;
      expect(second.isDefault).toBe(false);

      await http().post(`/api/v1/account/addresses/${second.id}/default`).set(auth).expect(200);
      const list = (await http().get('/api/v1/account/addresses').set(auth).expect(200)).body;
      expect(
        list.filter((a: { isDefault: boolean }) => a.isDefault).map((a: { id: string }) => a.id),
      ).toEqual([second.id]);

      await http()
        .post('/api/v1/account/addresses')
        .set(auth)
        .send({ ...body, county: 'Atlantis' })
        .expect(400);

      const otherAuth = { Authorization: `Bearer ${other.accessToken}` };
      await http()
        .put(`/api/v1/account/addresses/${first.id}`)
        .set(otherAuth)
        .send(body)
        .expect(404);
      await http().delete(`/api/v1/account/addresses/${first.id}`).set(otherAuth).expect(404);
      expect(
        (await http().get('/api/v1/account/addresses').set(otherAuth).expect(200)).body,
      ).toEqual([]);

      await http().delete(`/api/v1/account/addresses/${second.id}`).set(auth).expect(204);
      const remaining = (await http().get('/api/v1/account/addresses').set(auth).expect(200)).body;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].isDefault).toBe(true);
    });

    it('changes the password only with the current one, keeping this device signed in', async () => {
      const first = await registeredCustomer('changepw');
      const second = await http()
        .post('/api/v1/auth/login')
        .send({ email: email('changepw'), password: PASSWORD })
        .expect(200);
      const auth = { Authorization: `Bearer ${first.accessToken}` };
      const wrong = await http()
        .post('/api/v1/account/change-password')
        .set(auth)
        .send({ currentPassword: 'nope', newPassword: 'a fresh passphrase' })
        .expect(400);
      expect(wrong.body.error.details[0].path).toBe('currentPassword');
      await http()
        .post('/api/v1/account/change-password')
        .set(auth)
        .send({ currentPassword: PASSWORD, newPassword: 'a fresh passphrase' })
        .expect(200);
      await refresh(first.cookie).expect(200);
      await refresh(cookieFrom(second, 'sf_rt')!).expect(401);
    });

    it('lists sessions and signs out other devices', async () => {
      const first = await registeredCustomer('sessions');
      await http()
        .post('/api/v1/auth/login')
        .send({ email: email('sessions'), password: PASSWORD })
        .expect(200);
      const auth = { Authorization: `Bearer ${first.accessToken}` };
      const sessions = (await http().get('/api/v1/account/sessions').set(auth).expect(200)).body;
      expect(sessions).toHaveLength(2);
      expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      await http().post('/api/v1/account/sessions/sign-out-others').set(auth).expect(200);
      expect(
        (await http().get('/api/v1/account/sessions').set(auth).expect(200)).body,
      ).toHaveLength(1);
    });
  });

  describe('staff sign-in with two-factor', () => {
    async function staffUser(name: string, roleKey: string, permissionKeys: string[]) {
      const role = await prisma.adminRole.upsert({
        where: { key: `${run}-${roleKey}` },
        create: { key: `${run}-${roleKey}`, name: roleKey },
        update: {},
      });
      for (const key of permissionKeys) {
        const permission = await prisma.permission.upsert({
          where: { key },
          create: { key },
          update: {},
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          create: { roleId: role.id, permissionId: permission.id },
          update: {},
        });
      }
      return prisma.user.create({
        data: {
          email: email(name),
          type: 'STAFF',
          passwordHash: await hashPassword(PASSWORD),
          emailVerifiedAt: new Date(),
          profile: { create: { firstName: 'Staff', lastName: name } },
          roles: { create: { roleId: role.id } },
        },
      });
    }
    const adminCookieRequest = (path: string, cookie: string) =>
      http()
        .post(`/api/v1/admin/auth/${path}`)
        .set('Origin', ADMIN)
        .set('X-Requested-With', 'fetch')
        .set('Cookie', `adm_rt=${cookie}`);

    afterAll(async () => {
      await prisma.userRole.deleteMany({ where: { role: { key: { startsWith: run } } } });
      await prisma.adminRole.deleteMany({ where: { key: { startsWith: run } } });
    });

    it('enrols two-factor at first sign-in and issues a session only after a valid code', async () => {
      await staffUser('super', 'super', ['audit:read', 'dashboard:read']);
      await http()
        .post('/api/v1/admin/auth/login')
        .send({ email: email('super'), password: 'wrong password!' })
        .expect(401);

      const login = (
        await http()
          .post('/api/v1/admin/auth/login')
          .send({ email: email('super'), password: PASSWORD })
          .expect(200)
      ).body;
      expect(login.stage).toBe('mfa_setup');
      expect(login).not.toHaveProperty('accessToken');

      const setup = (
        await http()
          .post('/api/v1/admin/auth/mfa/setup')
          .send({ challengeToken: login.challengeToken })
          .expect(200)
      ).body;
      expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: email('super') } });
      expect(stored.mfaSecretEncrypted).toMatch(/^v1\./);
      expect(stored.mfaSecretEncrypted).not.toContain(setup.secret);

      await http()
        .post('/api/v1/admin/auth/mfa/verify')
        .send({ challengeToken: login.challengeToken, code: '000000' })
        .expect(401);
      const verified = await http()
        .post('/api/v1/admin/auth/mfa/verify')
        .send({ challengeToken: login.challengeToken, code: totp(setup.secret) })
        .expect(200);
      expect(verified.body.user.permissions).toEqual(['audit:read', 'dashboard:read']);
      const setCookie = ([] as string[]).concat(verified.headers['set-cookie'] ?? []).join(';');
      expect(setCookie).toMatch(/adm_rt=.*HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Strict/);
      expect(setCookie).toMatch(/Path=\/api\/v1\/admin\/auth/);

      // The challenge is single-use and the code cannot be replayed.
      await http()
        .post('/api/v1/admin/auth/mfa/verify')
        .send({ challengeToken: login.challengeToken, code: totp(setup.secret) })
        .expect(401);
      const again = (
        await http()
          .post('/api/v1/admin/auth/login')
          .send({ email: email('super'), password: PASSWORD })
          .expect(200)
      ).body;
      expect(again.stage).toBe('mfa_verify');
      const replay = await http()
        .post('/api/v1/admin/auth/mfa/verify')
        .send({ challengeToken: again.challengeToken, code: totp(setup.secret) })
        .expect(401);
      expect(replay.body.error.code).toBe('INVALID_CODE');

      const token = verified.body.accessToken as string;
      const audit = await http()
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(audit.body.items.map((i: { action: string }) => i.action)).toEqual(
        expect.arrayContaining(['admin.login', 'admin.mfa_enrolled']),
      );
      // Staff tokens never work on customer endpoints.
      await http()
        .get('/api/v1/account/addresses')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      const rotated = await adminCookieRequest('refresh', cookieFrom(verified, 'adm_rt')!).expect(
        200,
      );
      await adminCookieRequest('refresh', cookieFrom(verified, 'adm_rt')!).expect(409);
      await http()
        .post('/api/v1/admin/auth/refresh')
        .set('Origin', STOREFRONT)
        .set('X-Requested-With', 'fetch')
        .set('Cookie', `adm_rt=${cookieFrom(rotated, 'adm_rt')}`)
        .expect(403);

      await adminCookieRequest('logout', cookieFrom(rotated, 'adm_rt')!).expect(204);
      await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${rotated.body.accessToken}`)
        .expect(401);
    });

    it('limits code attempts per challenge', async () => {
      await staffUser('attempts', 'attempts', ['dashboard:read']);
      const login = (
        await http()
          .post('/api/v1/admin/auth/login')
          .send({ email: email('attempts'), password: PASSWORD })
          .expect(200)
      ).body;
      await http()
        .post('/api/v1/admin/auth/mfa/setup')
        .send({ challengeToken: login.challengeToken })
        .expect(200);
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/admin/auth/mfa/verify')
          .send({ challengeToken: login.challengeToken, code: '123456' })
          .expect(401);
      }
      const blocked = await http()
        .post('/api/v1/admin/auth/mfa/verify')
        .send({ challengeToken: login.challengeToken, code: '123456' })
        .expect(401);
      expect(blocked.body.error.code).toBe('INVALID_CHALLENGE');
    });

    it('enforces permissions on the server', async () => {
      await staffUser('editor', 'editor', ['blog:write']);
      const login = (
        await http()
          .post('/api/v1/admin/auth/login')
          .send({ email: email('editor'), password: PASSWORD })
          .expect(200)
      ).body;
      const { secret } = (
        await http()
          .post('/api/v1/admin/auth/mfa/setup')
          .send({ challengeToken: login.challengeToken })
          .expect(200)
      ).body;
      const session = (
        await http()
          .post('/api/v1/admin/auth/mfa/verify')
          .send({ challengeToken: login.challengeToken, code: totp(secret) })
          .expect(200)
      ).body;
      const res = await http()
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('refuses customers and staff without a role on the staff login', async () => {
      await registeredCustomer('not-staff');
      await http()
        .post('/api/v1/admin/auth/login')
        .send({ email: email('not-staff'), password: PASSWORD })
        .expect(401);
      await prisma.user.create({
        data: { email: email('norole'), type: 'STAFF', passwordHash: await hashPassword(PASSWORD) },
      });
      await http()
        .post('/api/v1/admin/auth/login')
        .send({ email: email('norole'), password: PASSWORD })
        .expect(401);
    });
  });
});
