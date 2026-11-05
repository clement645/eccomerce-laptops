import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import type { Session } from '@repo/database';
import { API_ENV } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Audience, RequestMeta } from './auth.types.js';
import { hashToken, randomToken } from './crypto/tokens.js';

/** A rotated token presented again within this window is treated as a concurrent refresh, not theft. */
const ROTATION_GRACE_MS = 10_000;

export interface IssuedSession {
  session: Session;
  refreshToken: string;
}

const invalid = () =>
  new UnauthorizedException({ code: 'INVALID_SESSION', message: 'Please sign in again' });

/**
 * Refresh-token sessions (ADR 0003). Only SHA-256 hashes are stored. Every refresh rotates the token;
 * presenting an already-rotated token revokes the whole session family (reuse detection).
 */
@Injectable()
export class SessionService {
  private readonly customerTtlMs: number;
  private readonly adminTtlMs: number;
  private readonly accessTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.customerTtlMs = env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
    this.adminTtlMs = env.ADMIN_SESSION_TTL_HOURS * 3_600_000;
    this.accessTtlSeconds = env.JWT_ACCESS_TTL_SECONDS;
  }

  ttlMs(audience: Audience): number {
    return audience === 'admin' ? this.adminTtlMs : this.customerTtlMs;
  }

  async create(
    userId: string,
    audience: Audience,
    meta: RequestMeta,
    mfaVerified = false,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const session = await this.prisma.client.session.create({
      data: {
        userId,
        audience: audience === 'admin' ? 'ADMIN' : 'STOREFRONT',
        refreshTokenHash: hashToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + this.ttlMs(audience)),
        mfaVerifiedAt: mfaVerified ? new Date() : null,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { session, refreshToken };
  }

  async rotate(
    refreshToken: string,
    audience: Audience,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const audienceValue = audience === 'admin' ? 'ADMIN' : 'STOREFRONT';
    const session = await this.prisma.client.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    if (!session || session.audience !== audienceValue) throw invalid();

    if (session.revokedAt) {
      if (session.revokedReason === 'rotated') {
        if (Date.now() - session.revokedAt.getTime() < ROTATION_GRACE_MS) {
          throw new HttpException(
            { code: 'REFRESH_IN_PROGRESS', message: 'Session is being refreshed; retry shortly' },
            HttpStatus.CONFLICT,
          );
        }
        await this.revokeFamily(session.familyId, 'reuse_detected');
        await this.audit.record({
          action: 'auth.refresh_token_reuse',
          entityType: 'session',
          entityId: session.familyId,
          actorId: session.userId,
        });
      }
      throw invalid();
    }
    if (session.expiresAt.getTime() <= Date.now() || session.user.status !== 'ACTIVE') {
      await this.revoke(session.id, 'expired');
      throw invalid();
    }

    const nextToken = randomToken();
    // Customers get a sliding window; staff sessions keep their original absolute expiry.
    const expiresAt =
      audience === 'admin' ? session.expiresAt : new Date(Date.now() + this.customerTtlMs);
    const next = await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated' },
      });
      if (claimed.count !== 1) {
        throw new HttpException(
          { code: 'REFRESH_IN_PROGRESS', message: 'Session is being refreshed; retry shortly' },
          HttpStatus.CONFLICT,
        );
      }
      return tx.session.create({
        data: {
          userId: session.userId,
          audience: session.audience,
          refreshTokenHash: hashToken(nextToken),
          familyId: session.familyId,
          rotatedFromId: session.id,
          expiresAt,
          mfaVerifiedAt: session.mfaVerifiedAt,
          ip: meta.ip,
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
        },
      });
    });
    return { session: next, refreshToken: nextToken };
  }

  /** Revoke the session family that a refresh token belongs to (logout). Silent if unknown. */
  async revokeByToken(refreshToken: string): Promise<string | null> {
    const session = await this.prisma.client.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
    if (!session) return null;
    await this.revokeFamily(session.familyId, 'logout');
    return session.userId;
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.markRevoked([sessionId]);
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    const sessions = await this.prisma.client.session.findMany({
      where: { familyId },
      select: { id: true },
    });
    await this.prisma.client.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.markRevoked(sessions.map((s) => s.id));
  }

  /** Revoke every session of a user, optionally keeping one (e.g. the current device). */
  async revokeAllForUser(userId: string, reason: string, exceptFamilyId?: string): Promise<void> {
    const where = {
      userId,
      revokedAt: null,
      ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}),
    };
    const sessions = await this.prisma.client.session.findMany({ where, select: { id: true } });
    await this.prisma.client.session.updateMany({
      where,
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.markRevoked(sessions.map((s) => s.id));
  }

  /**
   * Access tokens are stateless for 10 minutes. Revoked session ids are kept in Redis for that long
   * so the guard can reject access tokens from sessions that were just signed out.
   */
  private async markRevoked(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    try {
      const pipeline = this.redis.client.pipeline();
      for (const id of sessionIds)
        pipeline.set(this.redis.key('auth', 'revoked', id), '1', 'EX', this.accessTtlSeconds + 60);
      await pipeline.exec();
    } catch {
      // Redis unavailable: tokens still expire within the access TTL.
    }
  }

  async isRevokedFast(sessionId: string): Promise<boolean> {
    try {
      return (await this.redis.client.exists(this.redis.key('auth', 'revoked', sessionId))) === 1;
    } catch {
      return false;
    }
  }
}
