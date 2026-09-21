import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createDb, inRollback, makeUser } from './support/db.js';

const P2002 = { code: 'P2002' }; // unique constraint
const P2003 = { code: 'P2003' }; // foreign key constraint

const hash = () => randomBytes(32).toString('hex');
const inAnHour = () => new Date(Date.now() + 3_600_000);

describe('Real MySQL database: authentication token tables', () => {
  let db: PrismaClient;

  beforeAll(() => {
    db = createDb();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('a token hash can exist only once', () => {
    it('refresh_tokens', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const tokenHash = hash();
          const data = {
            userId: user.id,
            familyId: randomUUID(),
            tokenHash,
            expiresAt: inAnHour(),
          };
          await tx.refreshToken.create({ data });
          await tx.refreshToken.create({ data: { ...data, familyId: randomUUID() } });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('email_verification_tokens', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const data = { userId: user.id, tokenHash: hash(), expiresAt: inAnHour() };
          await tx.emailVerificationToken.create({ data });
          await tx.emailVerificationToken.create({ data });
        }),
      ).rejects.toMatchObject(P2002);
    });

    it('password_reset_tokens', async () => {
      await expect(
        inRollback(db, async (tx) => {
          const user = await makeUser(tx);
          const data = { userId: user.id, tokenHash: hash(), expiresAt: inAnHour() };
          await tx.passwordResetToken.create({ data });
          await tx.passwordResetToken.create({ data });
        }),
      ).rejects.toMatchObject(P2002);
    });
  });

  describe('every token belongs to a real user', () => {
    it('refuses a token for a user that does not exist', async () => {
      await expect(
        inRollback(db, async (tx) => {
          await tx.refreshToken.create({
            data: {
              userId: randomUUID(),
              familyId: randomUUID(),
              tokenHash: hash(),
              expiresAt: inAnHour(),
            },
          });
        }),
      ).rejects.toMatchObject(P2003);

      await expect(
        inRollback(db, async (tx) => {
          await tx.emailVerificationToken.create({
            data: { userId: randomUUID(), tokenHash: hash(), expiresAt: inAnHour() },
          });
        }),
      ).rejects.toMatchObject(P2003);

      await expect(
        inRollback(db, async (tx) => {
          await tx.passwordResetToken.create({
            data: { userId: randomUUID(), tokenHash: hash(), expiresAt: inAnHour() },
          });
        }),
      ).rejects.toMatchObject(P2003);
    });

    it("removes all of a user's tokens when the user is deleted (no orphaned credentials)", async () => {
      const counts = await inRollback(db, async (tx) => {
        const user = await makeUser(tx);
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            familyId: randomUUID(),
            tokenHash: hash(),
            expiresAt: inAnHour(),
          },
        });
        await tx.emailVerificationToken.create({
          data: { userId: user.id, tokenHash: hash(), expiresAt: inAnHour() },
        });
        await tx.passwordResetToken.create({
          data: { userId: user.id, tokenHash: hash(), expiresAt: inAnHour() },
        });

        await tx.user.delete({ where: { id: user.id } });

        return {
          refresh: await tx.refreshToken.count({ where: { userId: user.id } }),
          verification: await tx.emailVerificationToken.count({ where: { userId: user.id } }),
          reset: await tx.passwordResetToken.count({ where: { userId: user.id } }),
        };
      });

      expect(counts).toEqual({ refresh: 0, verification: 0, reset: 0 });
    });
  });

  describe('column definitions', () => {
    it('stores hashes in fixed 64-character columns and never allows a NULL hash or expiry', async () => {
      const columns = await db.$queryRaw<
        Array<{ tbl: string; col: string; type: string; nullable: string }>
      >`
        SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col, COLUMN_TYPE AS type, IS_NULLABLE AS nullable
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('refresh_tokens', 'email_verification_tokens', 'password_reset_tokens')
          AND COLUMN_NAME IN ('tokenHash', 'expiresAt')`;

      expect(columns).toHaveLength(6);
      for (const column of columns.filter((row) => row.col === 'tokenHash')) {
        expect(column.type).toBe('char(64)');
      }
      expect(columns.every((column) => column.nullable === 'NO')).toBe(true);
    });

    it('limits revokedReason to the known reasons', async () => {
      const [row] = await db.$queryRaw<Array<{ type: string }>>`
        SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'revokedReason'`;

      expect(row?.type).toBe(
        "enum('ROTATED','LOGOUT','LOGOUT_ALL','PASSWORD_RESET','REUSE_DETECTED','ADMIN')",
      );
    });

    it('has the indexes the auth queries depend on (hash lookup, per-user, per-family, expiry)', async () => {
      const indexes = await db.$queryRaw<Array<{ tbl: string; idx: string }>>`
        SELECT DISTINCT TABLE_NAME AS tbl, INDEX_NAME AS idx FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('refresh_tokens', 'email_verification_tokens', 'password_reset_tokens')`;
      const names = new Set(indexes.map((index) => `${index.tbl}.${index.idx}`));

      for (const expected of [
        'refresh_tokens.refresh_tokens_tokenHash_key',
        'refresh_tokens.refresh_tokens_userId_revokedAt_idx',
        'refresh_tokens.refresh_tokens_familyId_idx',
        'refresh_tokens.refresh_tokens_expiresAt_idx',
        'email_verification_tokens.email_verification_tokens_tokenHash_key',
        'email_verification_tokens.email_verification_tokens_expiresAt_idx',
        'password_reset_tokens.password_reset_tokens_tokenHash_key',
        'password_reset_tokens.password_reset_tokens_expiresAt_idx',
      ]) {
        expect(names).toContain(expected);
      }
    });
  });
});
