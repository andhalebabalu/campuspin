import { verifyPassword } from '../../../common/security/password-hasher.js';
import { hashToken } from '../../../common/security/token-hash.js';
import {
  CLIENT,
  OTHER_STRONG,
  STRONG,
  buildAuthKit,
  thrown,
} from '../../../../test/support/auth-unit.js';

/** Requests a reset for a user and returns the raw token from the "email". */
async function requestReset(kit: ReturnType<typeof buildAuthKit>, email: string) {
  await kit.reset.request(email, CLIENT);
  return kit.emails.latest('reset')?.token ?? '';
}

describe('PasswordResetService', () => {
  describe('request (never reveals whether an account exists)', () => {
    it('emails a single-use link, stores only its hash, and audits the request', async () => {
      const kit = buildAuthKit({ PASSWORD_RESET_EXPIRES_IN: '30m' });
      const user = await kit.seedUser();

      const token = await requestReset(kit, user.email);

      const [row] = kit.fake.passwordResetToken.rows;
      expect(row).toMatchObject({ userId: user.id, tokenHash: hashToken(token), usedAt: null });
      expect(JSON.stringify(row)).not.toContain(token);
      const lifetime = (row?.expiresAt as Date).getTime() - Date.now();
      expect(lifetime).toBeGreaterThan(30 * 60_000 - 5000);
      expect(lifetime).toBeLessThanOrEqual(30 * 60_000);
      expect(kit.emails.latest('reset')).toMatchObject({ to: user.email, name: 'Seeded User' });
      expect(kit.fake.auditLog.rows[0]).toMatchObject({
        action: 'PASSWORD_RESET_REQUESTED',
        actorId: user.id,
      });
    });

    it('invalidates the previous link when a new one is requested', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser();

      const first = await requestReset(kit, user.email);
      const second = await requestReset(kit, user.email);

      expect(kit.fake.passwordResetToken.rows).toHaveLength(1);
      expect((await thrown(kit.reset.reset(first, OTHER_STRONG, CLIENT))).code).toBe(
        'TOKEN_INVALID',
      );
      await expect(kit.reset.reset(second, OTHER_STRONG, CLIENT)).resolves.toBeUndefined();
    });

    it.each([
      ['an unknown email', 'nobody@example.test', undefined],
      ['a suspended account', 'sus@example.test', 'SUSPENDED' as const],
      ['a deactivated account', 'deact@example.test', 'DEACTIVATED' as const],
    ])('does nothing, silently, for %s', async (_label, email, status) => {
      const kit = buildAuthKit();
      if (status) await kit.seedUser({ email, status });

      await expect(kit.reset.request(email, CLIENT)).resolves.toBeUndefined();

      expect(kit.emails.sent).toHaveLength(0);
      expect(kit.fake.passwordResetToken.rows).toHaveLength(0);
      expect(kit.fake.auditLog.rows).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('sets the new password, spends the link, revokes every session and audits it', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser();
      const phone = await kit.sessions.start(user.id, CLIENT);
      const laptop = await kit.sessions.start(user.id, CLIENT);
      const token = await requestReset(kit, user.email);

      await kit.reset.reset(token, OTHER_STRONG, CLIENT);

      const hash = kit.fake.user.rows[0]?.passwordHash as string;
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(await verifyPassword(hash, OTHER_STRONG)).toBe(true);
      expect(await verifyPassword(hash, STRONG)).toBe(false);
      expect(kit.fake.passwordResetToken.rows[0]?.usedAt).toBeInstanceOf(Date);

      for (const { refreshToken } of [phone, laptop]) {
        expect((await thrown(kit.sessions.rotate(refreshToken, CLIENT))).code).toBe(
          'TOKEN_INVALID',
        );
      }
      expect(kit.fake.refreshToken.rows.map((row) => row.revokedReason)).toEqual([
        'PASSWORD_RESET',
        'PASSWORD_RESET',
      ]);
      expect(kit.fake.auditLog.rows.at(-1)).toMatchObject({
        action: 'PASSWORD_RESET_COMPLETED',
        actorId: user.id,
        metadata: { sessionsRevoked: 2 },
      });
    });

    it('lets the user sign in with the new password only', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser();
      await kit.reset.reset(await requestReset(kit, user.email), OTHER_STRONG, CLIENT);

      await expect(
        kit.auth.login({ email: user.email, password: OTHER_STRONG }, CLIENT),
      ).resolves.toBeDefined();
      expect(
        (await thrown(kit.auth.login({ email: user.email, password: STRONG }, CLIENT))).code,
      ).toBe('INVALID_CREDENTIALS');
    });

    it('rejects an unknown token with 400 TOKEN_INVALID', async () => {
      const kit = buildAuthKit();
      const error = await thrown(kit.reset.reset('x'.repeat(43), OTHER_STRONG, CLIENT));
      expect(error.code).toBe('TOKEN_INVALID');
      expect(error.getStatus()).toBe(400);
    });

    it('rejects a link that was already used, without touching the password again', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser();
      const token = await requestReset(kit, user.email);
      await kit.reset.reset(token, OTHER_STRONG, CLIENT);
      const hashAfterFirstUse = kit.fake.user.rows[0]?.passwordHash;

      const error = await thrown(kit.reset.reset(token, 'Third-Password-9Zq!', CLIENT));

      expect(error.code).toBe('TOKEN_INVALID');
      expect(kit.fake.user.rows[0]?.passwordHash).toBe(hashAfterFirstUse);
    });

    it('rejects an expired link with 400 TOKEN_EXPIRED and leaves the password and sessions alone', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser();
      const session = await kit.sessions.start(user.id, CLIENT);
      const token = await requestReset(kit, user.email);
      kit.fake.passwordResetToken.rows[0]!.expiresAt = new Date(Date.now() - 1000);
      const originalHash = kit.fake.user.rows[0]?.passwordHash;

      const error = await thrown(kit.reset.reset(token, OTHER_STRONG, CLIENT));

      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(kit.fake.user.rows[0]?.passwordHash).toBe(originalHash);
      await expect(kit.sessions.rotate(session.refreshToken, CLIENT)).resolves.toBeDefined();
    });

    it('refuses a password containing the email name and does NOT spend the link', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ email: 'ashapatil@example.test' });
      const token = await requestReset(kit, user.email);

      const error = await thrown(kit.reset.reset(token, 'Ashapatil#2024xyz', CLIENT));

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ fields: { newPassword: [expect.any(String) as string] } });
      expect(kit.fake.passwordResetToken.rows[0]?.usedAt).toBeNull();
      await expect(kit.reset.reset(token, OTHER_STRONG, CLIENT)).resolves.toBeUndefined();
    });

    it('lets only one of two simultaneous uses of the same link succeed', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser();
      const token = await requestReset(kit, user.email);

      const results = await Promise.allSettled([
        kit.reset.reset(token, OTHER_STRONG, CLIENT),
        kit.reset.reset(token, 'Third-Password-9Zq!', CLIENT),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(
        kit.fake.auditLog.rows.filter((row) => row.action === 'PASSWORD_RESET_COMPLETED'),
      ).toHaveLength(1);
    });
  });
});
