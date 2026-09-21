import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './services/email-verification.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { RbacService } from './services/rbac.service.js';
import { SessionService } from './services/session.service.js';
import { TokenCleanupService } from './services/token-cleanup.service.js';
import { TokenService } from './services/token.service.js';

/**
 * Authentication and access control. The three guards (`JwtAuthGuard`, `RolesGuard`,
 * `PermissionsGuard`) are registered globally in `AppModule`, so every route is protected unless it
 * says `@Public()`. This module exports what those guards need. Secrets are passed per call by
 * `TokenService` (access and refresh tokens use different ones), so JwtModule has none of its own.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionService,
    RbacService,
    EmailVerificationService,
    PasswordResetService,
    TokenCleanupService,
  ],
  exports: [TokenService, RbacService, SessionService, TokenCleanupService],
})
export class AuthModule {}
