import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ActivityService } from './activity.service.js';

/**
 * Keeps each account's "last active" time current: any request made with a valid access token
 * (it runs after the auth guards) counts. Throttled in ActivityService, and never delays or fails
 * the request.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly activity: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
      if (user) this.activity.touch(user.id);
    }
    return next.handle();
  }
}
