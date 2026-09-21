import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { type Observable, map } from 'rxjs';
import { Paginated } from './paginated.js';
import { RESPONSE_MESSAGE_KEY } from './response-message.decorator.js';

/** A 204 response must have no body, so it is left unwrapped. */
const NO_CONTENT = 204;

/**
 * Wraps every successful handler result in the standard envelope
 * `{ success: true, message, data }`, so controllers just return their data. A `Paginated` result
 * becomes the list envelope: the items as `data` plus the page details as `meta`.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const message =
      this.reflector.getAllAndOverride<string | undefined>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Success';
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data: unknown) => {
        if (response.statusCode === NO_CONTENT) return undefined;
        if (data instanceof Paginated) {
          return { success: true, data: data.items, message, meta: data.meta };
        }
        return { success: true, data: data ?? null, message };
      }),
    );
  }
}
