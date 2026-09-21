import { HttpStatus, Logger } from '@nestjs/common';
import { vi } from 'vitest';
import * as hasher from '../../common/security/password-hasher.js';
import { hashToken } from '../../common/security/token-hash.js';
import { CLIENT, STRONG, buildAuthKit, thrown } from '../../../test/support/auth-unit.js';

// Spy on the real hasher, so a test can prove a password check ran without replacing it.
vi.mock('../../common/security/password-hasher.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../common/security/password-hasher.js')>();
  return { ...original, verifyPassword: vi.fn(original.verifyPassword) };
});

describe('AuthService.register', () => {
  const dto = { name: 'Asha Patil', email: 'asha@example.test', password: STRONG };

  it('creates a STUDENT with an Argon2id hash, unverified, and emails a verification link', async () => {
    const kit = buildAuthKit();

    const result = await kit.auth.register(dto, CLIENT);

    expect(result).toEqual({
      user: {
        id: expect.any(String) as string,
        name: 'Asha Patil',
        email: 'asha@example.test',
        emailVerified: false,
        roles: ['STUDENT'],
      },
    });
    const [stored] = kit.fake.user.rows;
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain(STRONG);
    expect(stored?.emailVerifiedAt).toBeNull();
    expect(stored?.status).toBe('ACTIVE');
    expect(stored?.roleIds).toEqual(['role-STUDENT']);

    const email = kit.emails.latest('verification');
    expect(email).toMatchObject({ to: 'asha@example.test', name: 'Asha Patil' });
    // Only the hash of the emailed token is stored.
    expect(kit.fake.emailVerificationToken.rows[0]?.tokenHash).toBe(hashToken(email?.token ?? ''));
    expect(kit.auditActions()).toEqual(['REGISTER']);
  });

  it('never returns the hash or any token', async () => {
    const kit = buildAuthKit();
    const result = await kit.auth.register(dto, CLIENT);
    expect(JSON.stringify(result)).not.toMatch(/argon2|passwordHash|token/i);
  });

  it('rejects a duplicate email with 409 EMAIL_ALREADY_REGISTERED and sends nothing', async () => {
    const kit = buildAuthKit();
    await kit.seedUser({ email: dto.email });

    const error = await thrown(kit.auth.register(dto, CLIENT));

    expect(error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(kit.fake.user.rows).toHaveLength(1);
    expect(kit.emails.sent).toHaveLength(0);
  });

  it('turns a lost race on the unique email index into the same 409', async () => {
    const kit = buildAuthKit();
    await kit.seedUser({ email: dto.email });
    // Both requests passed the "does it exist?" check before either wrote.
    vi.spyOn(kit.fake.user, 'findUnique').mockResolvedValueOnce(null);

    const error = await thrown(kit.auth.register(dto, CLIENT));

    expect(error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(kit.fake.user.rows).toHaveLength(1);
  });

  it('answers 503 (not a crash) and logs how to fix it when the STUDENT role was never seeded', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const kit = buildAuthKit();
    kit.fake.role.rows.splice(0, kit.fake.role.rows.length);

    const error = await thrown(kit.auth.register(dto, CLIENT));

    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(kit.fake.user.rows).toHaveLength(0);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('db:seed:reference'));
    errorLog.mockRestore();
  });

  it('still succeeds when the email cannot be sent, and logs the failure (the user can request a new link)', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const kit = buildAuthKit();
    kit.emails.failWith = new Error('SMTP down');

    await expect(kit.auth.register(dto, CLIENT)).resolves.toBeDefined();

    expect(kit.fake.user.rows).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('SMTP down'));
    // The log says why it failed but never contains the one-time link or token.
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/token=/);
    errorLog.mockRestore();
  });
});

