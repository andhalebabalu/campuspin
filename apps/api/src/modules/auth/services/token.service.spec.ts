import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { buildAuthKit, thrown } from '../../../../test/support/auth-unit.js';

const USER = { id: 'user-1', email: 'asha@example.test', roles: ['STUDENT'], sessionId: 'sid-1' };
const decode = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

describe('TokenService: access tokens', () => {
  it('signs a minimal token: subject, email, roles, session, type and times only', async () => {
    const { tokens } = buildAuthKit();

    const claims = decode(await tokens.signAccessToken(USER));

    expect(Object.keys(claims).sort()).toEqual([
      'email',
      'exp',
      'iat',
      'roles',
      'sid',
      'sub',
      'typ',
    ]);
    expect(claims).toMatchObject({
      sub: 'user-1',
      email: USER.email,
      roles: ['STUDENT'],
      sid: 'sid-1',
      typ: 'access',
    });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(900);
  });

  it('honours JWT_ACCESS_EXPIRES_IN', async () => {
    const { tokens } = buildAuthKit({ JWT_ACCESS_EXPIRES_IN: '5m' });
    const claims = decode(await tokens.signAccessToken(USER));
    expect(Number(claims.exp) - Number(claims.iat)).toBe(300);
  });

  it('verifies a good token back into the caller', async () => {
    const { tokens } = buildAuthKit();
    expect(await tokens.verifyAccessToken(await tokens.signAccessToken(USER))).toEqual(USER);
  });

  it('answers 401 TOKEN_EXPIRED for a genuine but expired token', async () => {
    const { tokens } = buildAuthKit();
    vi.useFakeTimers();
    try {
      const token = await tokens.signAccessToken(USER);
      vi.setSystemTime(Date.now() + 901_000);

      const error = await thrown(tokens.verifyAccessToken(token));

      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.getStatus()).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers 401 UNAUTHORIZED for garbage and for a token signed with another secret', async () => {
    const { tokens } = buildAuthKit();
    const now = Math.floor(Date.now() / 1000);
    const foreign = await new JwtService().signAsync(
      {
        email: USER.email,
        roles: ['SUPER_ADMIN'],
        sid: 'x',
        typ: 'access',
        iat: now,
        exp: now + 600,
      },
      { secret: 'another-secret-that-is-long-enough-to-pass-xx', subject: USER.id },
    );

    for (const token of ['', 'abc', 'a.b.c', foreign]) {
      const error = await thrown(tokens.verifyAccessToken(token));
      expect(error.code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects an unsigned (alg=none) token and an altered payload', async () => {
    const { tokens } = buildAuthKit();
    const good = await tokens.signAccessToken(USER);
    const [header, , signature] = good.split('.');
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = { ...decode(good), roles: ['SUPER_ADMIN'] };

    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
    const altered = `${header}.${b64(payload)}.${signature}`;

    for (const token of [unsigned, altered]) {
      expect((await thrown(tokens.verifyAccessToken(token))).code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects a refresh token presented as an access token (different secret and type)', async () => {
    const { tokens } = buildAuthKit();
    const { token } = await tokens.signRefreshToken({ userId: 'user-1', familyId: 'sid-1' });
    expect((await thrown(tokens.verifyAccessToken(token))).code).toBe('UNAUTHORIZED');
  });

  it('rejects a correctly signed token whose type or shape is wrong', async () => {
    const { tokens, config } = buildAuthKit();
    const jwt = new JwtService();
    const now = Math.floor(Date.now() / 1000);
    const sign = (payload: object) =>
      jwt.signAsync(
        { iat: now, exp: now + 600, ...payload },
        { secret: config.auth.accessSecret, algorithm: 'HS256', subject: 'user-1' },
      );

    const wrongType = await sign({ email: 'a@b.test', roles: [], sid: 's', typ: 'refresh' });
    const missingSession = await sign({ email: 'a@b.test', roles: [], typ: 'access' });
    const badRoles = await sign({ email: 'a@b.test', roles: 'ADMIN', sid: 's', typ: 'access' });

    for (const token of [wrongType, missingSession, badRoles]) {
      expect((await thrown(tokens.verifyAccessToken(token))).code).toBe('UNAUTHORIZED');
    }
  });
});

describe('TokenService: refresh tokens', () => {
  it('signs a token carrying only subject, session, type, a unique id and times', async () => {
    const { tokens } = buildAuthKit();

    const { token, expiresAt } = await tokens.signRefreshToken({
      userId: 'user-1',
      familyId: 'sid-1',
    });
    const claims = decode(token);

    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'jti', 'sid', 'sub', 'typ']);
    expect(claims).toMatchObject({ sub: 'user-1', sid: 'sid-1', typ: 'refresh' });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(30 * 86_400);
    // The stored expiry equals the token's own expiry.
    expect(expiresAt.getTime()).toBe(Number(claims.exp) * 1000);
  });

  it('never issues the same token twice, even in the same second', async () => {
    const { tokens } = buildAuthKit();
    const issued = await Promise.all(
      Array.from({ length: 20 }, () =>
        tokens.signRefreshToken({ userId: 'user-1', familyId: 'sid-1' }),
      ),
    );
    expect(new Set(issued.map((item) => item.token)).size).toBe(20);
  });

  it('verifies a good token back into user and session', async () => {
    const { tokens } = buildAuthKit();
    const { token } = await tokens.signRefreshToken({ userId: 'user-1', familyId: 'sid-1' });
    expect(await tokens.verifyRefreshToken(token)).toEqual({ userId: 'user-1', familyId: 'sid-1' });
  });

  it('gives one generic 401 TOKEN_INVALID for every kind of failure', async () => {
    const { tokens } = buildAuthKit();
    const access = await tokens.signAccessToken(USER);
    vi.useFakeTimers();
    let expired: string;
    try {
      expired = (await tokens.signRefreshToken({ userId: 'user-1', familyId: 'sid-1' })).token;
      vi.setSystemTime(Date.now() + 31 * 86_400_000);
      const error = await thrown(tokens.verifyRefreshToken(expired));
      expect(error.code).toBe('TOKEN_INVALID');
    } finally {
      vi.useRealTimers();
    }

    const messages = new Set<string>();
    for (const token of ['', 'garbage', access]) {
      const error = await thrown(tokens.verifyRefreshToken(token));
      expect(error.code).toBe('TOKEN_INVALID');
      expect(error.getStatus()).toBe(401);
      messages.add(error.message);
    }
    expect(messages.size).toBe(1);
  });
});
