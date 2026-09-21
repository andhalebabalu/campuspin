import { HttpStatus } from '@nestjs/common';
import { hashToken } from '../../../common/security/token-hash.js';
import { CLIENT, buildAuthKit, thrown } from '../../../../test/support/auth-unit.js';

async function startSession() {
  const kit = buildAuthKit();
  const user = await kit.seedUser();
  const session = await kit.sessions.start(user.id, CLIENT);
  return { kit, user, session };
}

describe('SessionService', () => {
  describe('start', () => {
    it('stores only the SHA-256 hash of the refresh token, with the device details', async () => {
      const { kit, user, session } = await startSession();

      expect(kit.fake.refreshToken.rows).toHaveLength(1);
      const [row] = kit.fake.refreshToken.rows;
      expect(row).toMatchObject({
        userId: user.id,
        familyId: session.familyId,
        tokenHash: hashToken(session.refreshToken),
        revokedAt: null,
        ipAddress: CLIENT.ipAddress,
        userAgent: CLIENT.userAgent,
      });
      expect(JSON.stringify(row)).not.toContain(session.refreshToken);
      expect((row?.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    });
  });

  describe('rotate', () => {
    it('replaces the token with a new one in the same session and revokes the old one', async () => {
      const { kit, user, session } = await startSession();

      const rotated = await kit.sessions.rotate(session.refreshToken, CLIENT);

      expect(rotated.familyId).toBe(session.familyId);
      expect(rotated.refreshToken).not.toBe(session.refreshToken);
      expect(rotated.account.id).toBe(user.id);
      const [old, next] = kit.fake.refreshToken.rows;
      expect(old).toMatchObject({ revokedReason: 'ROTATED', lastUsedAt: expect.any(Date) as Date });
      expect(old?.revokedAt).toBeInstanceOf(Date);
      expect(next).toMatchObject({ revokedAt: null, tokenHash: hashToken(rotated.refreshToken) });
      expect(kit.auditActions()).toEqual(['REFRESH_TOKEN_ROTATED']);
    });

    it('can rotate repeatedly, including within the same second (tokens are unique)', async () => {
      const { kit, session } = await startSession();

      let token = session.refreshToken;
      const seen = new Set([token]);
      for (let i = 0; i < 5; i += 1) {
        token = (await kit.sessions.rotate(token, CLIENT)).refreshToken;
        seen.add(token);
      }

      expect(seen.size).toBe(6);
      expect(kit.fake.refreshToken.rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
    });

    it('detects reuse of a rotated token and revokes the whole session', async () => {
      const { kit, session } = await startSession();
      const rotated = await kit.sessions.rotate(session.refreshToken, CLIENT);

      const error = await thrown(kit.sessions.rotate(session.refreshToken, CLIENT));

      expect(error.code).toBe('TOKEN_INVALID');
      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      // The legitimate holder of the newest token is signed out too: the token may have been stolen.
      const next = await thrown(kit.sessions.rotate(rotated.refreshToken, CLIENT));
      expect(next.code).toBe('TOKEN_INVALID');
      expect(kit.fake.refreshToken.rows.map((row) => row.revokedReason)).toEqual([
        'ROTATED',
        'REUSE_DETECTED',
      ]);
      expect(kit.auditActions()).toContain('REFRESH_TOKEN_REUSE_DETECTED');
    });

    it("does not touch the user's other sessions when one session is burned", async () => {
      const { kit, user, session } = await startSession();
      const otherDevice = await kit.sessions.start(user.id, CLIENT);
      await kit.sessions.rotate(session.refreshToken, CLIENT);

      await thrown(kit.sessions.rotate(session.refreshToken, CLIENT)); // replay burns session 1

      await expect(kit.sessions.rotate(otherDevice.refreshToken, CLIENT)).resolves.toBeDefined();
    });

    it('rejects a token that was revoked by logout, without treating it as theft', async () => {
      const { kit, user, session } = await startSession();
      await kit.sessions.revokeSession(session.familyId, user.id, 'LOGOUT');

      const error = await thrown(kit.sessions.rotate(session.refreshToken, CLIENT));

      expect(error.code).toBe('TOKEN_INVALID');
      expect(kit.auditActions()).not.toContain('REFRESH_TOKEN_REUSE_DETECTED');
    });

    it('rejects an expired session even though the JWT itself is still valid', async () => {
      const { kit, session } = await startSession();
      kit.fake.refreshToken.rows[0]!.expiresAt = new Date(Date.now() - 1000);

      const error = await thrown(kit.sessions.rotate(session.refreshToken, CLIENT));

      expect(error.code).toBe('TOKEN_INVALID');
    });

    it('rejects garbage, an access token, and a validly signed token that was never stored', async () => {
      const { kit, user, session } = await startSession();
      const accessToken = await kit.tokens.signAccessToken({
        id: user.id,
        email: user.email,
        roles: ['STUDENT'],
        sessionId: session.familyId,
      });
      kit.fake.refreshToken.rows.splice(0, 1); // e.g. removed by the cleanup job

      for (const token of ['not-a-jwt', accessToken, session.refreshToken]) {
        expect((await thrown(kit.sessions.rotate(token, CLIENT))).code).toBe('TOKEN_INVALID');
      }
    });

    it('lets exactly one of two simultaneous rotations win, and treats the loser as reuse', async () => {
      const { kit, session } = await startSession();

      const results = await Promise.allSettled([
        kit.sessions.rotate(session.refreshToken, CLIENT),
        kit.sessions.rotate(session.refreshToken, CLIENT),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      // The loser looked like a replay, so the session is now fully revoked.
      expect(kit.fake.refreshToken.rows.every((row) => row.revokedAt !== null)).toBe(true);
      expect(kit.auditActions()).toContain('REFRESH_TOKEN_REUSE_DETECTED');
    });

    it('answers 403 and revokes the session when the account was suspended', async () => {
      const { kit, session } = await startSession();
      kit.fake.user.rows[0]!.status = 'SUSPENDED';

      const error = await thrown(kit.sessions.rotate(session.refreshToken, CLIENT));

      expect(error.code).toBe('ACCOUNT_SUSPENDED');
      expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(kit.fake.refreshToken.rows.every((row) => row.revokedAt !== null)).toBe(true);
      expect(kit.auditActions()).toEqual(['ACCOUNT_SUSPENDED']);
    });

    it('answers 401 when the user no longer exists', async () => {
      const { kit, session } = await startSession();
      kit.fake.user.rows.splice(0, 1);

      expect((await thrown(kit.sessions.rotate(session.refreshToken, CLIENT))).code).toBe(
        'TOKEN_INVALID',
      );
    });
  });

  describe('revocation', () => {
    it('revokeSession ends one session and reports how many tokens it revoked', async () => {
      const { kit, user, session } = await startSession();
      const other = await kit.sessions.start(user.id, CLIENT);

      expect(await kit.sessions.revokeSession(session.familyId, user.id, 'LOGOUT')).toBe(1);
      expect(await kit.sessions.revokeSession(session.familyId, user.id, 'LOGOUT')).toBe(0);
      await expect(kit.sessions.rotate(other.refreshToken, CLIENT)).resolves.toBeDefined();
    });

    it("revokeSession cannot end another user's session, even with its id", async () => {
      const { kit, session } = await startSession();

      expect(await kit.sessions.revokeSession(session.familyId, 'some-other-user', 'LOGOUT')).toBe(
        0,
      );
      expect(kit.fake.refreshToken.rows[0]?.revokedAt).toBeNull();
    });

    it('revokeAllForUser ends every live session of that user only', async () => {
      const { kit, user } = await startSession();
      await kit.sessions.start(user.id, CLIENT);
      const stranger = await kit.seedUser({ email: 'stranger@example.test' });
      const strangerSession = await kit.sessions.start(stranger.id, CLIENT);

      expect(await kit.sessions.revokeAllForUser(user.id, 'LOGOUT_ALL')).toBe(2);
      await expect(
        kit.sessions.rotate(strangerSession.refreshToken, CLIENT),
      ).resolves.toBeDefined();
    });
  });
});
