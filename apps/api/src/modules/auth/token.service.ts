import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { errors, jwtVerify, SignJWT } from 'jose';
import { API_ENV } from '../../config/env.js';
import type { Audience } from './auth.types.js';

const ISSUER = 'ecommerce-api';
const MFA_CHALLENGE_SECONDS = 300;

export interface AccessClaims {
  userId: string;
  sessionId: string;
  audience: Audience;
}

export interface MfaChallengeClaims {
  userId: string;
  stage: 'mfa_setup' | 'mfa_verify';
  challengeId: string;
}

/** Short-lived HS256 JWTs: access tokens and staff MFA challenges. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;
  readonly accessTtlSeconds: number;
  readonly mfaChallengeSeconds = MFA_CHALLENGE_SECONDS;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    this.accessTtlSeconds = env.JWT_ACCESS_TTL_SECONDS;
  }

  signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setAudience(claims.audience)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.key);
  }

  /** Returns null for any invalid, expired, wrong-audience or wrong-type token. */
  async verifyAccess(token: string, audience: Audience): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience,
        algorithms: ['HS256'],
      });
      if (
        payload.typ !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      )
        return null;
      return { userId: payload.sub, sessionId: payload.sid, audience };
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }

  signMfaChallenge(userId: string, stage: MfaChallengeClaims['stage']): Promise<string> {
    return new SignJWT({ typ: 'mfa_challenge', stage })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setAudience('admin')
      .setIssuer(ISSUER)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${MFA_CHALLENGE_SECONDS}s`)
      .sign(this.key);
  }

  async verifyMfaChallenge(token: string): Promise<MfaChallengeClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: 'admin',
        algorithms: ['HS256'],
      });
      if (
        payload.typ !== 'mfa_challenge' ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string'
      )
        return null;
      if (payload.stage !== 'mfa_setup' && payload.stage !== 'mfa_verify') return null;
      return { userId: payload.sub, stage: payload.stage, challengeId: payload.jti };
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }
}
