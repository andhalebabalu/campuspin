import { randomUUID } from 'node:crypto';
import { activityOverviewSchema, adminUserSchema } from '@platform/contracts';
import { z } from 'zod';
import { type AuthTestContext, createAuthTestContext, successOf } from './support/auth-e2e.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';

/**
 * Visits, "last active" and the staff overview against the real database. The test's visits use
 * fresh random visitor ids and are removed afterwards, so real figures are not changed.
 */
describe('Activity analytics (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let admin: Persona;
  let student: Persona;
  const guestDevice = randomUUID();
  const studentPhone = randomUUID();

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    admin = await persona(ctx, 'analytics-admin', { role: 'ADMIN' });
    student = await persona(ctx, 'analytics-student'); // registration makes a student
  });

  afterAll(async () => {
    if (ctx) {
      await ctx.db.dailyVisit.deleteMany({
        where: { visitorKey: { in: [`v:${guestDevice}`, `v:${studentPhone}`] } },
      });
      await ctx.close();
    }
  });

  const overview = async () =>
    successOf(
      activityOverviewSchema,
      await as(admin, ctx.get(`${API}/admin/analytics/activity`)).expect(200),
    ).data;

  it('counts a guest visit and a signed-in visit once per device per day', async () => {
    const before = (await overview()).periods.find((p) => p.key === 'today')!;

    await ctx
      .post(`${API}/analytics/visit`)
      .send({ visitorId: guestDevice, client: 'web' })
      .expect(200);
    await ctx
      .post(`${API}/analytics/visit`)
      .send({ visitorId: guestDevice, client: 'web' })
      .expect(200);
    await as(student, ctx.post(`${API}/analytics/visit`))
      .send({ visitorId: studentPhone, client: 'mobile' })
      .expect(200);

    const today = (await overview()).periods.find((p) => p.key === 'today')!;
    expect(today.visitors - before.visitors).toBe(2);
    expect(today.guestVisitors - before.guestVisitors).toBe(1);
    expect(today.webVisitors - before.webVisitors).toBe(1);
    expect(today.mobileVisitors - before.mobileVisitors).toBe(1);
    expect(today.activeStudents - before.activeStudents).toBe(1);
  });

  it('refuses a malformed visitor id', async () => {
    const response = await ctx
      .post(`${API}/analytics/visit`)
      .send({ visitorId: 'x', client: 'web' });
    expect(response.status).toBe(400);
  });

  it('shows when a member was last active, and counts them online', async () => {
    const users = successOf(
      z.array(adminUserSchema),
      await as(admin, ctx.get(`${API}/admin/users`))
        .query({ q: student.email })
        .expect(200),
    ).data;
    const lastActive = users[0]?.lastActiveAt;
    expect(lastActive).not.toBeNull();
    expect(Date.now() - new Date(lastActive!).getTime()).toBeLessThan(60_000);
    expect((await overview()).onlineNow).toBeGreaterThanOrEqual(1);
  });

  it('keeps the overview for staff with analytics.view', async () => {
    expect((await as(student, ctx.get(`${API}/admin/analytics/activity`))).status).toBe(403);
    const data = await overview();
    expect(data.daily).toHaveLength(30);
    expect(data.ratios.activeRate30d).toBeGreaterThanOrEqual(0);
    expect(data.ratios.activeRate30d).toBeLessThanOrEqual(1);
  });
});
