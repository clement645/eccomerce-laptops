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
import { cookiePolicy, type CookiePolicy } from '../../common/http/cookie-policy.js';
import type { AuthResponse, MessageResponse, SessionUser } from '@repo/shared-types';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type EmailOnlyInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@repo/validation';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { API_ENV } from '../../config/env.js';
import type { AuthContext } from './auth.types.js';
import { clearRefreshCookie, readRefreshCookie, requestMeta, setRefreshCookie } from './cookies.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { Auth, CookieRequest, CurrentAuth } from './guards/auth.decorators.js';
import { SessionService } from './session.service.js';

const GENERIC = {
  register: "If that email can be used, we've sent a link to confirm it. Check your inbox.",
  resend: "If that account needs confirming, we've sent a new link.",
  forgot: "If an account exists for that email, we've sent a link to reset the password.",
};

@ApiTags('auth')
@Controller('auth')
export class CustomerAuthController {
  private readonly cookies: CookiePolicy;

  constructor(
    private readonly auth: CustomerAuthService,
    private readonly sessions: SessionService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.cookies = cookiePolicy(env);
  }

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: 'register', limit: 5, windowSeconds: 900, failClosed: true })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ): Promise<MessageResponse> {
    await this.auth.register(body);
    return { message: GENERIC.register };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'verify-email', limit: 10, windowSeconds: 900 })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string },
  ): Promise<MessageResponse> {
    await this.auth.verifyEmail(body.token);
    return { message: 'Your email is confirmed. You can now sign in.' };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: 'resend-verification', limit: 5, windowSeconds: 900, failClosed: true })
  async resend(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: EmailOnlyInput,
  ): Promise<MessageResponse> {
    await this.auth.resendVerification(body.email);
    return { message: GENERIC.resend };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'login', limit: 10, windowSeconds: 300, failClosed: true })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { response, issued } = await this.auth.login(body, requestMeta(req));
    setRefreshCookie(
      res,
      'storefront',
      issued.refreshToken,
      this.sessions.ttlMs('storefront'),
      this.cookies,
    );
    return response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @CookieRequest('storefront')
  @RateLimit({ name: 'refresh', limit: 60, windowSeconds: 60 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = readRefreshCookie(req, 'storefront');
    if (!token) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Not signed in' });
    try {
      const { response, issued } = await this.auth.refresh(token, requestMeta(req));
      setRefreshCookie(
        res,
        'storefront',
        issued.refreshToken,
        this.sessions.ttlMs('storefront'),
        this.cookies,
      );
      return response;
    } catch (error) {
      if (error instanceof UnauthorizedException)
        clearRefreshCookie(res, 'storefront', this.cookies);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CookieRequest('storefront')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readRefreshCookie(req, 'storefront');
    if (token) await this.sessions.revokeByToken(token);
    clearRefreshCookie(res, 'storefront', this.cookies);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: 'forgot-password', limit: 5, windowSeconds: 900, failClosed: true })
  async forgot(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: EmailOnlyInput,
  ): Promise<MessageResponse> {
    await this.auth.forgotPassword(body.email);
    return { message: GENERIC.forgot };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'reset-password', limit: 10, windowSeconds: 900, failClosed: true })
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ): Promise<MessageResponse> {
    await this.auth.resetPassword(body, req);
    return { message: 'Your password has been changed. Please sign in.' };
  }

  @Get('me')
  @Auth()
  me(@CurrentAuth() auth: AuthContext): Promise<SessionUser> {
    return this.auth.me(auth.userId);
  }
}
