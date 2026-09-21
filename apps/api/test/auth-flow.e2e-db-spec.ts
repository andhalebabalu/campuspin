import { JwtService } from '@nestjs/jwt';
import {
  authUserSchema,
  loginResponseSchema,
  refreshResponseSchema,
  registerResponseSchema,
  verifyEmailResponseSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { hashToken } from '../src/common/security/token-hash.js';
import { AppConfig } from '../src/infra/config/app-config.js';
import {
  type AuthTestContext,
  NEW_STRONG_PASSWORD,
  STRONG_PASSWORD,
  auditRowsFor,
  bearer,
  createAuthTestContext,
  errorOf,
  jwtPayload,
  login,
  registerAndVerify,
  successOf,
  testEmail,
  tokenFromLatestEmail,
} from './support/auth-e2e.js';

const API = '/api/v1/auth';
const noData = z.null();

describe('Authentication flow (e2e, real database)', () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /auth/register', () => {
    it('creates a STUDENT account, stores an Argon2id hash and emails a verification link', async () => {
      const email = testEmail('register');
      const response = await ctx
        .post(`${API}/register`)
        .send({ name: '  Asha   Patil ', email: email.toUpperCase(), password: STRONG_PASSWORD })
        .expect(201);

      const body = successOf(registerResponseSchema, response);
      expect(body.message).toMatch(/Registration successful/);
      // Name whitespace collapsed, email lower-cased, role assigned, not yet verified.
      expect(body.data.user).toMatchObject({
        name: 'Asha Patil',
        email,
        emailVerified: false,
        roles: ['STUDENT'],
      });
      // Nothing secret comes back.
      const raw = JSON.stringify(response.body);
      expect(raw).not.toMatch(/passwordHash|argon2|token/i);
      expect(raw).not.toContain(STRONG_PASSWORD);

      const stored = await ctx.db.user.findUniqueOrThrow({
        where: { email },
        include: { userRoles: { include: { role: true } }, emailVerificationTokens: true },
      });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.passwordHash).not.toContain(STRONG_PASSWORD);
      expect(stored.emailVerifiedAt).toBeNull();
      expect(stored.status).toBe('ACTIVE');
      expect(stored.userRoles.map((link) => link.role.key)).toEqual(['STUDENT']);

      // A verification email went out, and the database holds only the token's hash.
      const mail = ctx.mail.latestTo(email);
      expect(mail?.subject).toMatch(/Verify your email/);
      expect(mail?.text).toContain('/verify-email?token=');
      const rawToken = tokenFromLatestEmail(ctx.mail, email);
      expect(stored.emailVerificationTokens).toHaveLength(1);
      expect(stored.emailVerificationTokens[0]?.tokenHash).toBe(hashToken(rawToken));
      expect(JSON.stringify(stored)).not.toContain(rawToken);

      const audit = await auditRowsFor(ctx.db, response);
      expect(audit.map((row) => row.action)).toEqual(['REGISTER']);
      expect(audit[0]).toMatchObject({ actorId: stored.id, entityType: 'User' });
    });

    it('rejects a duplicate email with 409, whatever its letter case', async () => {
      const existing = await registerAndVerify(ctx, { label: 'dup' });

      const response = await ctx
        .post(`${API}/register`)
        .send({
          name: 'Someone Else',
          email: existing.email.toUpperCase(),
          password: STRONG_PASSWORD,
        })
        .expect(409);
      expect(errorOf(response).error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('lets exactly one of two simultaneous registrations for the same email win', async () => {
      const email = testEmail('race');
      const attempt = () =>
        ctx.post(`${API}/register`).send({ name: 'Racer One', email, password: STRONG_PASSWORD });

      const statuses = (await Promise.all([attempt(), attempt()])).map((res) => res.status).sort();
      expect(statuses).toEqual([201, 409]);
      expect(await ctx.db.user.count({ where: { email } })).toBe(1);
    });

    it('never trusts roles sent by the client', async () => {
      const email = testEmail('roles');
      await ctx
        .post(`${API}/register`)
        .send({
          name: 'Sneaky',
          email,
          password: STRONG_PASSWORD,
          roles: ['SUPER_ADMIN'],
          role: 'ADMIN',
        })
        .expect(201);

      const stored = await ctx.db.user.findUniqueOrThrow({
        where: { email },
        include: { userRoles: { include: { role: true } } },
      });
      expect(stored.userRoles.map((link) => link.role.key)).toEqual(['STUDENT']);
    });

    it.each([
      ['a weak password', { password: 'password123' }, 'password'],
      ['a too-short password', { password: 'Ab1!xyz' }, 'password'],
      [
        'a password containing the email name',
        { email: 'ashapatil@x.test', password: 'Ashapatil#2024' },
        'password',
      ],
      ['an invalid email', { email: 'not-an-email' }, 'email'],
      ['a missing name', { name: '' }, 'name'],
    ])('answers 400 VALIDATION_ERROR for %s', async (_label, override, field) => {
      const response = await ctx
        .post(`${API}/register`)
        .send({
          name: 'Valid Name',
          email: testEmail('invalid'),
          password: STRONG_PASSWORD,
          ...override,
        })
        .expect(400);

      const body = errorOf(response);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys((body.error.details as { fields: object }).fields)).toContain(field);
    });
  });

  describe('email verification', () => {
    it('blocks login until verified, then verifies once and invalidates the token', async () => {
      const email = testEmail('verify');
      await ctx
        .post(`${API}/register`)
        .send({ name: 'Vera Fy', email, password: STRONG_PASSWORD })
        .expect(201);

      // Right password, unverified email.
      const blocked = await ctx
        .post(`${API}/login`)
        .send({ email, password: STRONG_PASSWORD })
        .expect(403);
      expect(errorOf(blocked).error.code).toBe('EMAIL_NOT_VERIFIED');

      const token = tokenFromLatestEmail(ctx.mail, email);
      const verified = await ctx.post(`${API}/verify-email`).send({ token }).expect(200);
      expect(successOf(verifyEmailResponseSchema, verified).data).toEqual({ emailVerified: true });

      const stored = await ctx.db.user.findUniqueOrThrow({ where: { email } });
      expect(stored.emailVerifiedAt).not.toBeNull();
      expect((await auditRowsFor(ctx.db, verified)).map((row) => row.action)).toEqual([
        'EMAIL_VERIFIED',
      ]);

      // The link works once.
      const again = await ctx.post(`${API}/verify-email`).send({ token }).expect(400);
      expect(errorOf(again).error.code).toBe('TOKEN_INVALID');

      await ctx.post(`${API}/login`).send({ email, password: STRONG_PASSWORD }).expect(200);
    });

    it('rejects an unknown token with 400 TOKEN_INVALID', async () => {
      const response = await ctx
        .post(`${API}/verify-email`)
        .send({ token: 'x'.repeat(43) })
        .expect(400);
      expect(errorOf(response).error.code).toBe('TOKEN_INVALID');
    });

    it('rejects an expired token with 400 TOKEN_EXPIRED and leaves the email unverified', async () => {
      const email = testEmail('expired');
      await ctx
        .post(`${API}/register`)
        .send({ name: 'Exp Ired', email, password: STRONG_PASSWORD })
        .expect(201);
      const token = tokenFromLatestEmail(ctx.mail, email);
      await ctx.db.emailVerificationToken.updateMany({
        where: { tokenHash: hashToken(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await ctx.post(`${API}/verify-email`).send({ token }).expect(400);
      expect(errorOf(response).error.code).toBe('TOKEN_EXPIRED');
      expect(
        (await ctx.db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
      ).toBeNull();
    });

    it('resend-verification revokes the old link and sends a working new one', async () => {
      const email = testEmail('resend');
      await ctx
        .post(`${API}/register`)
        .send({ name: 'Re Send', email, password: STRONG_PASSWORD })
        .expect(201);
      const oldToken = tokenFromLatestEmail(ctx.mail, email);

      const response = await ctx.post(`${API}/resend-verification`).send({ email }).expect(200);
      expect(successOf(noData, response).message).toMatch(/If an account exists/);
      const newToken = tokenFromLatestEmail(ctx.mail, email);
      expect(newToken).not.toBe(oldToken);
      expect(await ctx.db.emailVerificationToken.count({ where: { user: { email } } })).toBe(1);

      const stale = await ctx.post(`${API}/verify-email`).send({ token: oldToken }).expect(400);
      expect(errorOf(stale).error.code).toBe('TOKEN_INVALID');
      await ctx.post(`${API}/verify-email`).send({ token: newToken }).expect(200);
    });

    it('does not reveal which emails exist, and sends nothing for verified or unknown ones', async () => {
      const verified = await registerAndVerify(ctx, { label: 'enum' });
      const unknown = testEmail('nobody');
      const sentBefore = ctx.mail.outbox.length;

      const forVerified = await ctx
        .post(`${API}/resend-verification`)
        .send({ email: verified.email })
        .expect(200);
      const forUnknown = await ctx
        .post(`${API}/resend-verification`)
        .send({ email: unknown })
        .expect(200);

      expect(forUnknown.body).toEqual(forVerified.body);
      expect(ctx.mail.outbox.length).toBe(sentBefore);
    });
  });

  describe('POST /auth/login', () => {
    it('returns tokens and the user, stores only the refresh-token hash, and audits it', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'login' });

      const response = await ctx
        .post(`${API}/login`)
        .send({ email: email.toUpperCase(), password })
        .expect(200);
      const body = successOf(loginResponseSchema, response);

      expect(body.message).toBe('Login successful');
      expect(body.data.user).toEqual({
        id: userId,
        name: 'Test Student',
        email,
        emailVerified: true,
        roles: ['STUDENT'],
        permissions: ['categories.read', 'colleges.read', 'places.read'],
      });
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/i);

      const rows = await ctx.db.refreshToken.findMany({ where: { userId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(hashToken(body.data.refreshToken));
      expect(JSON.stringify(rows)).not.toContain(body.data.refreshToken);
      expect(rows[0]?.familyId).toBe(jwtPayload(body.data.accessToken).sid);
      expect(rows[0]?.revokedAt).toBeNull();

      expect(
        (await ctx.db.user.findUniqueOrThrow({ where: { id: userId } })).lastLoginAt,
      ).not.toBeNull();
      expect((await auditRowsFor(ctx.db, response)).map((row) => row.action)).toEqual([
        'LOGIN_SUCCESS',
      ]);
    });

    it('issues an access token with only minimal claims, valid for 15 minutes', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'claims' });
      const { accessToken, refreshToken } = await login(ctx, { email, password });

      const access = jwtPayload(accessToken);
      expect(Object.keys(access).sort()).toEqual([
        'email',
        'exp',
        'iat',
        'roles',
        'sid',
        'sub',
        'typ',
      ]);
      expect(access).toMatchObject({ sub: userId, email, roles: ['STUDENT'], typ: 'access' });
      expect(Number(access.exp) - Number(access.iat)).toBe(900);

      const refresh = jwtPayload(refreshToken);
      expect(Object.keys(refresh).sort()).toEqual(['exp', 'iat', 'jti', 'sid', 'sub', 'typ']);
      expect(refresh.typ).toBe('refresh');
      expect(Number(refresh.exp) - Number(refresh.iat)).toBe(30 * 86_400);
    });

    it('answers a wrong password and an unknown email identically (no account enumeration)', async () => {
      const { email } = await registerAndVerify(ctx, { label: 'wrongpw' });

      const wrong = await ctx
        .post(`${API}/login`)
        .send({ email, password: 'Definitely-Wrong-1' })
        .expect(401);
      const unknown = await ctx
        .post(`${API}/login`)
        .send({ email: testEmail('ghost'), password: 'Definitely-Wrong-1' })
        .expect(401);

      expect(errorOf(wrong).error.code).toBe('INVALID_CREDENTIALS');
      expect(errorOf(unknown).error.code).toBe('INVALID_CREDENTIALS');
      expect(errorOf(unknown).message).toBe(errorOf(wrong).message);

      const [wrongAudit] = await auditRowsFor(ctx.db, wrong);
      const [unknownAudit] = await auditRowsFor(ctx.db, unknown);
      expect(wrongAudit).toMatchObject({
        action: 'LOGIN_FAILED',
        metadata: { reason: 'WRONG_PASSWORD' },
      });
      expect(unknownAudit).toMatchObject({
        action: 'LOGIN_FAILED',
        metadata: { reason: 'UNKNOWN_EMAIL' },
      });
      // The typed address is never written to the audit trail, only a short fingerprint of it.
      expect(JSON.stringify(unknownAudit)).not.toContain('ghost-');
    });

    it('requires both fields', async () => {
      const response = await ctx
        .post(`${API}/login`)
        .send({ email: testEmail('x') })
        .expect(400);
      expect(errorOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
      ['DEACTIVATED', 'ACCOUNT_DEACTIVATED'],
    ] as const)(
      'refuses a %s account with 403 %s, but only after the password is proven',
      async (status, code) => {
        const { email, password, userId } = await registerAndVerify(ctx, {
          label: status.toLowerCase(),
        });
        await ctx.db.user.update({ where: { id: userId }, data: { status } });

        const blocked = await ctx.post(`${API}/login`).send({ email, password }).expect(403);
        expect(errorOf(blocked).error.code).toBe(code);
        expect(await auditRowsFor(ctx.db, blocked)).toEqual([
          expect.objectContaining({
            action: 'ACCOUNT_SUSPENDED',
            actorId: userId,
            metadata: { status, via: 'login' },
          }),
        ]);

        // A wrong password must NOT reveal that the account is suspended.
        const wrong = await ctx
          .post(`${API}/login`)
          .send({ email, password: 'Definitely-Wrong-1' })
          .expect(401);
        expect(errorOf(wrong).error.code).toBe('INVALID_CREDENTIALS');
      },
    );
  });

  describe('GET /auth/me and access tokens', () => {
    it('returns the current user with roles and permissions, and never a hash', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'me' });
      const { accessToken } = await login(ctx, { email, password });

      const response = await ctx
        .get(`${API}/me`)
        .set('Authorization', bearer(accessToken))
        .expect(200);
      const user = successOf(authUserSchema, response).data;

      expect(user).toMatchObject({ id: userId, email, emailVerified: true, roles: ['STUDENT'] });
      expect(user.permissions).toEqual(['categories.read', 'colleges.read', 'places.read']);
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2|token/i);
    });

    it('rejects a missing, malformed or garbage token with 401 UNAUTHORIZED', async () => {
      const cases: Array<string | undefined> = [
        undefined,
        'Bearer',
        'Basic abc',
        'Bearer not.a.jwt',
        'Bearer ',
      ];
      for (const header of cases) {
        const request = ctx.get(`${API}/me`);
        const response = await (
          header === undefined ? request : request.set('Authorization', header)
        ).expect(401);
        expect(errorOf(response).error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects an expired access token with 401 TOKEN_EXPIRED', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'expiredjwt' });
      const { accessToken } = await login(ctx, { email, password });
      const claims = jwtPayload(accessToken);
      const now = Math.floor(Date.now() / 1000);
      const expired = await new JwtService().signAsync(
        {
          email,
          roles: ['STUDENT'],
          sid: claims.sid,
          typ: 'access',
          iat: now - 2000,
          exp: now - 1000,
        },
        { secret: ctx.app.get(AppConfig).auth.accessSecret, algorithm: 'HS256', subject: userId },
      );

      const response = await ctx.get(`${API}/me`).set('Authorization', bearer(expired)).expect(401);
      expect(errorOf(response).error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects forged tokens: wrong secret, tampered roles, alg none, and a refresh token as access', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'forged' });
      const { accessToken, refreshToken } = await login(ctx, { email, password });
      const claims = jwtPayload(accessToken);
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        email,
        roles: ['SUPER_ADMIN'],
        sid: claims.sid,
        typ: 'access',
        iat: now,
        exp: now + 600,
      };

      const wrongSecret = await new JwtService().signAsync(payload, {
        secret: 'a-completely-different-secret-of-sufficient-length',
        algorithm: 'HS256',
        subject: userId,
      });

      // Real token, roles edited to SUPER_ADMIN, signature untouched.
      const [header, , signature] = accessToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...claims, roles: ['SUPER_ADMIN'] }),
      ).toString('base64url');
      const tampered = `${header}.${tamperedPayload}.${signature}`;

      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64url',
      );
      const noneBody = Buffer.from(JSON.stringify({ ...payload, sub: userId })).toString(
        'base64url',
      );
      const algNone = `${noneHeader}.${noneBody}.`;

      for (const forged of [wrongSecret, tampered, algNone, refreshToken]) {
        const response = await ctx
          .get(`${API}/me`)
          .set('Authorization', bearer(forged))
          .expect(401);
        expect(errorOf(response).error.code).toBe('UNAUTHORIZED');
      }
    });

    it('refuses to serve a user that was suspended after the token was issued', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'latesuspend' });
      const { accessToken } = await login(ctx, { email, password });
      await ctx.db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

      const response = await ctx
        .get(`${API}/me`)
        .set('Authorization', bearer(accessToken))
        .expect(403);
      expect(errorOf(response).error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('POST /auth/refresh (rotation and reuse detection)', () => {
    it('rotates the refresh token, even when rotated twice within one second', async () => {
      const { email, password } = await registerAndVerify(ctx, { label: 'rotate' });
      const first = await login(ctx, { email, password });

      const second = successOf(
        refreshResponseSchema,
        await ctx.post(`${API}/refresh`).send({ refreshToken: first.refreshToken }).expect(200),
      ).data;
      const third = successOf(
        refreshResponseSchema,
        await ctx.post(`${API}/refresh`).send({ refreshToken: second.refreshToken }).expect(200),
      ).data;

      expect(new Set([first.refreshToken, second.refreshToken, third.refreshToken]).size).toBe(3);
      // The new access token works.
      await ctx.get(`${API}/me`).set('Authorization', bearer(third.accessToken)).expect(200);
      // All three tokens belong to one session (family).
      expect(jwtPayload(first.refreshToken).sid).toBe(jwtPayload(third.refreshToken).sid);
    });

    it('kills the old token, and burns the whole session if the old token is replayed', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'reuse' });
      const first = await login(ctx, { email, password });
      const second = successOf(
        refreshResponseSchema,
        await ctx.post(`${API}/refresh`).send({ refreshToken: first.refreshToken }).expect(200),
      ).data;

      // Replaying the token that was already rotated away: refused...
      const replay = await ctx
        .post(`${API}/refresh`)
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(errorOf(replay).error.code).toBe('TOKEN_INVALID');
      expect((await auditRowsFor(ctx.db, replay)).map((row) => row.action)).toEqual([
        'REFRESH_TOKEN_REUSE_DETECTED',
      ]);

      // ...and because it may have been stolen, the newest token of that session is dead too.
      const burned = await ctx
        .post(`${API}/refresh`)
        .send({ refreshToken: second.refreshToken })
        .expect(401);
      expect(errorOf(burned).error.code).toBe('TOKEN_INVALID');

      const rows = await ctx.db.refreshToken.findMany({ where: { userId } });
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
      expect(rows.map((row) => row.revokedReason).sort()).toEqual(['REUSE_DETECTED', 'ROTATED']);
    });

    it('lets only one of two simultaneous refreshes with the same token succeed', async () => {
      const { email, password } = await registerAndVerify(ctx, { label: 'concurrent' });
      const { refreshToken } = await login(ctx, { email, password });

      const attempts = await Promise.all([
        ctx.post(`${API}/refresh`).send({ refreshToken }),
        ctx.post(`${API}/refresh`).send({ refreshToken }),
      ]);
      const statuses = attempts.map((res) => res.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 401)).toHaveLength(1);
    });

    it('audits each rotation', async () => {
      const { email, password } = await registerAndVerify(ctx, { label: 'audit' });
      const { refreshToken } = await login(ctx, { email, password });
      const response = await ctx.post(`${API}/refresh`).send({ refreshToken }).expect(200);
      expect((await auditRowsFor(ctx.db, response)).map((row) => row.action)).toEqual([
        'REFRESH_TOKEN_ROTATED',
      ]);
    });

    it('refuses garbage, an expired token, an unknown-but-validly-signed token and an access token', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'badrefresh' });
      const { accessToken, refreshToken } = await login(ctx, { email, password });
      // Expire the stored row: the JWT is still fine, but the session has ended.
      await ctx.db.refreshToken.updateMany({
        where: { userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      for (const token of ['garbage'.repeat(5), accessToken, refreshToken]) {
        const response = await ctx.post(`${API}/refresh`).send({ refreshToken: token }).expect(401);
        expect(errorOf(response).error.code).toBe('TOKEN_INVALID');
      }

      // A refresh token that is validly signed but was never stored (deleted by the cleanup job).
      await ctx.db.refreshToken.deleteMany({ where: { userId } });
      const gone = await ctx.post(`${API}/refresh`).send({ refreshToken }).expect(401);
      expect(errorOf(gone).error.code).toBe('TOKEN_INVALID');
    });

    it('revokes the session and answers 403 when the account was suspended', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'suspendrefresh' });
      const { refreshToken } = await login(ctx, { email, password });
      await ctx.db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

      const response = await ctx.post(`${API}/refresh`).send({ refreshToken }).expect(403);
      expect(errorOf(response).error.code).toBe('ACCOUNT_SUSPENDED');
      const rows = await ctx.db.refreshToken.findMany({ where: { userId } });
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('picks up a role change on the next refresh', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'rolechange' });
      const { refreshToken } = await login(ctx, { email, password });
      const moderator = await ctx.db.role.findUniqueOrThrow({ where: { key: 'MODERATOR' } });
      await ctx.db.userRole.create({ data: { userId, roleId: moderator.id } });

      const refreshed = successOf(
        refreshResponseSchema,
        await ctx.post(`${API}/refresh`).send({ refreshToken }).expect(200),
      ).data;
      expect(jwtPayload(refreshed.accessToken).roles).toEqual(['MODERATOR', 'STUDENT']);
    });
  });

  describe('POST /auth/logout and /auth/logout-all', () => {
    it('logout ends only the current session; other devices stay signed in', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'logout' });
      const phone = await login(ctx, { email, password });
      const laptop = await login(ctx, { email, password });
      expect(await ctx.db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(2);

      const response = await ctx
        .post(`${API}/logout`)
        .set('Authorization', bearer(phone.accessToken))
        .expect(200);
      expect(successOf(noData, response).message).toBe('Logged out successfully');
      expect((await auditRowsFor(ctx.db, response)).map((row) => row.action)).toEqual(['LOGOUT']);

      const dead = await ctx
        .post(`${API}/refresh`)
        .send({ refreshToken: phone.refreshToken })
        .expect(401);
      expect(errorOf(dead).error.code).toBe('TOKEN_INVALID');
      await ctx.post(`${API}/refresh`).send({ refreshToken: laptop.refreshToken }).expect(200);
    });

    it('logout-all ends every session', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'logoutall' });
      const phone = await login(ctx, { email, password });
      const laptop = await login(ctx, { email, password });

      const response = await ctx
        .post(`${API}/logout-all`)
        .set('Authorization', bearer(phone.accessToken))
        .expect(200);
      expect((await auditRowsFor(ctx.db, response))[0]).toMatchObject({
        action: 'LOGOUT_ALL',
        metadata: { sessionsRevoked: 2 },
      });

      for (const session of [phone, laptop]) {
        await ctx.post(`${API}/refresh`).send({ refreshToken: session.refreshToken }).expect(401);
      }
      expect(await ctx.db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);
    });

    it('both require authentication', async () => {
      await ctx.post(`${API}/logout`).expect(401);
      await ctx.post(`${API}/logout-all`).expect(401);
    });
  });

  describe('forgot-password and reset-password', () => {
    it('answers identically for known and unknown emails, and only emails known ones', async () => {
      const { email } = await registerAndVerify(ctx, { label: 'forgot' });
      const unknown = testEmail('nobody2');
      const sentBefore = ctx.mail.outbox.length;

      const known = await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      const missing = await ctx.post(`${API}/forgot-password`).send({ email: unknown }).expect(200);

      expect(successOf(noData, known).message).toBe(
        'If an account exists for this email, a password reset link has been sent.',
      );
      expect(missing.body).toEqual(known.body);
      expect(ctx.mail.outbox.length).toBe(sentBefore + 1);
      expect(ctx.mail.latestTo(unknown)).toBeUndefined();
      expect((await auditRowsFor(ctx.db, known)).map((row) => row.action)).toEqual([
        'PASSWORD_RESET_REQUESTED',
      ]);
      expect(await auditRowsFor(ctx.db, missing)).toEqual([]);
    });

    it('resets the password once, revokes every session, and rejects the old password', async () => {
      const { email, password, userId } = await registerAndVerify(ctx, { label: 'reset' });
      const session = await login(ctx, { email, password });

      await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      const firstToken = tokenFromLatestEmail(ctx.mail, email);
      // Asking again invalidates the earlier link.
      await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      const token = tokenFromLatestEmail(ctx.mail, email);
      expect(token).not.toBe(firstToken);
      expect(await ctx.db.passwordResetToken.count({ where: { userId } })).toBe(1);
      const superseded = await ctx
        .post(`${API}/reset-password`)
        .send({ token: firstToken, newPassword: NEW_STRONG_PASSWORD })
        .expect(400);
      expect(errorOf(superseded).error.code).toBe('TOKEN_INVALID');

      // A weak password is refused and does NOT spend the link.
      const weak = await ctx
        .post(`${API}/reset-password`)
        .send({ token, newPassword: 'password123' })
        .expect(400);
      expect(errorOf(weak).error.code).toBe('VALIDATION_ERROR');

      const done = await ctx
        .post(`${API}/reset-password`)
        .send({ token, newPassword: NEW_STRONG_PASSWORD })
        .expect(200);
      expect(successOf(noData, done).message).toMatch(/Password reset successful/);
      expect((await auditRowsFor(ctx.db, done))[0]).toMatchObject({
        action: 'PASSWORD_RESET_COMPLETED',
        actorId: userId,
        metadata: { sessionsRevoked: 1 },
      });

      // The link is single-use.
      const reused = await ctx
        .post(`${API}/reset-password`)
        .send({ token, newPassword: NEW_STRONG_PASSWORD })
        .expect(400);
      expect(errorOf(reused).error.code).toBe('TOKEN_INVALID');

      // The old password and the old session are gone; the new password works.
      await ctx.post(`${API}/login`).send({ email, password }).expect(401);
      await ctx.post(`${API}/refresh`).send({ refreshToken: session.refreshToken }).expect(401);
      await ctx.post(`${API}/login`).send({ email, password: NEW_STRONG_PASSWORD }).expect(200);
    });

    it('rejects a new password that contains the email name, without spending the link', async () => {
      const { email } = await registerAndVerify(ctx, { label: 'identity' });
      await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      const token = tokenFromLatestEmail(ctx.mail, email);
      const name = email.split('@')[0] ?? '';

      const response = await ctx
        .post(`${API}/reset-password`)
        .send({ token, newPassword: `${name}-Xy7!zz` })
        .expect(400);
      const body = errorOf(response);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys((body.error.details as { fields: object }).fields)).toEqual([
        'newPassword',
      ]);
      await ctx
        .post(`${API}/reset-password`)
        .send({ token, newPassword: NEW_STRONG_PASSWORD })
        .expect(200);
    });

    it('rejects an expired reset link with 400 TOKEN_EXPIRED and leaves the password alone', async () => {
      const { email, password } = await registerAndVerify(ctx, { label: 'resetexpired' });
      await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      const token = tokenFromLatestEmail(ctx.mail, email);
      await ctx.db.passwordResetToken.updateMany({
        where: { tokenHash: hashToken(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await ctx
        .post(`${API}/reset-password`)
        .send({ token, newPassword: NEW_STRONG_PASSWORD })
        .expect(400);
      expect(errorOf(response).error.code).toBe('TOKEN_EXPIRED');
      await ctx.post(`${API}/login`).send({ email, password }).expect(200);
    });

    it('does not email a suspended account', async () => {
      const { email, userId } = await registerAndVerify(ctx, { label: 'resetsuspended' });
      await ctx.db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
      const sentBefore = ctx.mail.outbox.length;

      await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      expect(ctx.mail.outbox.length).toBe(sentBefore);
    });
  });

  describe('audit trail hygiene', () => {
    it('never contains a password, a raw token or a hash', async () => {
      const email = testEmail('hygiene');
      await ctx
        .post(`${API}/register`)
        .send({ name: 'Hy Giene', email, password: STRONG_PASSWORD })
        .expect(201);
      const verifyToken = tokenFromLatestEmail(ctx.mail, email);
      await ctx.post(`${API}/verify-email`).send({ token: verifyToken }).expect(200);
      const session = await login(ctx, { email, password: STRONG_PASSWORD });
      await ctx.post(`${API}/login`).send({ email, password: 'Definitely-Wrong-1' }).expect(401);
      await ctx.post(`${API}/forgot-password`).send({ email }).expect(200);
      const resetToken = tokenFromLatestEmail(ctx.mail, email);
      await ctx
        .post(`${API}/reset-password`)
        .send({ token: resetToken, newPassword: NEW_STRONG_PASSWORD })
        .expect(200);

      const user = await ctx.db.user.findUniqueOrThrow({ where: { email } });
      const rows = await ctx.db.auditLog.findMany({ where: { actorId: user.id } });
      expect(rows.length).toBeGreaterThanOrEqual(5);

      const dump = JSON.stringify(rows);
      for (const secret of [
        STRONG_PASSWORD,
        NEW_STRONG_PASSWORD,
        'Definitely-Wrong-1',
        verifyToken,
        resetToken,
        session.accessToken,
        session.refreshToken,
        user.passwordHash,
        hashToken(verifyToken),
      ]) {
        expect(dump).not.toContain(secret);
      }
      // What IS recorded is useful: who, what, from where.
      expect(rows.every((row) => row.ipAddress !== null && row.requestId !== null)).toBe(true);
    });
  });
});
