import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/http/app-exception.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Enforces `@Roles(...)`: 403 unless the caller holds at least one listed role. Runs after
 * `JwtAuthGuard`, so `request.user` comes from a verified token. A route without `@Roles` is not
 * restricted by this guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw AppException.unauthorized();
    if (required.some((role) => user.roles.includes(role))) return true;

    throw AppException.forbidden();
  }
}
