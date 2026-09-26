import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/http/app-exception.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { TokenService } from '../services/token.service.js';

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Registered globally, so authentication is the DEFAULT: a route without `@Public()` needs a valid
 * `Authorization: Bearer <accessToken>`. On success the verified caller is put on `request.user`.
 * Verification is stateless (signature + expiry), so it costs no database query per request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      const optional = this.reflector.getAllAndOverride<boolean | undefined>(IS_OPTIONAL_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (optional) return true;
      throw AppException.unauthorized();
    }

    request.user = await this.tokens.verifyAccessToken(token);
    return true;
  }
}
