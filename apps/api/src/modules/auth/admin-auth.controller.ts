import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ApiEnv } from '@repo/configuration';
import type {
  AdminAuthResponse,
  AdminLoginChallenge,
  AdminUser,
  MfaSetupResponse,
} from '@repo/shared-types';
import {
  loginSchema,
  mfaChallengeSchema,
  mfaVerifySchema,
  type LoginInput,
  type MfaVerifyInput,
} from '@repo/validation';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { API_ENV } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminAuthService } from './admin-auth.service.js';
import type { AuthContext } from './auth.types.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies.js';
import { AdminAuth, CookieRequest, CurrentAuth } from './guards/auth.decorators.js';
import { SessionService } from './session.service.js';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AdminAuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.secureCookies = env.NODE_ENV === 'production';
  }

  /** Step 1: password. Returns a short-lived challenge for two-factor; never a session. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'admin-login', limit: 5, windowSeconds: 300, failClosed: true })
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
  ): Promise<AdminLoginChallenge> {
    return this.auth.login(body, req);
  }

  /** First sign-in only: secret and otpauth:// URI for the authenticator app. */
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'admin-mfa', limit: 10, windowSeconds: 300, failClosed: true })
  setup(
    @Body(new ZodValidationPipe(mfaChallengeSchema)) body: { challengeToken: string },
  ): Promise<MfaSetupResponse> {
    return this.auth.mfaSetup(body.challengeToken);
  }

  /** Step 2: six-digit code. Creates the admin session. */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'admin-mfa', limit: 10, windowSeconds: 300, failClosed: true })
  async verify(
    @Body(new ZodValidationPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminAuthResponse> {
    const { response, issued } = await this.auth.mfaVerify(body, req);
    setRefreshCookie(
      res,
      'admin',
      issued.refreshToken,
      this.sessions.ttlMs('admin'),
      this.secureCookies,
    );
    return response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @CookieRequest('admin')
  @RateLimit({ name: 'admin-refresh', limit: 60, windowSeconds: 60 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminAuthResponse> {
    const token = readRefreshCookie(req, 'admin');
    if (!token) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Not signed in' });
    try {
      const { response, issued } = await this.auth.refresh(token, req);
      // Admin sessions keep their absolute expiry, so the cookie lifetime shrinks accordingly.
      setRefreshCookie(
        res,
        'admin',
        issued.refreshToken,
        issued.session.expiresAt.getTime() - Date.now(),
        this.secureCookies,
      );
      return response;
    } catch (error) {
      if (error instanceof UnauthorizedException)
        clearRefreshCookie(res, 'admin', this.secureCookies);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CookieRequest('admin')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readRefreshCookie(req, 'admin');
    if (token) {
      const userId = await this.sessions.revokeByToken(token);
      if (userId)
        await this.audit.record({
          action: 'admin.logout',
          entityType: 'user',
          entityId: userId,
          actorId: userId,
          request: req,
        });
    }
    clearRefreshCookie(res, 'admin', this.secureCookies);
  }

  @Get('me')
  @AdminAuth()
  me(@CurrentAuth() auth: AuthContext): Promise<AdminUser> {
    return this.auth.me(auth.userId);
  }
}
