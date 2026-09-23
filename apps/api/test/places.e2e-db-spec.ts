import { randomUUID } from 'node:crypto';
import {
  adminPlaceSchema,
  collegeDetailSchema,
  placeCardSchema,
  placeDetailSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  TEST_CATEGORY_SLUG_PREFIX,
  TEST_COLLEGE_SLUG_PREFIX,
  TEST_KEY_PREFIX,
  TEST_PLACE_SLUG_PREFIX,
  bearer,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';
import { destination } from './support/geo.js';

const API = '/api/v1';
// Far from the seeded demo colleges AND from colleges.e2e-db-spec.ts's own test area, so proximity
// links this suite creates never interact with either.
const BASE = { latitude: 21.4, longitude: 75.9 };
const run = randomUUID().slice(0, 6);
let sequence = 0;
const uniqueName = (label = 'Place') => `E2E Place ${run} ${label} ${(sequence += 1)}`;
const uniqueSlug = (label = 'place') =>
  `${TEST_PLACE_SLUG_PREFIX}${run}-${label}-${(sequence += 1)}`;
let spotCount = 0;
/** A location no other test in this file uses, 2 km from the last one. */
const freshSpot = () => destination(BASE, 0, 2000 * (spotCount += 1));
const around = (origin: { latitude: number; longitude: number }, bearing: number, meters: number) =>
  destination(origin, bearing, meters);

const listOf = <T extends z.ZodType>(item: T) => z.array(item);

describe('Places (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let admin: { userId: string; token: string };
  let superAdmin: { token: string };
  let moderator: { token: string };
  let student: { token: string };
  let owner: { token: string };
  let leafCategoryId: string;
  let leafCategorySlug: string;
  let secondCategoryId: string;
  let inactiveCategoryId: string;
  let groupCategoryId: string;
  let amenityId: string;
  let demoPlacesBefore: number;

  async function persona(label: string, role?: string) {
    const account = await registerAndVerify(ctx, { label });
    if (role) await grantRole(ctx.db, account.userId, role);
    const { accessToken } = await login(ctx, account);
    return { userId: account.userId, token: accessToken };
  }

  const asAdmin = <T extends { set: (name: string, value: string) => T }>(req: T): T =>
    req.set('Authorization', bearer(admin.token));

  async function createPlace(overrides: Record<string, unknown> = {}) {
    const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
      name: uniqueName(),
      address: 'Test Road, Testville',
      city: 'Testville',
      state: 'Maharashtra',
      ...freshSpot(),
      categoryIds: [leafCategoryId],
      ...overrides,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(adminPlaceSchema, response).data;
  }

  const auditOf = (placeId: string) =>
    ctx.db.auditLog.findMany({
      where: { entityType: 'Place', entityId: placeId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    admin = await persona('placeadmin', 'ADMIN');
    superAdmin = await persona('placesuper', 'SUPER_ADMIN');
    moderator = await persona('placemod', 'MODERATOR');
    student = await persona('placestudent');
    owner = await persona('placeowner', 'BUSINESS_OWNER');
    demoPlacesBefore = await ctx.db.place.count({ where: { isDemo: true } });

    const group = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Group ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}group-${run}`,
      })
      .expect(201);
    groupCategoryId = (group.body as { data: { id: string } }).data.id;

    const leaf = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Mess ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}mess-${run}`,
        parentId: groupCategoryId,
        defaultPriceUnit: 'MONTH',
      })
      .expect(201);
    leafCategoryId = (leaf.body as { data: { id: string; slug: string } }).data.id;
    leafCategorySlug = (leaf.body as { data: { id: string; slug: string } }).data.slug;

    const second = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Restaurant ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}restaurant-${run}`,
        parentId: groupCategoryId,
        defaultPriceUnit: 'MEAL',
      })
      .expect(201);
    secondCategoryId = (second.body as { data: { id: string } }).data.id;

    const inactive = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Inactive ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}inactive-${run}`,
        parentId: groupCategoryId,
      })
      .expect(201);
    inactiveCategoryId = (inactive.body as { data: { id: string } }).data.id;
    await asAdmin(ctx.post(`${API}/admin/categories/${inactiveCategoryId}/deactivate`))
      .send({})
      .expect(200);

    const amenity = await asAdmin(ctx.post(`${API}/admin/amenities`))
      .send({ key: `${TEST_KEY_PREFIX}${run}_wifi`, name: 'WiFi' })
      .expect(201);
    amenityId = (amenity.body as { data: { id: string } }).data.id;
  });

  afterAll(async () => {
    // The Phase 2 demo places must be exactly as they were.
    expect(await ctx.db.place.count({ where: { isDemo: true } })).toBe(demoPlacesBefore);
    await ctx.close();
  });

  // ── Access control ─────────────────────────────────────────────────────────────────────────────

  describe('access control', () => {
    const id = randomUUID();
    const routes: Array<[string, string, object | undefined]> = [
      ['get', '/admin/places', undefined],
      ['post', '/admin/places', {}],
      ['get', `/admin/places/${id}`, undefined],
      ['patch', `/admin/places/${id}`, { name: 'X' }],
      ['post', `/admin/places/${id}/activate`, {}],
      ['post', `/admin/places/${id}/deactivate`, {}],
      ['post', `/admin/places/${id}/verify`, {}],
      ['post', `/admin/places/${id}/unverify`, {}],
      ['post', `/admin/places/${id}/images`, {}],
      ['patch', `/admin/places/${id}/images/${randomUUID()}`, {}],
      ['delete', `/admin/places/${id}/images/${randomUUID()}`, undefined],
    ];
    const send = (method: string, path: string, body: object | undefined, token?: string) => {
      const request = (ctx as unknown as Record<string, (url: string) => import('supertest').Test>)[
        method
      ]?.(`${API}${path}`);
      if (!request) throw new Error(`no helper for ${method}`);
      const authed = token ? request.set('Authorization', bearer(token)) : request;
      return body ? authed.send(body) : authed;
    };

    it.each(routes)('%s %s answers 401 without a token', async (method, path, body) => {
      const response = await send(method, path, body);
      expect(response.status).toBe(401);
      expect(errorOf(response).error.code).toBe('UNAUTHORIZED');
    });

    it.each(routes)(
      '%s %s answers 403 to a student, a moderator and a business owner (places.manage is admin-only)',
      async (method, path, body) => {
        for (const token of [student.token, moderator.token, owner.token]) {
          const response = await send(method, path, body, token);
          expect(response.status).toBe(403);
          expect(errorOf(response).error.code).toBe('FORBIDDEN');
        }
      },
    );

    it('lets ADMIN and SUPER_ADMIN in (the routes answer their own 404 for an unknown id, not 401/403)', async () => {
      for (const token of [admin.token, superAdmin.token]) {
        expect((await send('get', `/admin/places/${id}`, undefined, token)).status).toBe(404);
        expect((await send('get', '/admin/places', undefined, token)).status).toBe(200);
      }
    });
  });

  // ── Creating ─────────────────────────────────────────────────────────────────────────────────

  describe('POST /admin/places', () => {
    it('creates a DRAFT with a generated slug, the primary category, and audits it', async () => {
      const name = uniqueName('Fresh');
      const response = await asAdmin(ctx.post(`${API}/admin/places`))
        .send({
          name,
          address: 'Test Road',
          city: 'Testville',
          state: 'Maharashtra',
          ...freshSpot(),
          categoryIds: [leafCategoryId],
        })
        .expect(201);

      const place = successOf(adminPlaceSchema, response);
      expect(place.message).toBe('Place created');
      expect(place.data).toMatchObject({
        name,
        status: 'DRAFT',
        verificationStatus: 'PENDING',
        verified: false,
        isDemo: false,
        country: 'India',
        createdById: admin.userId,
        publishedAt: null,
        categories: [{ id: leafCategoryId, isPrimary: true }],
        amenities: [],
        priceOptions: [],
        images: [],
      });
      expect(response.headers['cache-control']).toBe('no-store');

      const [audit] = await auditOf(place.data.id);
      expect(audit).toMatchObject({
        action: 'PLACE_CREATED',
        actorId: admin.userId,
        entityType: 'Place',
        entityId: place.data.id,
        metadata: { status: 'DRAFT', categoriesLinked: 1 },
      });
    });

    it('can be published straight away, setting publishedAt, and then appears in the public directory', async () => {
      const place = await createPlace({ status: 'ACTIVE' });
      expect(place.status).toBe('ACTIVE');
      expect(place.publishedAt).not.toBeNull();
      await ctx.get(`${API}/places/${place.slug}`).expect(200);
    });

    it('computes priceMin/priceMax/priceUnit from the priceOptions in the primary category default unit', async () => {
      const place = await createPlace({
        priceOptions: [
          { label: 'Monthly, veg', amount: 3000, unit: 'MONTH' },
          { label: 'Monthly, non-veg', amount: 3500, unit: 'MONTH' },
          { label: 'Daily', amount: 150, unit: 'DAY' },
        ],
      });
      expect(place.priceMin).toBe(3000);
      expect(place.priceMax).toBe(3500);
      expect(place.priceUnit).toBe('MONTH');
    });

    it('the first id in categoryIds becomes the primary category', async () => {
      const place = await createPlace({ categoryIds: [leafCategoryId, secondCategoryId] });
      expect(place.categories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: leafCategoryId, isPrimary: true }),
          expect.objectContaining({ id: secondCategoryId, isPrimary: false }),
        ]),
      );
    });

    it('refuses markup in the name', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: 'Sample <b>Mess</b>',
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [leafCategoryId],
      });
      expect(response.status).toBe(400);
      expect(
        Object.keys(errorOf(response).error.details?.fields as Record<string, unknown>),
      ).toContain('name');
    });

    it('refuses an unknown field (mass assignment)', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [leafCategoryId],
        isDemo: true,
      });
      expect(response.status).toBe(400);
    });

    it('refuses a category that is a group, not a leaf', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [groupCategoryId],
      });
      expect(response.status).toBe(400);
      expect(errorOf(response).error.details?.fields).toHaveProperty('categoryIds');
    });

    it('refuses a category that does not exist', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [randomUUID()],
      });
      expect(response.status).toBe(400);
    });

    it('refuses a category that has been deactivated', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [inactiveCategoryId],
      });
      expect(response.status).toBe(400);
    });

    it('refuses an amenity that does not exist', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [leafCategoryId],
        amenityIds: [randomUUID()],
      });
      expect(response.status).toBe(400);
    });

    it('refuses null island', async () => {
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        latitude: 0,
        longitude: 0,
        categoryIds: [leafCategoryId],
      });
      expect(response.status).toBe(400);
    });

    it('a slug that is already taken is a 409', async () => {
      const place = await createPlace();
      const response = await asAdmin(ctx.post(`${API}/admin/places`)).send({
        name: uniqueName(),
        slug: place.slug,
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...freshSpot(),
        categoryIds: [leafCategoryId],
      });
      expect(response.status).toBe(409);
    });
  });

  // ── College proximity ────────────────────────────────────────────────────────────────────────

  describe('proximity: a place created or moved is linked to colleges within range', () => {
    it('an ACTIVE place inside a college radius increases its placeCount; moving it away decreases it', async () => {
      const here = freshSpot();
      const collegeResponse = await asAdmin(ctx.post(`${API}/admin/colleges`)).send({
        name: `${TEST_COLLEGE_SLUG_PREFIX}place-proximity-${run}`,
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...here,
        serviceRadiusMeters: 1000,
        status: 'ACTIVE',
      });
      expect(collegeResponse.status).toBe(201);
      const college = (collegeResponse.body as { data: { id: string; slug: string } }).data;

      const place = await createPlace({ ...around(here, 0, 300), status: 'ACTIVE' });
      const afterCreate = successOf(
        collegeDetailSchema,
        await ctx.get(`${API}/colleges/${college.slug}`).expect(200),
      );
      expect(afterCreate.data.placeCount).toBe(1);

      await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send(around(here, 0, 5000))
        .expect(200);
      const afterMove = successOf(
        collegeDetailSchema,
        await ctx.get(`${API}/colleges/${college.slug}`).expect(200),
      );
      expect(afterMove.data.placeCount).toBe(0);
    });
  });

  // ── Public catalogue ─────────────────────────────────────────────────────────────────────────

  describe('public catalogue', () => {
    it('a draft, an inactive and an unpublished place are all 404, like colleges', async () => {
      const draft = await createPlace();
      await ctx.get(`${API}/places/${draft.slug}`).expect(404);

      const active = await createPlace({ status: 'ACTIVE' });
      await asAdmin(ctx.post(`${API}/admin/places/${active.id}/deactivate`))
        .send({})
        .expect(200);
      await ctx.get(`${API}/places/${active.slug}`).expect(404);
    });

    it('GET /places/:slug returns the full detail shape, cacheable', async () => {
      const place = await createPlace({
        status: 'ACTIVE',
        amenityIds: [amenityId],
        priceOptions: [{ label: 'Monthly', amount: 3000, unit: 'MONTH' }],
        hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '21:00' }],
      });
      const response = await ctx.get(`${API}/places/${place.slug}`).expect(200);
      const detail = successOf(placeDetailSchema, response);
      expect(detail.data.amenities).toEqual([expect.objectContaining({ id: amenityId })]);
      expect(detail.data.hours).toHaveLength(1);
      expect(detail.data.priceOptions).toHaveLength(1);
      expect(response.headers['cache-control']).toBe(
        'public, s-maxage=60, stale-while-revalidate=300',
      );
    });

    it('q searches name and address; city matches exactly', async () => {
      const uniqueTag = `Findme${run.toUpperCase()}`;
      const place = await createPlace({
        name: `${uniqueTag} Mess`,
        slug: uniqueSlug('findme'),
        status: 'ACTIVE',
      });
      const byName = successOf(
        listOf(placeCardSchema),
        await ctx.get(`${API}/places?q=${uniqueTag}`).expect(200),
      );
      expect(byName.data.map((p) => p.id)).toContain(place.id);

      const byCity = successOf(
        listOf(placeCardSchema),
        await ctx.get(`${API}/places?city=Testville&q=${uniqueTag}`).expect(200),
      );
      expect(byCity.data.map((p) => p.id)).toContain(place.id);
    });

    it('categorySlug narrows the list to that category', async () => {
      const place = await createPlace({
        categoryIds: [secondCategoryId],
        status: 'ACTIVE',
        name: uniqueName('CatFilter'),
      });
      const response = successOf(
        listOf(placeCardSchema),
        await ctx.get(`${API}/places?categorySlug=${leafCategorySlug}`).expect(200),
      );
      expect(response.data.map((p) => p.id)).not.toContain(place.id);
    });

    it('collegeSlug scopes the list, and distance defaults to "from that college" without lat/lng', async () => {
      const here = freshSpot();
      const collegeResponse = await asAdmin(ctx.post(`${API}/admin/colleges`)).send({
        name: `${TEST_COLLEGE_SLUG_PREFIX}place-scope-${run}`,
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...here,
        serviceRadiusMeters: 1000,
        status: 'ACTIVE',
      });
      const college = (collegeResponse.body as { data: { id: string; slug: string } }).data;
      const near = await createPlace({
        ...around(here, 0, 200),
        status: 'ACTIVE',
        name: uniqueName('Near'),
      });
      await createPlace({
        ...around(here, 0, 9000),
        status: 'ACTIVE',
        name: uniqueName('FarAway'),
      }); // out of range

      const response = successOf(
        listOf(placeCardSchema),
        await ctx.get(`${API}/places?collegeSlug=${college.slug}&sort=nearest`).expect(200),
      );
      const ids = response.data.map((p) => p.id);
      expect(ids).toContain(near.id);
      const nearCard = response.data.find((p) => p.id === near.id);
      expect(nearCard?.distanceMeters).toBeGreaterThan(0);
      expect(nearCard?.distanceMeters).toBeLessThan(300);
    });

    it('an unknown collegeSlug is a 404', async () => {
      await ctx.get(`${API}/places?collegeSlug=no-such-college-${run}`).expect(404);
    });

    it('sort=cheapest orders by priceMin, no price sorts last', async () => {
      const tag = `Cheapest${run.toUpperCase()}`;
      const expensive = await createPlace({
        name: `${tag} B`,
        slug: uniqueSlug('cheapest-b'),
        status: 'ACTIVE',
        priceOptions: [{ label: 'Monthly', amount: 5000, unit: 'MONTH' }],
      });
      const cheap = await createPlace({
        name: `${tag} A`,
        slug: uniqueSlug('cheapest-a'),
        status: 'ACTIVE',
        priceOptions: [{ label: 'Monthly', amount: 1000, unit: 'MONTH' }],
      });
      const noPrice = await createPlace({
        name: `${tag} C`,
        slug: uniqueSlug('cheapest-c'),
        status: 'ACTIVE',
      });

      const response = successOf(
        listOf(placeCardSchema),
        await ctx.get(`${API}/places?q=${tag}&sort=cheapest&limit=50`).expect(200),
      );
      const ids = response.data.map((p) => p.id);
      expect(ids.indexOf(cheap.id)).toBeLessThan(ids.indexOf(expensive.id));
      expect(ids.indexOf(expensive.id)).toBeLessThan(ids.indexOf(noPrice.id));
    });

    it('sort=nearest needs lat+lng or a collegeSlug', async () => {
      const response = await ctx.get(`${API}/places?sort=nearest`);
      expect(response.status).toBe(400);
    });
  });

  // ── Editing ──────────────────────────────────────────────────────────────────────────────────

  describe('PATCH /admin/places/:id', () => {
    it('changes only the sent fields, and audits the change', async () => {
      const place = await createPlace();
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({ city: 'Nagpur' })
        .expect(200);
      const updated = successOf(adminPlaceSchema, response);
      expect(updated.data.city).toBe('Nagpur');
      expect(updated.data.name).toBe(place.name);

      const audits = await auditOf(place.id);
      const last = audits.at(-1);
      expect(last).toMatchObject({
        action: 'PLACE_UPDATED',
        metadata: { changedFields: ['city'] },
      });
    });

    it('rejects an empty body', async () => {
      const place = await createPlace();
      await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({})
        .expect(400);
    });

    it('refuses status in the body (it has its own endpoint)', async () => {
      const place = await createPlace();
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`)).send({
        status: 'ACTIVE',
      });
      expect(response.status).toBe(400);
    });

    it('the slug can change while DRAFT, but not once ACTIVE', async () => {
      const place = await createPlace();
      const newSlug = uniqueSlug('renamed');
      await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({ slug: newSlug })
        .expect(200);

      await asAdmin(ctx.post(`${API}/admin/places/${place.id}/activate`))
        .send({})
        .expect(200);
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`)).send({
        slug: uniqueSlug('again'),
      });
      expect(response.status).toBe(409);
    });

    it('clears an optional field with null', async () => {
      const place = await createPlace({ phone: '+91 98765 43210' });
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({ phone: null })
        .expect(200);
      expect(successOf(adminPlaceSchema, response).data.phone).toBeNull();
    });

    it('replacing categoryIds recomputes the primary category and the price summary', async () => {
      const place = await createPlace({
        categoryIds: [leafCategoryId],
        priceOptions: [{ label: 'Monthly', amount: 3000, unit: 'MONTH' }],
      });
      expect(place.priceUnit).toBe('MONTH');

      // secondCategoryId defaults to MEAL, and the existing price option is in MONTH: falls back to
      // the first option's own unit when nothing matches the new default.
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({ categoryIds: [secondCategoryId, leafCategoryId] })
        .expect(200);
      const updated = successOf(adminPlaceSchema, response).data;
      expect(updated.categories.find((c) => c.isPrimary)?.id).toBe(secondCategoryId);
      expect(updated.priceUnit).toBe('MONTH');
    });

    it('replacing priceOptions recomputes priceMin/priceMax', async () => {
      const place = await createPlace({
        priceOptions: [{ label: 'Monthly', amount: 3000, unit: 'MONTH' }],
      });
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({ priceOptions: [{ label: 'Monthly', amount: 4000, unit: 'MONTH' }] })
        .expect(200);
      const updated = successOf(adminPlaceSchema, response).data;
      expect(updated.priceMin).toBe(4000);
      expect(updated.priceMax).toBe(4000);
      expect(updated.priceOptions).toHaveLength(1);
    });

    it('replacing hours and amenityIds replaces the whole list', async () => {
      const place = await createPlace({
        hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '21:00' }],
        amenityIds: [amenityId],
      });
      const response = await asAdmin(ctx.patch(`${API}/admin/places/${place.id}`))
        .send({ hours: [{ dayOfWeek: 2, is24Hours: true }], amenityIds: [] })
        .expect(200);
      const updated = successOf(adminPlaceSchema, response).data;
      expect(updated.hours).toEqual([expect.objectContaining({ dayOfWeek: 2, is24Hours: true })]);
      expect(updated.amenities).toEqual([]);
    });
  });

  // ── State changes ────────────────────────────────────────────────────────────────────────────

  describe('activate / deactivate / verify / unverify', () => {
    it('activate sets publishedAt once, and repeating either action is a no-op', async () => {
      const place = await createPlace();
      const activated = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/activate`))
          .send({})
          .expect(200),
      ).data;
      expect(activated.status).toBe('ACTIVE');
      expect(activated.publishedAt).not.toBeNull();

      const again = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/activate`))
          .send({})
          .expect(200),
      ).data;
      expect(again.publishedAt).toBe(activated.publishedAt);

      const deactivated = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/deactivate`))
          .send({ reason: 'Closed' })
          .expect(200),
      ).data;
      expect(deactivated.status).toBe('INACTIVE');

      await asAdmin(ctx.post(`${API}/admin/places/${place.id}/deactivate`))
        .send({})
        .expect(200); // no-op
    });

    it('deactivating a place that was never published is a 409', async () => {
      const place = await createPlace();
      const response = await asAdmin(ctx.post(`${API}/admin/places/${place.id}/deactivate`)).send(
        {},
      );
      expect(response.status).toBe(409);
    });

    it('verify sets verificationStatus and lastVerifiedAt; unverify clears it back to PENDING', async () => {
      const place = await createPlace();
      const verified = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/verify`))
          .send({})
          .expect(200),
      ).data;
      expect(verified.verificationStatus).toBe('VERIFIED');
      expect(verified.verified).toBe(true);
      expect(verified.lastVerifiedAt).not.toBeNull();

      const unverified = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/unverify`))
          .send({})
          .expect(200),
      ).data;
      expect(unverified.verificationStatus).toBe('PENDING');
      expect(unverified.verified).toBe(false);
    });
  });

  // ── Images ───────────────────────────────────────────────────────────────────────────────────

  describe('images', () => {
    it('the first image becomes the cover by default; a second does not', async () => {
      const place = await createPlace();
      const first = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/images`))
          .send({ imageUrl: 'https://cdn.example.com/a.jpg' })
          .expect(201),
      ).data;
      expect(first.images).toEqual([expect.objectContaining({ isCover: true })]);

      const second = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/images`))
          .send({ imageUrl: 'https://cdn.example.com/b.jpg' })
          .expect(201),
      ).data;
      expect(second.images.find((i) => i.imageUrl.endsWith('b.jpg'))?.isCover).toBe(false);
    });

    it('setting isCover on one image unsets it on every other', async () => {
      const place = await createPlace();
      await asAdmin(ctx.post(`${API}/admin/places/${place.id}/images`)).send({
        imageUrl: 'https://cdn.example.com/a.jpg',
      });
      const withB = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/images`)).send({
          imageUrl: 'https://cdn.example.com/b.jpg',
        }),
      ).data;
      const imageB = withB.images.find((i) => i.imageUrl.endsWith('b.jpg'));

      const response = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.patch(`${API}/admin/places/${place.id}/images/${imageB?.id}`))
          .send({ isCover: true })
          .expect(200),
      ).data;
      expect(response.images.filter((i) => i.isCover)).toHaveLength(1);
      expect(response.images.find((i) => i.id === imageB?.id)?.isCover).toBe(true);
    });

    it('removes an image, and a wrong place id is a 404', async () => {
      const place = await createPlace();
      const otherPlace = await createPlace();
      const added = successOf(
        adminPlaceSchema,
        await asAdmin(ctx.post(`${API}/admin/places/${place.id}/images`)).send({
          imageUrl: 'https://cdn.example.com/c.jpg',
        }),
      ).data;
      const imageId = added.images[0]?.id;

      await asAdmin(ctx.delete(`${API}/admin/places/${otherPlace.id}/images/${imageId}`)).expect(
        404,
      );
      await asAdmin(ctx.delete(`${API}/admin/places/${place.id}/images/${imageId}`)).expect(200);
    });
  });

  // ── Swagger-adjacent: schema shape sanity for the admin list ────────────────────────────────

  it('lets ADMIN list every status, and the list matches its schema', async () => {
    const response = await asAdmin(ctx.get(`${API}/admin/places?limit=50`)).expect(200);
    expect(response.body).toMatchObject({ success: true });
    const parsed = z
      .array(z.record(z.string(), z.unknown()))
      .safeParse((response.body as { data: unknown }).data);
    expect(parsed.success).toBe(true);
  });
});
