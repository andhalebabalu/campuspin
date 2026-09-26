import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { buildAuthKit, thrown } from '../../../../test/support/auth-unit.js';
import { httpContext } from '../../../../test/support/execution-context.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { OptionalAuth, Public } from '../decorators/public.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

class ClosedController {
  handler() {
    return 'closed';
  }

  @Public()
  openHandler() {
    return 'open';
  }
}

class OptionalController {
  @OptionalAuth()
  handler() {
    return 'maybe';
  }
}

@Public()
class OpenController {
  handler() {
    return 'open';
  }
}

const USER = { id: 'user-1', email: 'asha@example.test', roles: ['STUDENT'], sessionId: 'sid-1' };

function setup() {
  const { tokens } = buildAuthKit();
  return { tokens, guard: new JwtAuthGuard(new Reflector(), tokens) };
}

const requestWith = (authorization?: string): AuthenticatedRequest =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as AuthenticatedRequest;

describe('JwtAuthGuard', () => {
  it('is secure by default: a route without @Public() needs a token', async () => {
    const { guard } = setup();
    const error = await thrown(
      Promise.resolve(guard.canActivate(httpContext(ClosedController, 'handler', requestWith()))),
    );
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.getStatus()).toBe(401);
  });

  it('lets @Public() routes through without a token, on a method or on a whole controller', async () => {
    const { guard } = setup();
    expect(
      await guard.canActivate(httpContext(ClosedController, 'openHandler', requestWith())),
    ).toBe(true);
    expect(await guard.canActivate(httpContext(OpenController, 'handler', requestWith()))).toBe(
      true,
    );
  });

  it('does not even look at a token on a public route', async () => {
    const { guard, tokens } = setup();
    const verify = vi.spyOn(tokens, 'verifyAccessToken');
    const request = requestWith('Bearer whatever');

    await guard.canActivate(httpContext(OpenController, 'handler', request));

    expect(verify).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('accepts a valid Bearer token and exposes the verified caller on the request', async () => {
    const { guard, tokens } = setup();
    const request = requestWith(`Bearer ${await tokens.signAccessToken(USER)}`);

    expect(await guard.canActivate(httpContext(ClosedController, 'handler', request))).toBe(true);
    expect(request.user).toEqual(USER);
  });

  it('accepts the scheme in any letter case', async () => {
    const { guard, tokens } = setup();
    const request = requestWith(`bearer ${await tokens.signAccessToken(USER)}`);
    expect(await guard.canActivate(httpContext(ClosedController, 'handler', request))).toBe(true);
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a different scheme', 'Basic dXNlcjpwYXNz'],
    ['the scheme alone', 'Bearer'],
    ['a trailing space only', 'Bearer '],
    ['two tokens', 'Bearer aaa bbb'],
    ['a garbage token', 'Bearer not.a.jwt'],
  ])('answers 401 UNAUTHORIZED for %s', async (_label, header) => {
    const { guard } = setup();
    const error = await thrown(
      Promise.resolve(
        guard.canActivate(httpContext(ClosedController, 'handler', requestWith(header))),
      ),
    );
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('answers 401 TOKEN_EXPIRED for an expired token so clients know to refresh', async () => {
    const { guard, tokens } = setup();
    vi.useFakeTimers();
    try {
      const token = await tokens.signAccessToken(USER);
      vi.setSystemTime(Date.now() + 901_000);
      const error = await thrown(
        Promise.resolve(
          guard.canActivate(
            httpContext(ClosedController, 'handler', requestWith(`Bearer ${token}`)),
          ),
        ),
      );
      expect(error.code).toBe('TOKEN_EXPIRED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores non-HTTP contexts', async () => {
    const { guard } = setup();
    expect(await guard.canActivate(httpContext(ClosedController, 'handler', {}, 'rpc'))).toBe(true);
  });

  describe('@OptionalAuth()', () => {
    it('runs anonymously without a token', async () => {
      const { guard } = setup();
      const request = requestWith();
      expect(await guard.canActivate(httpContext(OptionalController, 'handler', request))).toBe(
        true,
      );
      expect(request.user).toBeUndefined();
    });

    it('recognises a valid token', async () => {
      const { guard, tokens } = setup();
      const request = requestWith(`Bearer ${await tokens.signAccessToken(USER)}`);
      expect(await guard.canActivate(httpContext(OptionalController, 'handler', request))).toBe(
        true,
      );
      expect(request.user?.id).toBe(USER.id);
    });

    it('answers 401 to a bad token instead of silently treating the caller as signed out', async () => {
      const { guard } = setup();
      const error = await thrown(
        Promise.resolve(
          guard.canActivate(httpContext(OptionalController, 'handler', requestWith('Bearer nope'))),
        ),
      );
      expect(error.getStatus()).toBe(401);
    });
  });
});
