import {
  adminBusinessAnalyticsSchema,
  adminBusinessDetailSchema,
  adminBusinessSchema,
  adminDashboardSchema,
  adminPlanSchema,
  auditEntrySchema,
  bulkBusinessResultSchema,
  ownershipIssueSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  createAuthTestContext,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';
import { type BusinessFixture, businessWithPlace } from './support/business-fixtures.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';
const ADMIN = `${API}/admin`;

/** The CRM side of the admin panel: decisions, their effect on listings, plans, transfer, audit. */
describe('Admin CRM (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let admin: Persona;
  let moderator: Persona;
  let student: Persona;
  let mess: BusinessFixture;

  const statusOf = async (placeId: string) =>
    (await ctx.db.place.findUniqueOrThrow({ where: { id: placeId }, select: { status: true } }))
      .status;
  const detail = async (id: string) =>
    successOf(
      adminBusinessDetailSchema,
      await as(admin, ctx.get(`${ADMIN}/businesses/${id}`)).expect(200),
    ).data;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    admin = await persona(ctx, 'crm-admin', { role: 'ADMIN' });
    moderator = await persona(ctx, 'crm-mod', { role: 'MODERATOR' });
    student = await persona(ctx, 'crm-student');
    mess = await businessWithPlace(ctx, 'crm-mess');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('keeps business management to staff with businesses.manage', async () => {
    await as(student, ctx.get(`${ADMIN}/businesses/${mess.businessId}`)).expect(403);
    await as(moderator, ctx.get(`${ADMIN}/businesses/${mess.businessId}`)).expect(403);
    await as(mess.owner, ctx.post(`${ADMIN}/businesses/${mess.businessId}/suspend`))
      .send({ reason: 'x' })
      .expect(403);
    await as(moderator, ctx.get(`${ADMIN}/audit-logs`)).expect(403);
  });

  it('lists with filters, the plan and whether the page is live', async () => {
    const response = await as(
      admin,
      ctx.get(`${ADMIN}/businesses?q=${encodeURIComponent('crm-mess')}&status=ACTIVE&sort=name`),
    ).expect(200);
    const [row] = successOf(z.array(adminBusinessSchema), response).data;
    expect(row).toMatchObject({
      id: mess.businessId,
      status: 'ACTIVE',
      isPublic: true,
      plan: { key: 'FREE' },
      liveListingCount: 1,
    });
    const none = await as(admin, ctx.get(`${ADMIN}/businesses?q=crm-mess&status=SUSPENDED`)).expect(
      200,
    );
    expect(successOf(z.array(adminBusinessSchema), none).data).toHaveLength(0);
  });

  it('suspends with a reason, hiding the listing, and reinstating brings exactly it back', async () => {
    await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/suspend`))
      .send({})
      .expect(400);
    const suspended = successOf(
      adminBusinessSchema,
      await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/suspend`))
        .send({ reason: 'Fake photos' })
        .expect(200),
    ).data;
    expect(suspended).toMatchObject({
      status: 'SUSPENDED',
      statusReason: 'Fake photos',
      isPublic: false,
    });
    expect(await statusOf(mess.place.id)).toBe('INACTIVE');
    await ctx.get(`${API}/places/${mess.place.slug}`).expect(404);
    const note = await ctx.db.notification.findFirst({
      where: { userId: mess.owner.userId, type: 'business.business_suspended' },
    });
    expect(note?.message).toContain('Fake photos');
    await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/suspend`))
      .send({ reason: 'Again' })
      .expect(409);

    await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/reinstate`))
      .send({})
      .expect(200);
    expect(await statusOf(mess.place.id)).toBe('ACTIVE');
    await ctx.get(`${API}/places/${mess.place.slug}`).expect(200);
  });

  it('rejects, then reinstates to pending; verifying sets the verified time', async () => {
    await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/reject`))
      .send({ reason: 'Not a student business' })
      .expect(200);
    expect(await statusOf(mess.place.id)).toBe('INACTIVE');
    const reinstated = successOf(
      adminBusinessSchema,
      await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/reinstate`))
        .send({})
        .expect(200),
    ).data;
    expect(reinstated).toMatchObject({ verificationStatus: 'PENDING', statusReason: null });
    expect(await statusOf(mess.place.id)).toBe('ACTIVE');

    await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/verify`))
      .send({})
      .expect(200);
    const after = await detail(mess.businessId);
    expect(after.verificationStatus).toBe('VERIFIED');
    expect(after.verifiedAt).not.toBeNull();
    expect(after.history.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'BUSINESS_SUSPENDED',
        'BUSINESS_REINSTATED',
        'BUSINESS_REJECTED',
        'BUSINESS_VERIFIED',
      ]),
    );
    expect(after.listings).toHaveLength(1);
    expect(after.deletable).toBe(false);
  });

  it('skips what cannot change in a bulk action and says why', async () => {
    const result = successOf(
      bulkBusinessResultSchema,
      await as(admin, ctx.post(`${ADMIN}/businesses/bulk`))
        .send({ ids: [mess.businessId], action: 'verify' })
        .expect(200),
    ).data;
    expect(result.done).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/already verified/);
    await as(admin, ctx.post(`${ADMIN}/businesses/bulk`))
      .send({ ids: [mess.businessId], action: 'suspend' })
      .expect(400);
  });

  it('assigns a plan without payment and can put the business back on Free', async () => {
    const pro = await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/subscription`))
      .send({ planKey: 'BUSINESS_PRO', note: 'Pilot' })
      .expect(200);
    expect(successOf(adminBusinessDetailSchema, pro).data.subscription).toMatchObject({
      isDefault: false,
      plan: { key: 'BUSINESS_PRO' },
    });
    const plans = successOf(
      z.array(adminPlanSchema),
      await as(admin, ctx.get(`${ADMIN}/plans`)).expect(200),
    ).data;
    expect(
      plans.find((plan) => plan.key === 'BUSINESS_PRO')?.activeSubscriptions,
    ).toBeGreaterThanOrEqual(1);

    const free = await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/subscription`))
      .send({ planKey: 'FREE' })
      .expect(200);
    const back = successOf(adminBusinessDetailSchema, free).data;
    expect(back.subscription).toMatchObject({ isDefault: true, plan: { key: 'FREE' } });
    expect(back.subscriptionHistory[0]).toMatchObject({
      status: 'CANCELLED',
      plan: { key: 'BUSINESS_PRO' },
    });
    await as(admin, ctx.post(`${ADMIN}/businesses/${mess.businessId}/subscription`))
      .send({ planKey: 'NOPE' })
      .expect(400);
  });

  it('finds a business owned by a student and moves it to a business account', async () => {
    // A business run from a student account (what the old flow could have produced).
    const run = Date.now().toString(36);
    const legacy = await ctx.db.businessProfile.create({
      data: {
        ownerId: student.userId,
        businessName: `E2E Legacy ${run}`,
        slug: `e2e-legacy-${run}`,
      },
    });
    const issues = successOf(
      z.array(ownershipIssueSchema),
      await as(admin, ctx.get(`${ADMIN}/businesses/ownership-check`)).expect(200),
    ).data;
    expect(issues.find((issue) => issue.business.id === legacy.id)?.problem).toBe(
      'OWNER_IS_STUDENT',
    );

    // The new owner signs up as a business; staff delete the empty business the sign-up made.
    const owner = await registerAndVerify(ctx, {
      label: 'crm-new-owner',
      businessName: `E2E Empty ${run}`,
    });
    const empty = await ctx.db.businessProfile.findFirstOrThrow({
      where: { ownerId: owner.userId },
    });
    await as(admin, ctx.post(`${ADMIN}/businesses/${legacy.id}/transfer`))
      .send({ ownerEmail: owner.email, reason: 'Owner has a business account now' })
      .expect(400); // still runs a business
    await as(admin, ctx.delete(`${ADMIN}/businesses/${empty.id}`)).expect(204);
    await as(admin, ctx.delete(`${ADMIN}/businesses/${mess.businessId}`)).expect(409);

    await as(admin, ctx.post(`${ADMIN}/businesses/${legacy.id}/transfer`))
      .send({ ownerEmail: moderator.email, reason: 'x' })
      .expect(400); // staff (and student) accounts never own businesses
    const moved = successOf(
      adminBusinessDetailSchema,
      await as(admin, ctx.post(`${ADMIN}/businesses/${legacy.id}/transfer`))
        .send({ ownerEmail: owner.email, reason: 'Owner has a business account now' })
        .expect(200),
    ).data;
    expect(moved.owner.id).toBe(owner.userId);
    const after = successOf(
      z.array(ownershipIssueSchema),
      await as(admin, ctx.get(`${ADMIN}/businesses/ownership-check`)).expect(200),
    ).data;
    expect(after.some((issue) => issue.business.id === legacy.id)).toBe(false);

    // The new owner now manages it from their own dashboard.
    const { accessToken } = await login(ctx, owner);
    const dashboard = await ctx
      .get(`${API}/business/dashboard`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(JSON.stringify(dashboard.body)).toContain(legacy.slug);
  });

  it('shows the audit log, the dashboard series and business analytics', async () => {
    const log = successOf(
      z.array(auditEntrySchema),
      await as(
        admin,
        ctx.get(`${ADMIN}/audit-logs?action=BUSINESS_SUSPENDED&entityId=${mess.businessId}`),
      ).expect(200),
    ).data;
    expect(log[0]).toMatchObject({ action: 'BUSINESS_SUSPENDED', actor: { id: admin.userId } });

    const dashboard = successOf(
      adminDashboardSchema,
      await as(admin, ctx.get(`${ADMIN}/dashboard`)).expect(200),
    ).data;
    expect(dashboard.series).toHaveLength(30);
    expect(dashboard.totals.verifiedBusinesses).toBeGreaterThanOrEqual(1);
    expect(
      dashboard.series.reduce((sum, day) => sum + day.businessSignups, 0),
    ).toBeGreaterThanOrEqual(1);

    const analytics = successOf(
      adminBusinessAnalyticsSchema,
      await as(admin, ctx.get(`${ADMIN}/business-analytics?days=7`)).expect(200),
    ).data;
    expect(analytics.daily).toHaveLength(7);
  });
});
