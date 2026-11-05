import { Global, Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { CookieRequestGuard } from './guards/cookie-request.guard.js';
import { OptionalAuthGuard } from './guards/optional-auth.guard.js';
import { PermissionService } from './permission.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

/** Global so any module can use @Auth() / @AdminAuth() guards. */
@Global()
@Module({
  controllers: [CustomerAuthController, AdminAuthController],
  providers: [
    TokenService,
    SessionService,
    PermissionService,
    CustomerAuthService,
    AdminAuthService,
    AuthGuard,
    CookieRequestGuard,
    OptionalAuthGuard,
  ],
  exports: [
    TokenService,
    SessionService,
    PermissionService,
    AuthGuard,
    CookieRequestGuard,
    OptionalAuthGuard,
    CustomerAuthService,
  ],
})
export class AuthModule {}
