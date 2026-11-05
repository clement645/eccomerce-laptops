import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import type { User } from '@repo/database';
import type { AuthResponse, SessionUser } from '@repo/shared-types';
import type { LoginInput, RegisterInput, ResetPasswordInput } from '@repo/validation';
import type { Request } from 'express';
import { API_ENV } from '../../config/env.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { emails } from '../../infrastructure/mail/templates.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestMeta } from './auth.types.js';
import { hashPassword, needsRehash, verifyPassword } from './crypto/password.js';
import { hashToken, randomToken } from './crypto/tokens.js';
import { SessionService, type IssuedSession } from './session.service.js';
import { TokenService } from './token.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;
const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 3_600_000;

const invalidCredentials = () =>
  new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Incorrect email or password',
  });
const invalidLink = () =>
  new HttpException(
    { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired' },
    HttpStatus.BAD_REQUEST,
  );

type UserWithProfile = User & {
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
    marketingOptIn: boolean;
  } | null;
};

export function toSessionUser(user: UserWithProfile): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.profile?.firstName ?? '',
    lastName: user.profile?.lastName ?? '',
    phone: user.profile?.phone ?? null,
    marketingOptIn: user.profile?.marketingOptIn ?? false,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

/**
 * Customer accounts. Responses for register, resend and forgot-password are identical whether or not
 * the email exists, so they cannot be used to discover who has an account.
 */
@Injectable()
export class CustomerAuthService {
  private readonly storefrontUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.storefrontUrl = env.STOREFRONT_URL.replace(/\/$/, '');
  }

  async register(input: RegisterInput): Promise<void> {
    const existing = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // Tell the owner, not the requester.
      await this.mail.send(
        emails.accountExists(input.email, `${this.storefrontUrl}/account/forgot-password`),
      );
      return;
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.client.user.create({
      data: {
        email: input.email,
        passwordHash,
        type: 'CUSTOMER',
        profile: {
          create: {
            firstName: input.firstName,
            lastName: input.lastName,
            marketingOptIn: input.marketingOptIn,
          },
        },
        wishlist: { create: {} },
      },
    });
    await this.sendVerification(user.id, user.email, input.firstName);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user || user.type !== 'CUSTOMER' || user.emailVerifiedAt || user.status !== 'ACTIVE')
      return;
    await this.sendVerification(user.id, user.email, user.profile?.firstName ?? 'there');
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeToken(token, 'EMAIL_VERIFICATION');
    await this.prisma.client.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.record({
      action: 'customer.email_verified',
      entityType: 'user',
      entityId: record.userId,
      actorId: record.userId,
    });
  }

  async login(
    input: LoginInput,
    meta: RequestMeta,
  ): Promise<{ response: AuthResponse; issued: IssuedSession }> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      include: { profile: true },
    });

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
    if (!user || !passwordOk || user.type !== 'CUSTOMER' || user.status !== 'ACTIVE') {
      if (user && !passwordOk) await this.recordFailedLogin(user);
      throw invalidCredentials();
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please confirm your email address first. Check your inbox for the link.',
      });
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(needsRehash(user.passwordHash!)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
    });
    const issued = await this.sessions.create(user.id, 'storefront', meta);
    return { response: await this.authResponse(user, issued.session.id), issued };
  }

  async refresh(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<{ response: AuthResponse; issued: IssuedSession }> {
    const issued = await this.sessions.rotate(refreshToken, 'storefront', meta);
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: issued.session.userId },
      include: { profile: true },
    });
    return { response: await this.authResponse(user, issued.session.id), issued };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user || user.type !== 'CUSTOMER' || user.status !== 'ACTIVE') return;
    const token = await this.issueToken(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
    await this.mail.send(
      emails.passwordReset(
        user.email,
        `${this.storefrontUrl}/account/reset-password?token=${token}`,
      ),
    );
  }

  async resetPassword(input: ResetPasswordInput, request: Request): Promise<void> {
    const record = await this.consumeToken(input.token, 'PASSWORD_RESET');
    const user = await this.prisma.client.user.update({
      where: { id: record.userId },
      // Proving control of the inbox also verifies the email and clears any lockout.
      data: {
        passwordHash: await hashPassword(input.password),
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerifiedAt: new Date(),
      },
    });
    await this.sessions.revokeAllForUser(user.id, 'password_reset');
    await this.mail.send(emails.passwordChanged(user.email));
    await this.audit.record({
      action: 'customer.password_reset',
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      request,
    });
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    return toSessionUser(user);
  }

  private async authResponse(user: UserWithProfile, sessionId: string): Promise<AuthResponse> {
    return {
      accessToken: await this.tokens.signAccess({
        userId: user.id,
        sessionId,
        audience: 'storefront',
      }),
      expiresIn: this.tokens.accessTtlSeconds,
      user: toSessionUser(user),
    };
  }

  private async recordFailedLogin(user: User): Promise<void> {
    const failures = user.failedLoginCount + 1;
    const locked = failures >= MAX_FAILED_LOGINS;
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: locked ? 0 : failures,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : user.lockedUntil,
      },
    });
    if (locked)
      await this.audit.record({
        action: 'customer.locked_out',
        entityType: 'user',
        entityId: user.id,
      });
  }

  private async sendVerification(userId: string, email: string, firstName: string): Promise<void> {
    const token = await this.issueToken(userId, 'EMAIL_VERIFICATION', VERIFY_TTL_MS);
    await this.mail.send(
      emails.verifyEmail(
        email,
        firstName,
        `${this.storefrontUrl}/account/verify-email?token=${token}`,
      ),
    );
  }

  /** New token; earlier unused tokens for the same purpose stop working. */
  private async issueToken(
    userId: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    ttlMs: number,
  ): Promise<string> {
    const token = randomToken();
    await this.prisma.client.$transaction([
      this.prisma.client.verificationToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.client.verificationToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  /** Single use: the conditional update means two concurrent requests cannot both succeed. */
  private async consumeToken(token: string, purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const record = await this.prisma.client.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      !record ||
      record.purpose !== purpose ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    )
      throw invalidLink();
    const claimed = await this.prisma.client.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidLink();
    return record;
  }
}
