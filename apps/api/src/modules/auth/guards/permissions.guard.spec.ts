import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { buildAuthKit, thrown } from '../../../../test/support/auth-unit.js';
import { httpContext } from '../../../../test/support/execution-context.js';
import type { AuthenticatedUser } from '../auth.types.js';
import { Permissions } from '../decorators/permissions.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';

class Controller {
  unrestricted() {
    return 'anyone signed in';
  }

  @Permissions('places.manage')
  managePlaces() {
    return 'manage';
  }

  // Needs BOTH.
  @Permissions('places.read', 'places.update')
  readAndUpdate() {
    return 'read+update';
  }

  @Permissions('settings.manage')
  settings() {
    return 'settings';
  }
}

const userWith = (...roles: string[]): AuthenticatedUser => ({
  id: 'user-1',
  email: 'asha@example.test',
  roles,
  sessionId: 'sid-1',
});

function setup() {
  const { rbac } = buildAuthKit();
  const guard = new PermissionsGuard(new Reflector(), rbac);
  const check = (method: string, user?: AuthenticatedUser) =>
    Promise.resolve(guard.canActivate(httpContext(Controller, method, user ? { user } : {})));
  return { check };
}

describe('PermissionsGuard (grants come from the seeded role_permissions)', () => {
  it('does not restrict a route without @Permissions', async () => {
    const { check } = setup();
    expect(await check('unrestricted', userWith('STUDENT'))).toBe(true);
  });

  it.each([
    ['managePlaces', ['SUPER_ADMIN'], true],
    ['managePlaces', ['ADMIN'], true],
    ['managePlaces', ['MODERATOR'], false],
    ['managePlaces', ['BUSINESS_OWNER'], false],
    ['managePlaces', ['STUDENT'], false],
    ['managePlaces', [], false],
    ['settings', ['SUPER_ADMIN'], true],
    // ADMIN is deliberately not granted settings.manage: no "admin can do everything" shortcut.
    ['settings', ['ADMIN'], false],
    ['readAndUpdate', ['MODERATOR'], true],
    ['readAndUpdate', ['BUSINESS_OWNER'], true],
    ['readAndUpdate', ['STUDENT'], false],
  ])('%s with roles %j is allowed: %s', async (method, roles, allowed) => {
    const { check } = setup();
    if (allowed) expect(await check(method, userWith(...roles))).toBe(true);
    else expect((await thrown(check(method, userWith(...roles)))).code).toBe('FORBIDDEN');
  });

  it('combines the permissions of every role the user holds', async () => {
    const { check } = setup();
    // STUDENT alone lacks places.update; MODERATOR supplies it.
    expect(await check('readAndUpdate', userWith('STUDENT', 'MODERATOR'))).toBe(true);
  });

  it('answers 403 FORBIDDEN, and 401 when there is no verified user', async () => {
    const { check } = setup();
    const forbidden = await thrown(check('managePlaces', userWith('STUDENT')));
    expect(forbidden.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((await thrown(check('managePlaces'))).code).toBe('UNAUTHORIZED');
  });

  it('grants nothing to a role that has no rows (a role key not in the database)', async () => {
    const { check } = setup();
    expect((await thrown(check('managePlaces', userWith('ROOT', 'GOD')))).code).toBe('FORBIDDEN');
  });
});
