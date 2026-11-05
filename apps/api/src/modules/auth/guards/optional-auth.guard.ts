import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../auth.types.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';

/**
 * For endpoints that serve guests and customers (cart, checkout). Attaches the customer when a
 * valid Bearer token is present. A token that is present but invalid is rejected with 401 so the
 * client refreshes it instead of silently acting as a guest.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const header = request.headers.authorization;
    if (!header) return true;
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const claims = token ? await this.tokens.verifyAccess(token, 'storefront') : null;
    if (!claims || (await this.sessions.isRevokedFast(claims.sessionId))) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Please sign in again' });
    }
    request.auth = {
      userId: claims.userId,
      sessionId: claims.sessionId,
      audience: 'storefront',
      permissions: [],
    };
    return true;
  }
}
