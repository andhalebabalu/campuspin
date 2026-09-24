import { randomUUID } from 'node:crypto';
import { adminBusinessSchema, adminDashboardSchema, adminUserSchema } from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  bearer,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';

const API = '/api/v1/admin';
const run = randomUUID().slice(0, 6);

type Req = { set: (name: string, value: string) => Req };

describe('Staff administration: dashboard, users, businesses (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let superAdmin: { userId: string; email: string; password: string; token: string };
  let admin: { userId: string; token: string };
  let moderator: { userId: string; token: string };
  let student: { userId: string; email: string; password: string; token: string };
  let owner: { userId: string; token: string };

  const as = <T extends Req>(who: { token: string }, req: T): T =>
    req.set('Authorization', bearer(who.token)) as T;

  async function persona(label: string, roles: string[] = [], businessName?: string) {
    const account = await registerAndVerify(ctx, {
      label,
      ...(businessName ? { businessName } : {}),
    });
    for (const role of roles) await grantRole(ctx.db, account.userId, role);
    const { accessToken } = await login(ctx, account);
    return { ...account, token: accessToken };
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    superAdmin = await persona('adm-super', ['SUPER_ADMIN']);
    admin = await persona('adm-admin', ['ADMIN']);
    moderator = await persona('adm-mod', ['MODERATOR']);
    student = await persona('adm-student');
    owner = await persona('adm-owner', [], `E2E Admin Test Mess ${run}`);
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /admin/dashboard', () => {
    it('is for staff only', async () => {
      expect((await as(student, ctx.get(`${API}/dashboard`))).status).toBe(403);
      expect((await as(owner, ctx.get(`${API}/dashboard`))).status).toBe(403);
    });

    it('gives any staff role the queue counts and totals', async () => {
      const response = await as(moderator, ctx.get(`${API}/dashboard`)).expect(200);
      const data = successOf(adminDashboardSchema, response).data;
      expect(data.queues.unverifiedBusinesses).toBeGreaterThanOrEqual(1);
      expect(data.totals.users).toBeGreaterThanOrEqual(5);
    });
  });

  describe('users', () => {
    it('lists and searches users for users.read holders only', async () => {
      expect((await as(student, ctx.get(`${API}/users`))).status).toBe(403);
      const response = await as(moderator, ctx.get(`${API}/users?q=adm-owner-`)).expect(200);
      const users = successOf(z.array(adminUserSchema), response).data;
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        id: owner.userId,
        roles: ['BUSINESS_OWNER'],
        business: { businessName: `E2E Admin Test Mess ${run}` },
      });

      const byRole = await as(admin, ctx.get(`${API}/users?role=SUPER_ADMIN&limit=50`)).expect(200);
      expect(successOf(z.array(adminUserSchema), byRole).data.map((user) => user.id)).toContain(
        superAdmin.userId,
      );
    });

    it('suspends with a reason, ends the sessions and blocks login; reactivates', async () => {
      const target = await persona('adm-target');
      // A moderator can read users but not manage them.
      await as(moderator, ctx.post(`${API}/users/${target.userId}/suspend`))
        .send({ reason: 'Spam' })
        .expect(403);
      await as(admin, ctx.post(`${API}/users/${target.userId}/suspend`))
        .send({})
        .expect(400);

      const suspended = await as(admin, ctx.post(`${API}/users/${target.userId}/suspend`))
        .send({ reason: 'Posting fake reviews' })
        .expect(200);
      expect(successOf(adminUserSchema, suspended).data.status).toBe('SUSPENDED');
      expect(
        await ctx.db.refreshToken.count({ where: { userId: target.userId, revokedAt: null } }),
      ).toBe(0);
      const blocked = await ctx
        .post('/api/v1/auth/login')
        .send({ email: target.email, password: target.password })
        .expect(403);
      expect(errorOf(blocked).error.code).toBe('ACCOUNT_SUSPENDED');
      await as(admin, ctx.post(`${API}/users/${target.userId}/suspend`))
        .send({ reason: 'Again' })
        .expect(409);

      const reactivated = await as(admin, ctx.post(`${API}/users/${target.userId}/reactivate`))
        .send({})
        .expect(200);
      expect(successOf(adminUserSchema, reactivated).data.status).toBe('ACTIVE');
      await login(ctx, target);

      const audit = await ctx.db.auditLog.findMany({
        where: { entityId: target.userId, action: { in: ['USER_SUSPENDED', 'USER_REACTIVATED'] } },
        select: { action: true, actorId: true, metadata: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((row) => row.action)).toEqual(['USER_SUSPENDED', 'USER_REACTIVATED']);
      expect(audit[0]?.actorId).toBe(admin.userId);
      expect((audit[0]?.metadata as { reason?: string }).reason).toBe('Posting fake reviews');
    });

    it('protects staff accounts and yourself', async () => {
      // An ADMIN cannot act on another admin or a super admin; nobody acts on themselves.
      const otherAdmin = await persona('adm-admin2', ['ADMIN']);
      await as(admin, ctx.post(`${API}/users/${otherAdmin.userId}/suspend`))
        .send({ reason: 'x' })
        .expect(403);
      await as(admin, ctx.post(`${API}/users/${superAdmin.userId}/suspend`))
        .send({ reason: 'x' })
        .expect(403);
      await as(superAdmin, ctx.post(`${API}/users/${superAdmin.userId}/suspend`))
        .send({ reason: 'x' })
        .expect(403);
      // A super admin can.
      await as(superAdmin, ctx.post(`${API}/users/${otherAdmin.userId}/suspend`))
        .send({ reason: 'Left the team' })
        .expect(200);
    });

    it('lets only a super admin set roles, and signs the user out when a role is removed', async () => {
      await as(admin, ctx.put(`${API}/users/${student.userId}/roles`))
        .send({ roles: ['STUDENT', 'MODERATOR'] })
        .expect(403);

      const promoted = await as(superAdmin, ctx.put(`${API}/users/${student.userId}/roles`))
        .send({ roles: ['STUDENT', 'MODERATOR'] })
        .expect(200);
      expect(successOf(adminUserSchema, promoted).data.roles).toEqual(['MODERATOR', 'STUDENT']);
      // Gaining a role keeps the session.
      expect(
        await ctx.db.refreshToken.count({ where: { userId: student.userId, revokedAt: null } }),
      ).toBeGreaterThan(0);

      const demoted = await as(superAdmin, ctx.put(`${API}/users/${student.userId}/roles`))
        .send({ roles: ['STUDENT'], reason: 'Trial over' })
        .expect(200);
      expect(successOf(adminUserSchema, demoted).data.roles).toEqual(['STUDENT']);
      expect(
        await ctx.db.refreshToken.count({ where: { userId: student.userId, revokedAt: null } }),
      ).toBe(0);

      await as(superAdmin, ctx.put(`${API}/users/${student.userId}/roles`))
        .send({ roles: [] })
        .expect(400);
      await as(superAdmin, ctx.put(`${API}/users/${superAdmin.userId}/roles`))
        .send({ roles: ['STUDENT'] })
        .expect(403);
    });

    it('never removes the last active super admin', async () => {
      // The rule only bites when no OTHER active super admin exists, so every other one (the seeded
      // dev admin included) is set DEACTIVATED for the duration of this test and restored in `finally`.
      const soleSuper = await persona('adm-sole', ['SUPER_ADMIN']);
      const others = await ctx.db.user.findMany({
        where: {
          id: { notIn: [soleSuper.userId, superAdmin.userId] },
          status: 'ACTIVE',
          userRoles: { some: { role: { key: 'SUPER_ADMIN' } } },
        },
        select: { id: true },
      });
      await ctx.db.user.updateMany({
        where: { id: { in: others.map((row) => row.id) } },
        data: { status: 'DEACTIVATED' },
      });
      try {
        // superAdmin demotes soleSuper: fine while superAdmin is still a super admin.
        await as(superAdmin, ctx.put(`${API}/users/${soleSuper.userId}/roles`))
          .send({ roles: ['STUDENT'] })
          .expect(200);
        // Now superAdmin is the only one: soleSuper (re-promoted by the DB) cannot remove them.
        await grantRole(ctx.db, soleSuper.userId, 'SUPER_ADMIN');
        const { accessToken } = await login(ctx, soleSuper);
        await ctx.db.user.update({
          where: { id: soleSuper.userId },
          data: { status: 'DEACTIVATED' },
        });
        const refused = await as(
          { token: accessToken },
          ctx.post(`${API}/users/${superAdmin.userId}/suspend`),
        )
          .send({ reason: 'x' })
          .expect(409);
        expect(errorOf(refused).message).toMatch(/last active super admin/);
      } finally {
        await ctx.db.user.updateMany({
          where: { id: { in: others.map((row) => row.id) } },
          data: { status: 'ACTIVE' },
        });
      }
    });
  });

  describe('businesses', () => {
    it('lists and verifies businesses (businesses.manage), with listing counts', async () => {
      await as(moderator, ctx.get(`${API}/businesses`)).expect(403);

      const listed = await as(
        admin,
        ctx.get(`${API}/businesses?q=${encodeURIComponent(`Admin Test Mess ${run}`)}`),
      ).expect(200);
      const [business] = successOf(z.array(adminBusinessSchema), listed).data;
      expect(business).toMatchObject({
        businessName: `E2E Admin Test Mess ${run}`,
        owner: { id: owner.userId },
        verificationStatus: 'PENDING',
        listingCount: 0,
      });

      const verified = await as(admin, ctx.post(`${API}/businesses/${business?.id}/verify`))
        .send({})
        .expect(200);
      expect(successOf(adminBusinessSchema, verified).data.verificationStatus).toBe('VERIFIED');
      await as(admin, ctx.post(`${API}/businesses/${business?.id}/verify`))
        .send({})
        .expect(409);

      // The owner sees it on their dashboard.
      const dashboard = await as(owner, ctx.get('/api/v1/business/dashboard')).expect(200);
      expect(
        (dashboard.body as { data: { profile: { verificationStatus: string } } }).data.profile
          .verificationStatus,
      ).toBe('VERIFIED');

      await as(admin, ctx.post(`${API}/businesses/${business?.id}/unverify`))
        .send({ reason: 'Documents expired' })
        .expect(200);
      const audit = await ctx.db.auditLog.findMany({
        where: { entityId: business?.id },
        select: { action: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((row) => row.action)).toEqual(['BUSINESS_VERIFIED', 'BUSINESS_UNVERIFIED']);
    });
  });
});
