import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AppException } from '../../../common/http/app-exception.js';
import type { AuthenticatedRequest, AuthenticatedUser } from '../auth.types.js';

/**
 * The authenticated caller. Only valid on routes that are not `@Public()`; on a public route there
 * is no caller, so this fails closed with 401 rather than handing back `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw AppException.unauthorized();
    return user;
  },
);
