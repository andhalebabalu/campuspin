import {
  adminMemberCreditsSchema,
  listingLimitSettingsSchema,
  listingQuotaSchema,
  listingSchema,
} from '@platform/contracts';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import {
  type Persona,
  as,
  makeCollege,
  persona,
  verifyStudent,
} from './support/student-fixtures.js';

const API = '/api/v1';
const SETTINGS_KEY = 'marketplace.listingLimits';

/**
 * Marketplace listing limits and credits against the real database. The limits are one global
 * setting, so the suite saves the real value first and puts it back afterwards.
 */
describe('Marketplace listing limits and credits (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let superAdmin: Persona;
  let admin: Persona;
  let seller: Persona;
  let saved: { value: unknown } | null;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    saved = await ctx.db.platformSetting.findUnique({
      where: { key: SETTINGS_KEY },
      select: { value: true },
    });
    superAdmin = await persona(ctx, 'credits-superadmin', { role: 'SUPER_ADMIN' });
    admin = await persona(ctx, 'credits-admin', { role: 'ADMIN' });
    seller = await persona(ctx, 'credits-seller', { name: 'Rahul Awasthi' });
    const college = await makeCollege(ctx, superAdmin, 'Credits');
    await verifyStudent(ctx, seller, college);
  });

  afterAll(async () => {
    if (ctx) {
      if (saved) {
        await ctx.db.platformSetting.update({
          where: { key: SETTINGS_KEY },
          data: { value: saved.value as object },
        });
      } else {
        await ctx.db.platformSetting.deleteMany({ where: { key: SETTINGS_KEY } });
      }
      await ctx.close();
    }
  });

  const setLimits = async (body: Record<string, unknown>) => {
    const response = await as(superAdmin, ctx.patch(`${API}/admin/settings/listing-limits`)).send(
      body,
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return successOf(listingLimitSettingsSchema, response).data;
  };

  const quota = async () =>
    successOf(listingQuotaSchema, await as(seller, ctx.get(`${API}/me/listing-quota`)).expect(200))
      .data;

  const list = (title: string) =>
    as(seller, ctx.post(`${API}/marketplace/listings`)).send({
      title,
      description: 'Good condition.',
      category: 'BOOKS',
      condition: 'GOOD',
      price: 100,
    });

  it('is free for everyone while limits are off', async () => {
    await setLimits({ enabled: false });
    const response = await list('Free while off');
    expect(response.status).toBe(201);
    expect((await quota()).next).toBe('FREE');
    // Clear the slate for the counted tests below.
    await as(
      seller,
      ctx.delete(`${API}/marketplace/listings/${successOf(listingSchema, response).data.id}`),
    ).expect(200);
  });

  it('only the super admin changes the limits', async () => {
    const response = await as(admin, ctx.patch(`${API}/admin/settings/listing-limits`)).send({
      enabled: true,
    });
    expect(response.status).toBe(403);
    expect((await as(seller, ctx.get(`${API}/admin/settings/listing-limits`))).status).toBe(403);
  });

  it('uses free listings first, then credits, then refuses with 402', async () => {
    await setLimits({
      enabled: true,
      mode: 'ACTIVE',
      freeListings: 1,
      startingCredits: 0,
      creditsPerListing: 2,
    });
    expect(await quota()).toMatchObject({ enabled: true, freeUsed: 0, credits: 0, next: 'FREE' });

    expect((await list('First, free')).status).toBe(201);
    expect(await quota()).toMatchObject({ freeUsed: 1, next: 'BLOCKED' });

    const blocked = await list('Second, blocked');
    expect(blocked.status).toBe(402);
    expect(errorOf(blocked).error.code).toBe('LISTING_LIMIT_REACHED');

    const granted = await as(
      superAdmin,
      ctx.post(`${API}/admin/users/${seller.userId}/listing-credits`),
    )
      .send({ amount: 3, note: 'Welcome bonus' })
      .expect(201);
    expect(successOf(adminMemberCreditsSchema, granted).data.credits).toBe(3);
    expect((await quota()).next).toBe('CREDITS');

    const paid = await list('Second, paid');
    expect(paid.status).toBe(201);
    expect(await quota()).toMatchObject({ credits: 1, next: 'BLOCKED' });

    const history = successOf(
      adminMemberCreditsSchema,
      await as(superAdmin, ctx.get(`${API}/admin/users/${seller.userId}/listing-credits`)).expect(
        200,
      ),
    ).data.history;
    expect(history.map((entry) => [entry.reason, entry.amount])).toEqual([
      ['LISTING', -2],
      ['ADMIN_GRANT', 3],
    ]);
  });

  it('frees a slot when a free listing is sold (live-count mode)', async () => {
    const mine = await ctx.db.marketplaceListing.findFirstOrThrow({
      where: { sellerId: seller.userId, creditsSpent: 0, status: 'ACTIVE' },
    });
    await as(seller, ctx.post(`${API}/marketplace/listings/${mine.id}/actions`))
      .send({ action: 'sold' })
      .expect(200);
    expect((await quota()).next).toBe('FREE');
  });

  it('starting credits apply to every student at once', async () => {
    await setLimits({ startingCredits: 10 });
    expect((await quota()).credits).toBe(11);
  });
});
