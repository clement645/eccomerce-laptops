import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiEnv } from '@repo/configuration';
import type { Request } from 'express';
import { API_ENV } from '../../../config/env.js';
import type { Audience } from '../auth.types.js';
import { COOKIE_REQUEST_METADATA } from './auth.decorators.js';

/** CSRF defence for cookie-authenticated endpoints: exact Origin match plus a custom header. */
@Injectable()
export class CookieRequestGuard implements CanActivate {
  private readonly origins: Record<Audience, string>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.origins = {
      storefront: new URL(env.STOREFRONT_URL).origin,
      admin: new URL(env.ADMIN_URL).origin,
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const audience = this.reflector.get<Audience | undefined>(
      COOKIE_REQUEST_METADATA,
      context.getHandler(),
    );
    if (!audience) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const custom = request.headers['x-requested-with'];
    if (origin !== this.origins[audience] || typeof custom !== 'string' || custom.length === 0) {
      throw new ForbiddenException({ code: 'CSRF_REJECTED', message: 'Request rejected' });
    }
    return true;
  }
}
