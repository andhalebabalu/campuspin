import { accountBlockedError, roleKeysOf, toAuthUser } from './account.js';

const account = (overrides: Partial<Parameters<typeof toAuthUser>[0]> = {}) => ({
  id: 'user-1',
  name: 'Asha Patil',
  email: 'asha@example.test',
  status: 'ACTIVE' as const,
  emailVerifiedAt: new Date(),
  userRoles: [{ role: { key: 'STUDENT' } }],
  ...overrides,
});

describe('roleKeysOf', () => {
  it('returns sorted, de-duplicated keys', () => {
    const roles = roleKeysOf({
      userRoles: [
        { role: { key: 'STUDENT' } },
        { role: { key: 'ADMIN' } },
        { role: { key: 'STUDENT' } },
      ],
    });
    expect(roles).toEqual(['ADMIN', 'STUDENT']);
  });

  it('ignores a role key the code does not know', () => {
    expect(
      roleKeysOf({ userRoles: [{ role: { key: 'ROOT' } }, { role: { key: 'STUDENT' } }] }),
    ).toEqual(['STUDENT']);
  });
});

describe('toAuthUser', () => {
  it('exposes only the public fields, and derives emailVerified from the timestamp', () => {
    const result = toAuthUser(account(), ['places.read']);

    expect(result).toEqual({
      id: 'user-1',
      name: 'Asha Patil',
      email: 'asha@example.test',
      emailVerified: true,
      roles: ['STUDENT'],
      permissions: ['places.read'],
    });
    expect(toAuthUser(account({ emailVerifiedAt: null }), []).emailVerified).toBe(false);
  });

  it('never leaks a password hash or status even if the object carries them', () => {
    const risky = { ...account(), passwordHash: '$argon2id$secret', internal: 'x' };
    const result = toAuthUser(risky, []);
    expect(Object.keys(result).sort()).toEqual([
      'email',
      'emailVerified',
      'id',
      'name',
      'permissions',
      'roles',
    ]);
    expect(JSON.stringify(result)).not.toContain('argon2');
  });
});

describe('accountBlockedError', () => {
  it('is undefined for an active account', () => {
    expect(accountBlockedError({ status: 'ACTIVE' })).toBeUndefined();
  });

  it.each([
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['DEACTIVATED', 'ACCOUNT_DEACTIVATED'],
  ] as const)('is a 403 %s error for a %s account', (status, code) => {
    const error = accountBlockedError({ status });
    expect(error?.code).toBe(code);
    expect(error?.getStatus()).toBe(403);
  });
});
