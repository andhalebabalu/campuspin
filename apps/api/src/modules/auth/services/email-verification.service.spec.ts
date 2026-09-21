import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { generateOpaqueToken, hashToken } from '../../../common/security/token-hash.js';
import { CLIENT, buildAuthKit, thrown } from '../../../../test/support/auth-unit.js';

/** Gives a user a verification link the way registration does, and returns the raw token. */
async function issueLink(
  kit: ReturnType<typeof buildAuthKit>,
  user: { id: string; email: string },
) {
  await kit.verification.issueAndSend({ id: user.id, name: 'Seeded User', email: user.email });
  return kit.emails.latest('verification')?.token ?? '';
}

describe('EmailVerificationService', () => {
  describe('issueAndSend', () => {
    it('stores only the hash, with the configured expiry, and emails the raw token', async () => {
      const kit = buildAuthKit({ EMAIL_VERIFICATION_EXPIRES_IN: '2h' });
      const user = await kit.seedUser({ verified: false });

      const token = await issueLink(kit, user);

      const [row] = kit.fake.emailVerificationToken.rows;
      expect(row).toMatchObject({ userId: user.id, tokenHash: hashToken(token), usedAt: null });
      expect(JSON.stringify(row)).not.toContain(token);
      const lifetime = (row?.expiresAt as Date).getTime() - Date.now();
      expect(lifetime).toBeGreaterThan(2 * 3600_000 - 5000);
      expect(lifetime).toBeLessThanOrEqual(2 * 3600_000);
    });

    it('keeps at most one unused link per user: a new one discards the old', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });

      const first = await issueLink(kit, user);
      const second = await issueLink(kit, user);

      expect(first).not.toBe(second);
      expect(kit.fake.emailVerificationToken.rows).toHaveLength(1);
      expect(kit.fake.emailVerificationToken.rows[0]?.tokenHash).toBe(hashToken(second));
    });
  });

  describe('verify', () => {
    it('marks the email verified, spends the token, discards other links and audits it', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });
      const token = await issueLink(kit, user);
      // A second, unused link (as if issued before a resend race).
      await kit.fake.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(generateOpaqueToken()),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      await kit.verification.verify(token, CLIENT);

      expect(kit.fake.user.rows[0]?.emailVerifiedAt).toBeInstanceOf(Date);
      const rows = kit.fake.emailVerificationToken.rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.usedAt).toBeInstanceOf(Date);
      expect(kit.fake.auditLog.rows[0]).toMatchObject({
        action: 'EMAIL_VERIFIED',
        actorId: user.id,
        ipAddress: CLIENT.ipAddress,
        requestId: CLIENT.requestId,
      });
    });

    it('rejects an unknown token with 400 TOKEN_INVALID', async () => {
      const kit = buildAuthKit();
      const error = await thrown(kit.verification.verify(generateOpaqueToken(), CLIENT));
      expect(error.code).toBe('TOKEN_INVALID');
      expect(error.getStatus()).toBe(400);
    });

    it('rejects a token that was already used, and leaves the email as it was', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });
      const token = await issueLink(kit, user);
      await kit.verification.verify(token, CLIENT);
      const verifiedAt = kit.fake.user.rows[0]?.emailVerifiedAt;

      const error = await thrown(kit.verification.verify(token, CLIENT));

      expect(error.code).toBe('TOKEN_INVALID');
      expect(kit.fake.user.rows[0]?.emailVerifiedAt).toBe(verifiedAt);
    });

    it('rejects an expired token with 400 TOKEN_EXPIRED and does not verify the email', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });
      const token = await issueLink(kit, user);
      kit.fake.emailVerificationToken.rows[0]!.expiresAt = new Date(Date.now() - 1000);

      const error = await thrown(kit.verification.verify(token, CLIENT));

      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.getStatus()).toBe(400);
      expect(kit.fake.user.rows[0]?.emailVerifiedAt).toBeNull();
      expect(kit.fake.auditLog.rows).toHaveLength(0);
    });

    it('lets only one of two simultaneous uses of the same link succeed', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });
      const token = await issueLink(kit, user);

      const results = await Promise.allSettled([
        kit.verification.verify(token, CLIENT),
        kit.verification.verify(token, CLIENT),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(kit.fake.auditLog.rows.filter((row) => row.action === 'EMAIL_VERIFIED')).toHaveLength(
        1,
      );
    });
  });

  describe('resend (never reveals whether an account exists)', () => {
    it('sends a new link to an unverified account and invalidates the old one', async () => {
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });
      const oldToken = await issueLink(kit, user);

      await kit.verification.resend(user.email, CLIENT);

      const newToken = kit.emails.latest('verification')?.token;
      expect(newToken).not.toBe(oldToken);
      expect((await thrown(kit.verification.verify(oldToken, CLIENT))).code).toBe('TOKEN_INVALID');
      await expect(kit.verification.verify(newToken ?? '', CLIENT)).resolves.toBeUndefined();
      expect(kit.auditActions()).toEqual(['VERIFICATION_EMAIL_RESENT', 'EMAIL_VERIFIED']);
    });

    // `undefined` means "no such account exists at all".
    it.each([
      ['an unknown email', undefined],
      ['an already verified account', { verified: true }],
      ['a suspended account', { verified: false, status: 'SUSPENDED' as const }],
      ['a deactivated account', { verified: false, status: 'DEACTIVATED' as const }],
    ])('does nothing, silently, for %s', async (_label, account) => {
      const kit = buildAuthKit();
      if (account) await kit.seedUser({ email: 'known@example.test', ...account });
      // Sanity: the unknown-email case really has no user, the others really have one.
      expect(kit.fake.user.rows).toHaveLength(account ? 1 : 0);

      await expect(
        kit.verification.resend(account ? 'known@example.test' : 'nobody@example.test', CLIENT),
      ).resolves.toBeUndefined();

      expect(kit.emails.sent).toHaveLength(0);
      expect(kit.fake.emailVerificationToken.rows).toHaveLength(0);
      expect(kit.fake.auditLog.rows).toHaveLength(0);
    });

    it('does not fail, and does not wait, when the email cannot be sent', async () => {
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const kit = buildAuthKit();
      const user = await kit.seedUser({ verified: false });
      kit.emails.failWith = new Error('mail server unreachable');

      await expect(kit.verification.resend(user.email, CLIENT)).resolves.toBeUndefined();

      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('mail server unreachable'));
      errorLog.mockRestore();
    });
  });
});
