import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { thrown } from '../../../../test/support/auth-unit.js';
import { httpContext } from '../../../../test/support/execution-context.js';
import type { AuthenticatedUser } from '../auth.types.js';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class Controller {
  unrestricted() {
    return 'anyone signed in';
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  adminOnly() {
    return 'admin';
  }

  @Roles('MODERATOR')
  moderatorOnly() {
    return 'moderator';
  }
}

@Roles('ADMIN')
class AdminController {
  inherited() {
    return 'admin controller';
  }

  @Roles('MODERATOR')
  overridden() {
    return 'moderator route on an admin controller';
  }
}

const userWith = (...roles: string[]): AuthenticatedUser => ({
  id: 'user-1',
  email: 'asha@example.test',
  roles,
  sessionId: 'sid-1',
});

const guard = new RolesGuard(new Reflector());
const check = (
  controller: Parameters<typeof httpContext>[0],
  method: string,
  user?: AuthenticatedUser,
) => guard.canActivate(httpContext(controller, method, user ? { user } : {}));

describe('RolesGuard', () => {
  it('does not restrict a route without @Roles', () => {
    expect(check(Controller, 'unrestricted', userWith('STUDENT'))).toBe(true);
    expect(check(Controller, 'unrestricted')).toBe(true);
  });

  it.each([
    [['ADMIN'], true],
    [['SUPER_ADMIN'], true],
    [['STUDENT', 'ADMIN'], true],
    [['STUDENT'], false],
    [['MODERATOR'], false],
    [['BUSINESS_OWNER', 'STUDENT'], false],
    [[], false],
  ])('for @Roles(ADMIN, SUPER_ADMIN), a user with %j is allowed: %s', (roles, allowed) => {
    const attempt = () => check(Controller, 'adminOnly', userWith(...roles));
    if (allowed) expect(attempt()).toBe(true);
    else expect(attempt).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }) as Error);
  });

  it('answers 403 FORBIDDEN (not 401) to a signed-in user without the role', async () => {
    const error = await thrown(
      Promise.resolve().then(() => check(Controller, 'adminOnly', userWith('STUDENT'))),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('fails closed with 401 when there is no verified user at all', async () => {
    const error = await thrown(Promise.resolve().then(() => check(Controller, 'adminOnly')));
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('is case sensitive: role keys are exact', () => {
    expect(() => check(Controller, 'adminOnly', userWith('admin'))).toThrow();
  });

  it('reads @Roles from the controller, and lets a method override it', () => {
    expect(check(AdminController, 'inherited', userWith('ADMIN'))).toBe(true);
    expect(() => check(AdminController, 'inherited', userWith('MODERATOR'))).toThrow();
    expect(check(AdminController, 'overridden', userWith('MODERATOR'))).toBe(true);
    expect(() => check(AdminController, 'overridden', userWith('ADMIN'))).toThrow();
  });

  it('ignores non-HTTP contexts', () => {
    expect(guard.canActivate(httpContext(Controller, 'adminOnly', {}, 'rpc'))).toBe(true);
  });
});
