import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { AppConfig } from '../../infra/config/app-config.js';
import { AUTH_RATE_LIMIT_KEY } from './auth-rate-limit.decorator.js';

/**
 * The global rate limiter. Identical to Nest's `ThrottlerGuard` (per client IP and route, same
 * `Retry-After` header, same 429 handling) except that routes marked `@AuthRateLimit()` use the
 * stricter, separately configurable `AUTH_RATE_LIMIT` / `AUTH_RATE_LIMIT_TTL_SECONDS`.
 *
 * The limit is resolved here, at request time, because decorator arguments are evaluated when the
 * class is loaded, which is before configuration is available.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  @Inject(AppConfig)
  private readonly config!: AppConfig;

  protected override handleRequest(request: ThrottlerRequest): Promise<boolean> {
    const strict = this.reflector.getAllAndOverride<boolean | undefined>(AUTH_RATE_LIMIT_KEY, [
      request.context.getHandler(),
      request.context.getClass(),
    ]);
    if (!strict) return super.handleRequest(request);

    const { limit, ttlMs } = this.config.auth.rateLimit;
    return super.handleRequest({ ...request, limit, ttl: ttlMs, blockDuration: ttlMs });
  }
}
