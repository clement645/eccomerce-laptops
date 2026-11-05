import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import type {
  AdminAuthResponse,
  AdminLoginChallenge,
  AdminUser,
  MfaSetupResponse,
} from '@repo/shared-types';
import type { LoginInput, MfaVerifyInput } from '@repo/validation';
import type { Request } from 'express';
import { API_ENV } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, needsRehash, verifyPassword } from './crypto/password.js';
import { SecretBox } from './crypto/secret-box.js';
import { generateTotpSecret, otpauthUrl, TOTP_STEP_SECONDS, verifyTotp } from './crypto/totp.js';
import { PermissionService } from './permission.service.js';
import { SessionService, type IssuedSession } from './session.service.js';
import { TokenService } from './token.service.js';
import { requestMeta } from './cookies.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const ISSUER = 'Laptops & Electronics Admin';

const invalidCredentials = () =>
  new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Incorrect email or password',
  });
const invalidChallenge = () =>
  new UnauthorizedException({
    code: 'INVALID_CHALLENGE',
    message: 'Your sign-in expired. Please start again.',
  });

/**
 * Staff sign-in: password, then mandatory TOTP two-factor. No session exists until the second step
 * succeeds. Challenge tokens live 5 minutes, allow 5 code attempts and are single-use; each code can
 * be used once (replay protection). Redis is required for these checks, so they fail closed.
 */
@Injectable()
export class AdminAuthService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.box = new SecretBox(env.MFA_ENCRYPTION_KEY);
  }

  async login(input: LoginInput, request: Request): Promise<AdminLoginChallenge> {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many sign-in attempts. Try again in 15 minutes.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const passwordOk = await verifyPassword(user?.passwordHash, input.password);
    if (!user || !passwordOk || user.type !== 'STAFF' || user.status !== 'ACTIVE') {
      if (user && !passwordOk) {
        const failures = user.failedLoginCount + 1;
        const locked = failures >= MAX_FAILED_LOGINS;
        await this.prisma.client.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: locked ? 0 : failures,
            lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
          },
        });
      }
      await this.audit.record({
        action: 'admin.login_failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        request,
        after: { email: input.email },
      });
      throw invalidCredentials();
    }
    if ((await this.permissions.forUser(user.id)).roles.length === 0) {
      await this.audit.record({
        action: 'admin.login_no_role',
        entityType: 'user',
        entityId: user.id,
        actorId: user.id,
        request,
      });
      throw invalidCredentials();
    }
    if (needsRehash(user.passwordHash!)) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
    }
    const stage = user.mfaEnabledAt ? 'mfa_verify' : 'mfa_setup';
    return {
      stage,
      challengeToken: await this.tokens.signMfaChallenge(user.id, stage),
      expiresIn: this.tokens.mfaChallengeSeconds,
    };
  }

  /** First-time enrolment: creates (or re-issues) a pending secret for the authenticator app. */
  async mfaSetup(challengeToken: string): Promise<MfaSetupResponse> {
    const claims = await this.tokens.verifyMfaChallenge(challengeToken);
    if (!claims || claims.stage !== 'mfa_setup') throw invalidChallenge();
    await this.assertChallengeUnused(claims.challengeId);
    const user = await this.prisma.client.user.findUnique({ where: { id: claims.userId } });
    if (!user || user.mfaEnabledAt) throw invalidChallenge();

    const secret = generateTotpSecret();
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { mfaSecretEncrypted: this.box.encrypt(secret) },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, ISSUER) };
  }

  async mfaVerify(
    input: MfaVerifyInput,
    request: Request,
  ): Promise<{ response: AdminAuthResponse; issued: IssuedSession }> {
    const claims = await this.tokens.verifyMfaChallenge(input.challengeToken);
    if (!claims) throw invalidChallenge();
    await this.assertChallengeUnused(claims.challengeId);
    await this.countAttempt(claims.challengeId);

    const user = await this.prisma.client.user.findUnique({ where: { id: claims.userId } });
    if (!user || user.type !== 'STAFF' || user.status !== 'ACTIVE' || !user.mfaSecretEncrypted)
      throw invalidChallenge();
    if (claims.stage === 'mfa_verify' && !user.mfaEnabledAt) throw invalidChallenge();

    const step = verifyTotp(this.box.decrypt(user.mfaSecretEncrypted), input.code);
    if (step === null || !(await this.claimStep(user.id, step))) {
      await this.audit.record({
        action: 'admin.mfa_failed',
        entityType: 'user',
        entityId: user.id,
        actorId: user.id,
        request,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CODE',
        message: 'That code is incorrect or has already been used',
      });
    }

    await this.redis.client.set(
      this.redis.key('auth', 'mfa-challenge-used', claims.challengeId),
      '1',
      'EX',
      this.tokens.mfaChallengeSeconds + 60,
    );
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(user.mfaEnabledAt ? {} : { mfaEnabledAt: new Date() }),
      },
    });
    if (!user.mfaEnabledAt) {
      await this.audit.record({
        action: 'admin.mfa_enrolled',
        entityType: 'user',
        entityId: user.id,
        actorId: user.id,
        request,
      });
    }
    const issued = await this.sessions.create(user.id, 'admin', requestMeta(request), true);
    await this.audit.record({
      action: 'admin.login',
      entityType: 'session',
      entityId: issued.session.id,
      actorId: user.id,
      request,
    });
    return { response: await this.authResponse(user.id, issued.session.id), issued };
  }

  async refresh(
    refreshToken: string,
    request: Request,
  ): Promise<{ response: AdminAuthResponse; issued: IssuedSession }> {
    const issued = await this.sessions.rotate(refreshToken, 'admin', requestMeta(request));
    if (!issued.session.mfaVerifiedAt) throw invalidChallenge();
    return { response: await this.authResponse(issued.session.userId, issued.session.id), issued };
  }

  async me(userId: string): Promise<AdminUser> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    const { roles, permissions } = await this.permissions.forUser(userId);
    const name = user.profile
      ? `${user.profile.firstName} ${user.profile.lastName}`.trim()
      : user.email;
    return { id: user.id, email: user.email, name, roles, permissions };
  }

  private async authResponse(userId: string, sessionId: string): Promise<AdminAuthResponse> {
    return {
      accessToken: await this.tokens.signAccess({ userId, sessionId, audience: 'admin' }),
      expiresIn: this.tokens.accessTtlSeconds,
      user: await this.me(userId),
    };
  }

  private async assertChallengeUnused(challengeId: string): Promise<void> {
    try {
      if (await this.redis.client.exists(this.redis.key('auth', 'mfa-challenge-used', challengeId)))
        throw invalidChallenge();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sign-in is temporarily unavailable',
      });
    }
  }

  private async countAttempt(challengeId: string): Promise<void> {
    const key = this.redis.key('auth', 'mfa-attempts', challengeId);
    let attempts: number;
    try {
      attempts = await this.redis.client.incr(key);
      if (attempts === 1) await this.redis.client.expire(key, this.tokens.mfaChallengeSeconds + 60);
    } catch {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sign-in is temporarily unavailable',
      });
    }
    if (attempts > MAX_CODE_ATTEMPTS) throw invalidChallenge();
  }

  /** Each TOTP step can be used once per user. */
  private async claimStep(userId: string, step: number): Promise<boolean> {
    try {
      const result = await this.redis.client.set(
        this.redis.key('auth', 'totp-used', userId, step),
        '1',
        'EX',
        TOTP_STEP_SECONDS * 4,
        'NX',
      );
      return result === 'OK';
    } catch {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Sign-in is temporarily unavailable',
      });
    }
  }
}
