import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { AuthContext } from '../auth.types.js';
import { PermissionService } from '../permission.service.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';
import { AUTH_METADATA, type AuthRequirements } from './auth.decorators.js';

const unauthorized = () =>
  new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Please sign in' });

/**
 * Verifies the Bearer access token for the route's audience.
 * - Customers: signature, expiry and audience, plus a fast Redis check for just-revoked sessions.
 * - Staff: additionally loads the session on every request (revocation is immediate), requires
 *   completed two-factor and an active staff account, and checks every required permission.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.getAllAndOverride<AuthRequirements>(AUTH_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirements) return true;
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw unauthorized();
    const claims = await this.tokens.verifyAccess(token, requirements.audience);
    if (!claims) throw unauthorized();
    if (await this.sessions.isRevokedFast(claims.sessionId)) throw unauthorized();

    let permissions: AuthContext['permissions'] = [];
    if (requirements.audience === 'admin') {
      const session = await this.prisma.client.session.findUnique({
        where: { id: claims.sessionId },
        select: {
          revokedAt: true,
          revokedReason: true,
          expiresAt: true,
          mfaVerifiedAt: true,
          audience: true,
          user: { select: { status: true, type: true } },
        },
      });
      const valid =
        session &&
        session.audience === 'ADMIN' &&
        // Only rotation leaves earlier access tokens valid (until they expire); any other revocation is immediate.
        (!session.revokedAt ||
          (session.revokedReason === 'rotated' &&
            session.revokedAt.getTime() > Date.now() - this.tokens.accessTtlSeconds * 1000)) &&
        session.expiresAt.getTime() > Date.now() &&
        session.mfaVerifiedAt !== null &&
        session.user.status === 'ACTIVE' &&
        session.user.type === 'STAFF';
      if (!valid) throw unauthorized();
      permissions = (await this.permissions.forUser(claims.userId)).permissions;
      const missing = requirements.permissions.filter((p) => !permissions.includes(p));
      if (missing.length > 0) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: "You don't have permission to do this",
        });
      }
    }

    request.auth = {
      userId: claims.userId,
      sessionId: claims.sessionId,
      audience: requirements.audience,
      permissions,
    };
    return true;
  }
}