describe('AuthService.login', () => {
  it('returns tokens and the user, records the session and the login, and never returns the hash', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser({ roles: ['STUDENT', 'MODERATOR'] });

    const result = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);

    expect(result.user).toEqual({
      id: user.id,
      name: 'Seeded User',
      email: user.email,
      emailVerified: true,
      roles: ['MODERATOR', 'STUDENT'],
      permissions: expect.arrayContaining([
        'places.update',
        'reports.manage',
        'places.read',
      ]) as string[],
    });
    expect(JSON.stringify(result)).not.toMatch(/argon2|passwordHash/i);

    // The access token verifies and carries the session id; the refresh token is stored hashed.
    const claims = await kit.tokens.verifyAccessToken(result.accessToken);
    expect(claims).toMatchObject({ id: user.id, roles: ['MODERATOR', 'STUDENT'] });
    const [session] = kit.fake.refreshToken.rows;
    expect(session).toMatchObject({
      userId: user.id,
      familyId: claims.sessionId,
      tokenHash: hashToken(result.refreshToken),
      ipAddress: CLIENT.ipAddress,
      userAgent: CLIENT.userAgent,
    });
    expect(JSON.stringify(session)).not.toContain(result.refreshToken);

    expect(kit.fake.user.rows[0]?.lastLoginAt).toBeInstanceOf(Date);
    expect(kit.auditActions()).toEqual(['LOGIN_SUCCESS']);
  });

  it('starts an independent session for every login (multiple devices)', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();

    const phone = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);
    const laptop = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);

    const families = new Set(kit.fake.refreshToken.rows.map((row) => row.familyId));
    expect(families.size).toBe(2);
    expect(phone.refreshToken).not.toBe(laptop.refreshToken);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS and audits the failure', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();

    const error = await thrown(
      kit.auth.login({ email: user.email, password: 'Wrong-Guess-1' }, CLIENT),
    );

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(kit.fake.refreshToken.rows).toHaveLength(0);
    expect(kit.fake.auditLog.rows[0]).toMatchObject({
      action: 'LOGIN_FAILED',
      actorId: user.id,
      metadata: { reason: 'WRONG_PASSWORD' },
    });
  });

  it('answers an unknown email exactly like a wrong password, and still spends a hash verification', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();
    vi.mocked(hasher.verifyPassword).mockClear();

    const wrong = await thrown(
      kit.auth.login({ email: user.email, password: 'Wrong-Guess-1' }, CLIENT),
    );
    const unknown = await thrown(
      kit.auth.login({ email: 'nobody@example.test', password: 'Wrong-Guess-1' }, CLIENT),
    );

    expect(unknown.code).toBe(wrong.code);
    expect(unknown.message).toBe(wrong.message);
    expect(unknown.getStatus()).toBe(wrong.getStatus());
    // Both paths ran a real Argon2 verification (timing does not reveal which emails exist).
    expect(hasher.verifyPassword).toHaveBeenCalledTimes(2);
    const [dummyHash] = vi.mocked(hasher.verifyPassword).mock.calls[1] ?? [];
    expect(dummyHash).toMatch(/^\$argon2id\$/);

    const unknownAudit = kit.fake.auditLog.rows[1];
    expect(unknownAudit).toMatchObject({ actorId: null, metadata: { reason: 'UNKNOWN_EMAIL' } });
    // The typed address is not stored, only a fingerprint of it.
    expect(JSON.stringify(unknownAudit)).not.toContain('nobody');
  });

  it('refuses an unverified email with 403 EMAIL_NOT_VERIFIED, only after the password is proven', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser({ verified: false });

    const blocked = await thrown(kit.auth.login({ email: user.email, password: STRONG }, CLIENT));
    expect(blocked.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blocked.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(kit.fake.refreshToken.rows).toHaveLength(0);

    const wrong = await thrown(
      kit.auth.login({ email: user.email, password: 'Wrong-Guess-1' }, CLIENT),
    );
    expect(wrong.code).toBe('INVALID_CREDENTIALS');
  });

  it.each([
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['DEACTIVATED', 'ACCOUNT_DEACTIVATED'],
  ] as const)('refuses a %s account with 403 %s and audits it', async (status, code) => {
    const kit = buildAuthKit();
    const user = await kit.seedUser({ status });

    const error = await thrown(kit.auth.login({ email: user.email, password: STRONG }, CLIENT));

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(kit.fake.refreshToken.rows).toHaveLength(0);
    expect(kit.fake.auditLog.rows[0]).toMatchObject({
      action: 'ACCOUNT_SUSPENDED',
      metadata: { status, via: 'login' },
    });
  });

  it('does not reveal a suspension to someone who does not know the password', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser({ status: 'SUSPENDED' });

    const error = await thrown(
      kit.auth.login({ email: user.email, password: 'Wrong-Guess-1' }, CLIENT),
    );

    expect(error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('AuthService.refresh, logout, logout-all and me', () => {
  it('refresh returns a new access token and a new refresh token, with current roles', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();
    const first = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);
    // The user is promoted after signing in.
    (kit.fake.user.rows[0]?.roleIds as string[]).push('role-MODERATOR');

    const refreshed = await kit.auth.refresh({ refreshToken: first.refreshToken }, CLIENT);

    expect(refreshed.refreshToken).not.toBe(first.refreshToken);
    const claims = await kit.tokens.verifyAccessToken(refreshed.accessToken);
    expect(claims.roles).toEqual(['MODERATOR', 'STUDENT']);
  });

  it('logout revokes only the current session and is idempotent', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();
    const phone = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);
    const laptop = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);
    const phoneUser = await kit.tokens.verifyAccessToken(phone.accessToken);

    await kit.auth.logout(phoneUser, CLIENT);
    await kit.auth.logout(phoneUser, CLIENT);

    const error = await thrown(kit.auth.refresh({ refreshToken: phone.refreshToken }, CLIENT));
    expect(error.code).toBe('TOKEN_INVALID');
    await expect(
      kit.auth.refresh({ refreshToken: laptop.refreshToken }, CLIENT),
    ).resolves.toBeDefined();
    expect(kit.auditActions().filter((action) => action === 'LOGOUT')).toHaveLength(2);
  });

  it('logout-all revokes every session', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();
    const phone = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);
    const laptop = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);

    await kit.auth.logoutAll(await kit.tokens.verifyAccessToken(phone.accessToken), CLIENT);

    for (const { refreshToken } of [phone, laptop]) {
      const error = await thrown(kit.auth.refresh({ refreshToken }, CLIENT));
      expect(error.code).toBe('TOKEN_INVALID');
    }
    expect(kit.fake.auditLog.rows.at(-1)).toMatchObject({
      action: 'LOGOUT_ALL',
      metadata: { sessionsRevoked: 2 },
    });
  });

  it('me returns the stored user with roles and permissions, without a hash', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser({ roles: ['STUDENT'] });
    const login = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);

    const me = await kit.auth.me(await kit.tokens.verifyAccessToken(login.accessToken));

    expect(me).toEqual(login.user);
    expect(me.permissions).toEqual(['categories.read', 'colleges.read', 'places.read']);
  });

  it('me answers 403 for a user suspended after sign-in, and 401 for a deleted one', async () => {
    const kit = buildAuthKit();
    const user = await kit.seedUser();
    const login = await kit.auth.login({ email: user.email, password: STRONG }, CLIENT);
    const caller = await kit.tokens.verifyAccessToken(login.accessToken);

    kit.fake.user.rows[0]!.status = 'SUSPENDED';
    expect((await thrown(kit.auth.me(caller))).code).toBe('ACCOUNT_SUSPENDED');

    kit.fake.user.rows.splice(0, 1);
    const gone = await thrown(kit.auth.me(caller));
    expect(gone.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });
});
