import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/http/app-exception.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { RbacService } from '../services/rbac.service.js';

/**
 * Enforces `@Permissions(...)`: 403 unless the caller's roles together grant EVERY listed
 * permission. The role -> permission grants come from the database (`role_permissions`) through
 * `RbacService`, which caches them briefly, so this costs no query per request.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw AppException.unauthorized();

    const granted = new Set<string>(await this.rbac.permissionsForRoles(user.roles));
    if (required.every((permission) => granted.has(permission))) return true;

    throw AppException.forbidden();
  }
}
