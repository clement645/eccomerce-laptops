import {
  applyDecorators,
  createParamDecorator,
  SetMetadata,
  UseGuards,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Permission } from '@repo/shared-types';
import type { Request } from 'express';
import type { Audience, AuthContext } from '../auth.types.js';
import { AuthGuard } from './auth.guard.js';
import { CookieRequestGuard } from './cookie-request.guard.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';

export const AUTH_METADATA = 'auth:requirements';
export const COOKIE_REQUEST_METADATA = 'auth:cookie-request';

export interface AuthRequirements {
  audience: Audience;
  permissions: Permission[];
}

/** Signed-in customer (storefront access token). */
export const Auth = () =>
  applyDecorators(
    SetMetadata(AUTH_METADATA, {
      audience: 'storefront',
      permissions: [],
    } satisfies AuthRequirements),
    UseGuards(AuthGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid access token' }),
  );

/** Signed-in staff member with completed two-factor and every listed permission. */
export const AdminAuth = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(AUTH_METADATA, { audience: 'admin', permissions } satisfies AuthRequirements),
    UseGuards(AuthGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid access token' }),
    ApiForbiddenResponse({ description: 'Missing permission' }),
  );

/**
 * Endpoints authenticated by the refresh cookie (refresh, logout). Requires the app's own Origin
 * and a custom header: cross-site forms can send neither, which blocks CSRF.
 */
export const CookieRequest = (audience: Audience) =>
  applyDecorators(SetMetadata(COOKIE_REQUEST_METADATA, audience), UseGuards(CookieRequestGuard));

export const CurrentAuth = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!request.auth) throw new Error('CurrentAuth used on a route without an auth guard');
    return request.auth;
  },
);

/** Guest or signed-in customer; use OptionalCurrentAuth to read the customer if present. */
export const OptionalAuth = () => applyDecorators(UseGuards(OptionalAuthGuard), ApiBearerAuth());

export const OptionalCurrentAuth = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthContext | null => {
    return context.switchToHttp().getRequest<Request & { auth?: AuthContext }>().auth ?? null;
  },
);
