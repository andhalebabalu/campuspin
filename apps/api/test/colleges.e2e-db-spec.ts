import { randomUUID } from 'node:crypto';
import {
  MAX_COLLEGE_IMAGES,
  adminCollegeListItemSchema,
  adminCollegeSchema,
  collegeCardSchema,
  collegeDetailSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { distanceMeters } from '../src/common/geo/haversine.js';
import {
  type AuthTestContext,
  TEST_PLACE_SLUG_PREFIX,
  auditRowsFor,
  bearer,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';
import { makePlace } from './support/db.js';
import { destination } from './support/geo.js';

const API = '/api/v1';
// Far from the seeded demo colleges (Ahilyanagar, 19.09 N 74.75 E), so test data never interacts with them.
const BASE = { latitude: 19.5, longitude: 75.5 };
const run = randomUUID().slice(0, 6);
let sequence = 0;
const uniqueName = (label = 'College'): string => `E2E ${run} ${label} ${(sequence += 1)}`;
let spotCount = 0;
/**
 * A location no other test uses (20 km from every other), so the places one test creates can never
 * be linked to a college created by another (a college links every place within its radius).
 */
const freshSpot = () => destination(BASE, 90, 20_000 * (spotCount += 1));
/** The point `meters` from `origin` along `bearing`. */
const around = (origin: { latitude: number; longitude: number }, bearing: number, meters: number) =>
  destination(origin, bearing, meters);

const listOf = <T extends z.ZodType>(item: T) => z.array(item);

describe('Colleges (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let admin: { userId: string; token: string };
  let superAdmin: { token: string };
  let moderator: { token: string };
  let student: { token: string };
  let demoLinksBefore: number;

  async function persona(label: string, role?: string) {
    const account = await registerAndVerify(ctx, { label });
    if (role) await grantRole(ctx.db, account.userId, role);
    const { accessToken } = await login(ctx, account);
    return { userId: account.userId, token: accessToken };
  }

  const asAdmin = <T extends { set: (name: string, value: string) => T }>(req: T): T =>
    req.set('Authorization', bearer(admin.token));

  async function createCollege(overrides: Record<string, unknown> = {}) {
    const response = await asAdmin(ctx.post(`${API}/admin/colleges`)).send({
      name: uniqueName(),
      address: 'Test Road, Testville',
      city: 'Testville',
      state: 'Maharashtra',
      ...BASE,
      ...overrides,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(adminCollegeSchema, response).data;
  }

  const makeTestPlace = (
    at: { latitude: number; longitude: number },
    status: 'ACTIVE' | 'PENDING' = 'ACTIVE',
  ) =>
    makePlace(ctx.db, admin.userId, {
      slug: `${TEST_PLACE_SLUG_PREFIX}${randomUUID().slice(0, 8)}`,
      name: `E2E ${run} place`,
      status,
      ...at,
    });

  const linksOf = (collegeId: string) =>
    ctx.db.collegePlace.findMany({ where: { collegeId }, orderBy: { distanceMeters: 'asc' } });
  const auditOf = (collegeId: string) =>
    ctx.db.auditLog.findMany({
      where: { entityType: 'College', entityId: collegeId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    admin = await persona('collegeadmin', 'ADMIN');
    superAdmin = await persona('collegesuper', 'SUPER_ADMIN');
    moderator = await persona('collegemod', 'MODERATOR');
    student = await persona('collegestudent');
    demoLinksBefore = await ctx.db.collegePlace.count({ where: { college: { isDemo: true } } });
  });

  afterAll(async () => {
    // The Phase 2 demo data must be exactly as it was.
    expect(await ctx.db.collegePlace.count({ where: { college: { isDemo: true } } })).toBe(
      demoLinksBefore,
    );
    await ctx.close();
  });

  // ── Who may do what ──────────────────────────────────────────────────────────────────────────

  describe('access control', () => {
    const id = randomUUID();
    const routes: Array<[string, string, object | undefined]> = [
      ['get', '/admin/colleges', undefined],
      ['post', '/admin/colleges', {}],
      ['get', `/admin/colleges/${id}`, undefined],
      ['patch', `/admin/colleges/${id}`, { city: 'X' }],
      ['post', `/admin/colleges/${id}/activate`, {}],
      ['post', `/admin/colleges/${id}/deactivate`, {}],
      ['post', `/admin/colleges/${id}/verify`, {}],
      ['post', `/admin/colleges/${id}/unverify`, {}],
      ['post', `/admin/colleges/${id}/images`, {}],
      ['patch', `/admin/colleges/${id}/images/${randomUUID()}`, {}],
      ['delete', `/admin/colleges/${id}/images/${randomUUID()}`, undefined],
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
      '%s %s answers 403 to a student and to a moderator (colleges.manage is admin-only)',
      async (method, path, body) => {
        for (const token of [student.token, moderator.token]) {
          const response = await send(method, path, body, token);
          expect(response.status).toBe(403);
          expect(errorOf(response).error.code).toBe('FORBIDDEN');
        }
      },
    );

    it('lets ADMIN and SUPER_ADMIN in (the routes answer their own 404 for an unknown id, not 401/403)', async () => {
      for (const token of [admin.token, superAdmin.token]) {
        expect((await send('get', `/admin/colleges/${id}`, undefined, token)).status).toBe(404);
        expect((await send('get', '/admin/colleges', undefined, token)).status).toBe(200);
      }
    });
  });

  // ── Creating ─────────────────────────────────────────────────────────────────────────────────

  describe('POST /admin/colleges', () => {
    it('creates a DRAFT with a generated slug, records who made it, and audits it', async () => {
      const name = uniqueName('Fresh Campus');
      const response = await asAdmin(ctx.post(`${API}/admin/colleges`))
        .send({
          name,
          address: 'Test Road',
          city: 'Testville',
          state: 'Maharashtra',
          ...BASE,
          shortName: 'FC',
        })
        .expect(201);

      const college = successOf(adminCollegeSchema, response);
      expect(college.message).toBe('College created');
      expect(college.data).toMatchObject({
        name,
        slug: expect.stringMatching(/^e2e-[a-z0-9]{6}-fresh-campus-\d+$/) as string,
        status: 'DRAFT',
        verificationStatus: 'PENDING',
        verified: false,
        isDemo: false,
        country: 'India',
        serviceRadiusMeters: 5000,
        createdById: admin.userId,
        placeCount: 0,
        images: [],
      });
      expect(response.headers['cache-control']).toBe('no-store');

      const row = await ctx.db.college.findUniqueOrThrow({ where: { id: college.data.id } });
      expect(row.createdById).toBe(admin.userId);

      const [audit] = await auditRowsFor(ctx.db, response);
      expect(audit).toMatchObject({
        action: 'COLLEGE_CREATED',
        actorId: admin.userId,
        entityType: 'College',
        entityId: college.data.id,
        metadata: { status: 'DRAFT', slug: college.data.slug, placesLinked: 0 },
      });
    });

    it('can be published straight away, and then appears in the public directory', async () => {
      const college = await createCollege({ status: 'ACTIVE' });
      expect(college.status).toBe('ACTIVE');
      await ctx.get(`${API}/colleges/${college.slug}`).expect(200);
    });

    it('links the places already within its radius, and counts only ACTIVE ones', async () => {
      const here = freshSpot();
      const near = await makeTestPlace(around(here, 0, 200));
      const alsoNear = await makeTestPlace(around(here, 90, 400));
      const pending = await makeTestPlace(around(here, 180, 300), 'PENDING');
      await makeTestPlace(around(here, 0, 5000)); // out of range

      const college = await createCollege({ ...here, serviceRadiusMeters: 1000 });

      const links = await linksOf(college.id);
      expect(links.map((link) => link.placeId).sort()).toEqual(
        [near.id, alsoNear.id, pending.id].sort(),
      );
      expect(links.every((link) => link.mode === 'AUTO')).toBe(true);
      expect(college.placeCount).toBe(2); // the pending place is linked but not on offer yet
      const [audit] = await auditOf(college.id);
      expect(audit?.metadata).toMatchObject({ placesLinked: 3 });
    });

    it('conflicts on the same name in the same city (case-insensitive), but allows it in another city', async () => {
      const name = uniqueName('Twin');
      await createCollege({ name, city: 'Testville' });

      const duplicate = await asAdmin(ctx.post(`${API}/admin/colleges`))
        .send({ name: name.toUpperCase(), address: 'x', city: 'testville', state: 'MH', ...BASE })
        .expect(409);
      expect(errorOf(duplicate).error.code).toBe('CONFLICT');
      expect(errorOf(duplicate).message).toMatch(/already exists/);

      const elsewhere = await createCollege({ name, city: 'Otherville' });
      expect(elsewhere.slug).toMatch(/-2$/); // same slug root, so it gets the next free number
    });

    it('rejects a slug that is already taken, and lets exactly one of two simultaneous requests win it', async () => {
      const slug = `e2e-${run}-claimed`;
      await createCollege({ slug });
      const taken = await asAdmin(ctx.post(`${API}/admin/colleges`))
        .send({ name: uniqueName(), address: 'x', city: 'Testville', state: 'MH', ...BASE, slug })
        .expect(409);
      expect(errorOf(taken).message).toMatch(/slug/i);

      const contested = `e2e-${run}-contested`;
      const attempt = () =>
        asAdmin(ctx.post(`${API}/admin/colleges`)).send({
          name: uniqueName(),
          address: 'x',
          city: 'Testville',
          state: 'MH',
          ...BASE,
          slug: contested,
        });
      const statuses = (await Promise.all([attempt(), attempt()]))
        .map((response) => response.status)
        .sort();
      expect(statuses).toEqual([201, 409]);
      expect(await ctx.db.college.count({ where: { slug: contested } })).toBe(1);
    });

    it.each([
      ['a missing required field', { address: undefined }, 'address'],
      ['latitude above 90', { latitude: 90.5 }, 'latitude'],
      ['coordinates 0, 0', { latitude: 0, longitude: 0 }, 'latitude'],
      ['a radius below the minimum', { serviceRadiusMeters: 99 }, 'serviceRadiusMeters'],
      ['markup in the name', { name: '<script>alert(1)</script>' }, 'name'],
      ['a javascript: website', { website: 'javascript:alert(1)' }, 'website'],
      ['credentials in a link', { logoUrl: 'https://user:pw@cdn.example.edu/l.png' }, 'logoUrl'],
      ['a reserved slug', { slug: 'popular' }, 'slug'],
      ['an id-shaped slug', { slug: '01a0babd-b2d2-725f-9c0f-ddbc81685942' }, 'slug'],
    ])('answers 400 VALIDATION_ERROR for %s', async (_label, override, field) => {
      const response = await asAdmin(ctx.post(`${API}/admin/colleges`)).send({
        name: uniqueName(),
        address: 'Test Road',
        city: 'Testville',
        state: 'Maharashtra',
        ...BASE,
        ...override,
      });
      expect(response.status).toBe(400);
      const body = errorOf(response);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys((body.error.details as { fields: object }).fields)).toContain(field);
    });

    it.each([
      ['isDemo', true],
      ['verificationStatus', 'VERIFIED'],
      ['createdById', randomUUID()],
      ['id', randomUUID()],
      ['status', 'INACTIVE'],
    ])('refuses to let the client set %s', async (field, value) => {
      const response = await asAdmin(ctx.post(`${API}/admin/colleges`)).send({
        name: uniqueName(),
        address: 'x',
        city: 'Testville',
        state: 'MH',
        ...BASE,
        [field]: value,
      });
      expect(response.status).toBe(400);
      expect(
        await ctx.db.college.count({ where: { name: { startsWith: `E2E ${run}` }, isDemo: true } }),
      ).toBe(0);
    });

    it('answers 400 for malformed JSON and an empty body, not a server error', async () => {
      const malformed = await asAdmin(ctx.post(`${API}/admin/colleges`))
        .set('Content-Type', 'application/json')
        .send('{ "name": ');
      expect(malformed.status).toBe(400);
      expect((await asAdmin(ctx.post(`${API}/admin/colleges`)).send({})).status).toBe(400);
    });
  });

  // ── Reading (admin) ──────────────────────────────────────────────────────────────────────────

  describe('GET /admin/colleges', () => {
    it('returns any college by id, with every field and its images', async () => {
      const created = await createCollege({
        description: 'Line one\nLine two',
        website: 'https://college.example.edu',
      });
      const response = await asAdmin(ctx.get(`${API}/admin/colleges/${created.id}`)).expect(200);
      expect(successOf(adminCollegeSchema, response).data).toEqual(created);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('answers 404 for an unknown id and 400 for something that is not an id', async () => {
      expect((await asAdmin(ctx.get(`${API}/admin/colleges/${randomUUID()}`))).status).toBe(404);
      const bad = await asAdmin(ctx.get(`${API}/admin/colleges/not-an-id`));
      expect(bad.status).toBe(400);
      expect(errorOf(bad).error.code).toBe('VALIDATION_ERROR');
    });

    it('lists every status, filters by status and verification, and pages', async () => {
      const token = randomUUID().slice(0, 6);
      const draft = await createCollege({ name: `E2E ${run} ${token} draft` });
      const active = await createCollege({ name: `E2E ${run} ${token} active`, status: 'ACTIVE' });
      await asAdmin(ctx.post(`${API}/admin/colleges/${active.id}/verify`))
        .send({})
        .expect(200);

      const all = await asAdmin(ctx.get(`${API}/admin/colleges`)).query({ q: token });
      const body = successOf(listOf(adminCollegeListItemSchema), all);
      expect(body.data.map((item) => item.id).sort()).toEqual([draft.id, active.id].sort());
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
      expect(body.data.every((item) => !('images' in item))).toBe(true);

      const drafts = await asAdmin(ctx.get(`${API}/admin/colleges`)).query({
        q: token,
        status: 'DRAFT',
      });
      expect(
        successOf(listOf(adminCollegeListItemSchema), drafts).data.map((item) => item.id),
      ).toEqual([draft.id]);
      const verified = await asAdmin(ctx.get(`${API}/admin/colleges`)).query({
        q: token,
        verification: 'VERIFIED',
      });
      expect(
        successOf(listOf(adminCollegeListItemSchema), verified).data.map((item) => item.id),
      ).toEqual([active.id]);

      const paged = await asAdmin(ctx.get(`${API}/admin/colleges`)).query({
        q: token,
        limit: 1,
        page: 2,
        sort: 'name',
      });
      expect(successOf(listOf(adminCollegeListItemSchema), paged).meta).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('rejects an unknown status or sort', async () => {
      expect(
        (await asAdmin(ctx.get(`${API}/admin/colleges`)).query({ status: 'DELETED' })).status,
      ).toBe(400);
      expect(
        (await asAdmin(ctx.get(`${API}/admin/colleges`)).query({ sort: 'random' })).status,
      ).toBe(400);
    });
  });

  // ── The public directory ─────────────────────────────────────────────────────────────────────

  describe('public directory', () => {
    const token = randomUUID().slice(0, 6);
    let zeta: Awaited<ReturnType<typeof createCollege>>;
    let alpha: Awaited<ReturnType<typeof createCollege>>;
    let mid: Awaited<ReturnType<typeof createCollege>>;
    let draft: Awaited<ReturnType<typeof createCollege>>;
    let hidden: Awaited<ReturnType<typeof createCollege>>;
    const origin = freshSpot();
    // A point 2.5 km east of Zeta: Alpha (3 km east of Zeta) is nearest, then Zeta, then Mid.
    const from = around(origin, 90, 2500);

    beforeAll(async () => {
      // Places first, so each college links them the moment it is created.
      await makeTestPlace(around(origin, 0, 200));
      await makeTestPlace(around(origin, 0, 300));
      await makeTestPlace(around(around(origin, 90, 3000), 0, 250));
      await makeTestPlace(around(around(origin, 90, 6000), 0, 100), 'PENDING');

      const at = (meters: number) => around(origin, 90, meters);
      const make = (label: string, meters: number, extra: Record<string, unknown> = {}) =>
        createCollege({
          name: `E2E ${run} ${token} ${label}`,
          ...at(meters),
          serviceRadiusMeters: 1000,
          city: `Pub${token}`,
          ...extra,
        });
      zeta = await make('Zeta', 0, { status: 'ACTIVE', shortName: `Zz${token}` });
      alpha = await make('Alpha', 3000, { status: 'ACTIVE' });
      mid = await make('Mid', 6000, { status: 'ACTIVE' });
      draft = await make('Draft', 9000);
      hidden = await make('Hidden', 12_000, { status: 'ACTIVE' });
      await asAdmin(ctx.post(`${API}/admin/colleges/${hidden.id}/deactivate`))
        .send({})
        .expect(200);
      await asAdmin(ctx.post(`${API}/admin/colleges/${alpha.id}/verify`))
        .send({})
        .expect(200);
    });

    const list = (query: Record<string, string | number> = {}) =>
      ctx.get(`${API}/colleges`).query({ q: token, ...query });
    const namesOf = (response: import('supertest').Response) =>
      successOf(listOf(collegeCardSchema), response).data.map((card) =>
        card.name.split(' ').slice(3).join(' '),
      );

    it('lists only ACTIVE colleges (never a draft or a deactivated one), as cards', async () => {
      const response = await list().expect(200);
      const body = successOf(listOf(collegeCardSchema), response);
      expect(body.message).toBe('Colleges retrieved');
      expect(body.data.map((card) => card.id).sort()).toEqual([zeta.id, alpha.id, mid.id].sort());
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
      expect(JSON.stringify(body.data)).not.toMatch(/status|isDemo|createdById|verificationStatus/);
    });

    it('needs no account, and ignores a bad token instead of failing', async () => {
      await list().expect(200);
      await list().set('Authorization', 'Bearer not-a-real-token').expect(200);
    });

    it('shows verified, the number of ACTIVE places, and no distance without a point', async () => {
      const cards = successOf(listOf(collegeCardSchema), await list()).data;
      const byName = new Map(
        cards.map((card) => [card.name.split(' ').pop() ?? '', card] as const),
      );
      expect(byName.get('Zeta')).toMatchObject({
        verified: false,
        placeCount: 2,
        distanceMeters: null,
      });
      expect(byName.get('Alpha')).toMatchObject({
        verified: true,
        placeCount: 1,
        distanceMeters: null,
      });
      expect(byName.get('Mid')).toMatchObject({ placeCount: 0 }); // its only nearby place is still PENDING
    });

    it.each([
      ['name', ['Alpha', 'Mid', 'Zeta']],
      ['newest', ['Mid', 'Alpha', 'Zeta']],
      ['popular', ['Zeta', 'Alpha', 'Mid']],
    ])('sort=%s orders %j', async (sort, expected) => {
      expect(namesOf(await list({ sort }).expect(200))).toEqual(expected);
    });

    it("sort=nearest orders by distance and reports each college's distance", async () => {
      const response = await list({
        sort: 'nearest',
        lat: from.latitude,
        lng: from.longitude,
      }).expect(200);
      const cards = successOf(listOf(collegeCardSchema), response).data;

      expect(cards.map((card) => card.name.split(' ').pop())).toEqual(['Alpha', 'Zeta', 'Mid']);
      for (const card of cards) {
        const college = [zeta, alpha, mid].find((candidate) => candidate.id === card.id);
        expect(card.distanceMeters).toBe(
          Math.round(distanceMeters(from, college as { latitude: number; longitude: number })),
        );
      }
      expect(cards.map((card) => card.distanceMeters)).toEqual(
        [...cards.map((card) => card.distanceMeters)].sort((a, b) => (a ?? 0) - (b ?? 0)),
      );
    });

    it('gives a distance for the other sorts too when a point is sent', async () => {
      const cards = successOf(
        listOf(collegeCardSchema),
        await list({ sort: 'name', lat: from.latitude, lng: from.longitude }),
      ).data;
      expect(cards.every((card) => typeof card.distanceMeters === 'number')).toBe(true);
    });

    it('pages without repeating or skipping a college', async () => {
      const first = successOf(
        listOf(collegeCardSchema),
        await list({ limit: 2, page: 1 }).expect(200),
      );
      const second = successOf(
        listOf(collegeCardSchema),
        await list({ limit: 2, page: 2 }).expect(200),
      );
      const beyond = successOf(
        listOf(collegeCardSchema),
        await list({ limit: 2, page: 3 }).expect(200),
      );

      expect(first.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(1);
      expect([...first.data, ...second.data].map((card) => card.id).sort()).toEqual(
        [zeta.id, alpha.id, mid.id].sort(),
      );
      expect(beyond.data).toEqual([]);
      expect(beyond.meta?.total).toBe(3);
    });

    it('pages the in-memory sorts (nearest, popular) the same way', async () => {
      for (const sort of ['popular', 'nearest'] as const) {
        const query = {
          sort,
          ...(sort === 'nearest' ? { lat: from.latitude, lng: from.longitude } : {}),
        };
        const one = successOf(
          listOf(collegeCardSchema),
          await list({ ...query, limit: 1, page: 1 }),
        ).data;
        const two = successOf(
          listOf(collegeCardSchema),
          await list({ ...query, limit: 1, page: 2 }),
        ).data;
        const all = successOf(listOf(collegeCardSchema), await list(query)).data;
        expect([one[0]?.id, two[0]?.id]).toEqual([all[0]?.id, all[1]?.id]);
      }
    });

    it('searches the name, the short name and the city, ignoring case', async () => {
      const search = async (q: string) =>
        successOf(
          listOf(collegeCardSchema),
          await ctx.get(`${API}/colleges`).query({ q }),
        ).data.map((card) => card.id);
      expect(await search(`${token} ZETA`)).toEqual([zeta.id]); // a substring, any letter case
      expect(await search(`${token} zeta`)).toEqual([zeta.id]);
      expect(await search(`zz${token}`.toUpperCase())).toEqual([zeta.id]); // short name
      expect((await search(`Pub${token}`.toLowerCase())).sort()).toEqual(
        [zeta.id, alpha.id, mid.id].sort(),
      ); // city
      expect(await search(`no-such-college-${randomUUID()}`)).toEqual([]);
    });

    it('filters by city exactly', async () => {
      const exact = successOf(
        listOf(collegeCardSchema),
        await ctx.get(`${API}/colleges`).query({ city: `pub${token}` }),
      ).data;
      expect(exact).toHaveLength(3);
      expect(
        successOf(
          listOf(collegeCardSchema),
          await ctx.get(`${API}/colleges`).query({ city: `Pub${token}x` }),
        ).data,
      ).toEqual([]);
    });

    it('treats search text as text, not as a pattern or a query', async () => {
      // A wildcard must not match everything; an injection attempt is just an unmatched string.
      for (const q of ['%', '_', '%%%', "' OR 1=1 --", '"; DROP TABLE colleges; --', '\\']) {
        const response = await ctx.get(`${API}/colleges`).query({ q });
        expect(response.status, q).toBe(200);
        expect(successOf(listOf(collegeCardSchema), response).data, q).toEqual([]);
      }
      expect(await ctx.db.college.count()).toBeGreaterThan(0); // and nothing was dropped
    });

    it('still finds a real name that contains a wildcard character, by that literal character', async () => {
      const marker = randomUUID().slice(0, 6);
      const percent = await createCollege({
        name: `E2E ${run} ${marker} 100% Pure`,
        status: 'ACTIVE',
      });
      const under = await createCollege({
        name: `E2E ${run} ${marker} snake_case`,
        status: 'ACTIVE',
      });
      const plain = await createCollege({ name: `E2E ${run} ${marker} Plain`, status: 'ACTIVE' });
      const find = async (q: string) =>
        successOf(
          listOf(collegeCardSchema),
          await ctx.get(`${API}/colleges`).query({ q }),
        ).data.map((card) => card.id);

      expect(await find(`${marker} 100%`)).toEqual([percent.id]);
      expect(await find(`${marker} snake_`)).toEqual([under.id]);
      // `_` is never "any one character": like all punctuation it just separates words, so
      // "marker_plain" is the two words "marker plain".
      expect(await find(`${marker}_plain`)).toEqual([plain.id]);
      expect(await find(`${marker} plain`)).toEqual([plain.id]);
    });

    it('forgives: words in any order, the address, and a small typo', async () => {
      const marker = randomUUID().slice(0, 6);
      const target = await createCollege({
        name: `E2E ${run} ${marker} Quillfeather Institute of Technology`,
        address: `Plot 7, Zandovar Nagar ${marker}, Testville`,
        status: 'ACTIVE',
      });
      const other = await createCollege({
        name: `E2E ${run} ${marker} Plain College`,
        status: 'ACTIVE',
      });
      const find = async (q: string) =>
        successOf(
          listOf(collegeCardSchema),
          await ctx.get(`${API}/colleges`).query({ q }),
        ).data.map((card) => card.id);

      expect(await find(`technology quillfeather ${marker}`)).toEqual([target.id]); // any order
      expect(await find(`zandovar ${marker}`)).toEqual([target.id]); // the address
      expect(await find(`quilfeather ${marker}`)).toEqual([target.id]); // a typo
      // Best match first: the college whose name has every word ranks above a partial one.
      expect((await find(`${marker} plain college`))[0]).toBe(other.id);
    });

    it.each([
      ['limit above 50', { limit: 51 }],
      ['limit 0', { limit: 0 }],
      ['page 0', { page: 0 }],
      ['a fractional page', { page: 1.5 }],
      ['an unknown sort', { sort: 'random' }],
      ['a sort injection', { sort: 'name; DROP TABLE colleges' }],
      ['lat without lng', { lat: 19 }],
      ['nearest without a point', { sort: 'nearest' }],
      ['latitude out of range', { lat: 95, lng: 74 }],
      ['null island', { lat: 0, lng: 0 }],
      ['non-numeric coordinates', { lat: 'north', lng: 'east' }],
      ['very long search text', { q: 'x'.repeat(101) }],
    ])('answers 400 for %s', async (_label, query) => {
      const response = await ctx.get(`${API}/colleges`).query(query);
      expect(response.status).toBe(400);
      expect(errorOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('is cacheable by a shared cache and supports conditional requests', async () => {
      const first = await list().expect(200);
      expect(first.headers['cache-control']).toBe(
        'public, s-maxage=60, stale-while-revalidate=300',
      );
      const etag = first.headers.etag as string;
      expect(etag).toBeTruthy();
      await list().set('If-None-Match', etag).expect(304);
    });

    it("never lets an error be cached, even though the route's successful answers are", async () => {
      const bad = await list({ limit: 999 });
      expect(bad.status).toBe(400);
      expect(bad.headers['cache-control']).toBe('no-store');
      const missing = await ctx.get(`${API}/colleges/e2e-${run}-nothing-here`);
      expect(missing.status).toBe(404);
      expect(missing.headers['cache-control']).toBe('no-store');
    });

    describe('one college', () => {
      it('is found by slug or by id, whatever the letter case, with its images and place count', async () => {
        await asAdmin(ctx.post(`${API}/admin/colleges/${zeta.id}/images`))
          .send({ imageUrl: 'https://cdn.example.edu/z2.jpg', sortOrder: 5 })
          .expect(201);
        await asAdmin(ctx.post(`${API}/admin/colleges/${zeta.id}/images`))
          .send({ imageUrl: 'https://cdn.example.edu/z1.jpg', altText: 'Gate', sortOrder: 1 })
          .expect(201);

        for (const key of [zeta.slug, zeta.slug.toUpperCase(), zeta.id, zeta.id.toUpperCase()]) {
          const response = await ctx.get(`${API}/colleges/${key}`).expect(200);
          const detail = successOf(collegeDetailSchema, response);
          expect(detail.message).toBe('College retrieved');
          expect(detail.data.id).toBe(zeta.id);
          expect(detail.data.placeCount).toBe(2);
          expect(detail.data.images.map((image) => image.imageUrl)).toEqual([
            'https://cdn.example.edu/z1.jpg',
            'https://cdn.example.edu/z2.jpg',
          ]);
          expect(response.headers['cache-control']).toBe(
            'public, s-maxage=60, stale-while-revalidate=300',
          );
        }
      });

      it('has no staff-only field', async () => {
        const detail = (await ctx.get(`${API}/colleges/${alpha.slug}`).expect(200)).body as {
          data: object;
        };
        for (const staffOnly of [
          'status',
          'verificationStatus',
          'isDemo',
          'createdById',
          'createdAt',
          'updatedAt',
        ]) {
          expect(detail.data).not.toHaveProperty(staffOnly);
        }
      });

      it('answers 404 for a draft, a deactivated college and one that never existed alike', async () => {
        const responses = [
          await ctx.get(`${API}/colleges/${draft.slug}`),
          await ctx.get(`${API}/colleges/${draft.id}`),
          await ctx.get(`${API}/colleges/${hidden.slug}`),
          await ctx.get(`${API}/colleges/e2e-${run}-never-existed`),
          await ctx.get(`${API}/colleges/${randomUUID()}`),
        ];
        for (const response of responses) {
          expect(response.status).toBe(404);
          expect(errorOf(response).error.code).toBe('NOT_FOUND');
        }
        expect(new Set(responses.map((response) => errorOf(response).message)).size).toBe(1);
      });

      it('treats an injection attempt in the path as an unknown slug', async () => {
        const response = await ctx.get(`${API}/colleges/${encodeURIComponent("' OR '1'='1")}`);
        expect(response.status).toBe(404);
      });
    });
  });

  // ── Editing ──────────────────────────────────────────────────────────────────────────────────

  describe('PATCH /admin/colleges/:id', () => {
    it('changes only what is sent, keeps the rest, and audits the changed field names', async () => {
      const college = await createCollege({
        description: 'Original',
        website: 'https://college.example.edu',
      });
      const response = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ description: 'Updated text', address: 'New Road' })
        .expect(200);

      const updated = successOf(adminCollegeSchema, response);
      expect(updated.message).toBe('College updated');
      expect(updated.data).toMatchObject({
        description: 'Updated text',
        address: 'New Road',
        name: college.name,
        website: 'https://college.example.edu',
        slug: college.slug,
      });
      expect(Date.parse(updated.data.updatedAt)).toBeGreaterThan(Date.parse(college.updatedAt));

      const [audit] = await auditRowsFor(ctx.db, response);
      expect(audit).toMatchObject({
        action: 'COLLEGE_UPDATED',
        actorId: admin.userId,
        entityId: college.id,
      });
      expect((audit?.metadata as { changedFields: string[] }).changedFields.sort()).toEqual([
        'address',
        'description',
      ]);
      // The audit trail names what changed, not the text itself.
      expect(JSON.stringify(audit?.metadata)).not.toMatch(/Updated text|New Road/);
    });

    it('is a harmless no-op when nothing actually changes: no write, no audit row', async () => {
      const college = await createCollege();
      const before = (await auditOf(college.id)).length;

      const response = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ name: college.name, city: college.city })
        .expect(200);

      expect(successOf(adminCollegeSchema, response).data.updatedAt).toBe(college.updatedAt);
      expect((await auditOf(college.id)).length).toBe(before);
    });

    it('clears optional fields with null, but refuses null for a required one', async () => {
      const college = await createCollege({
        shortName: 'ABC',
        description: 'text',
        website: 'https://college.example.edu',
        logoUrl: 'https://cdn.example.edu/l.png',
      });
      const cleared = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ shortName: null, description: null, website: null, logoUrl: null })
        .expect(200);
      expect(successOf(adminCollegeSchema, cleared).data).toMatchObject({
        shortName: null,
        description: null,
        website: null,
        logoUrl: null,
      });

      for (const field of ['name', 'address', 'city', 'latitude', 'serviceRadiusMeters']) {
        expect(
          (await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`)).send({ [field]: null }))
            .status,
          field,
        ).toBe(400);
      }
    });

    it.each([
      ['status', 'ACTIVE'],
      ['verificationStatus', 'VERIFIED'],
      ['isDemo', true],
      ['createdById', randomUUID()],
      ['id', randomUUID()],
    ])('refuses %s: it has its own endpoint or is not editable', async (field, value) => {
      const college = await createCollege();
      const response = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`)).send({
        [field]: value,
      });
      expect(response.status).toBe(400);
      const row = await ctx.db.college.findUniqueOrThrow({ where: { id: college.id } });
      expect(row.status).toBe('DRAFT');
      expect(row.isDemo).toBe(false);
      expect(row.verificationStatus).toBe('PENDING');
    });

    it('rejects an empty body, and answers 404 for an unknown college', async () => {
      const college = await createCollege();
      expect(
        (await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`)).send({})).status,
      ).toBe(400);
      expect(
        (await asAdmin(ctx.patch(`${API}/admin/colleges/${randomUUID()}`)).send({ city: 'X' }))
          .status,
      ).toBe(404);
    });

    it('lets the slug change while a DRAFT, but never once published', async () => {
      const college = await createCollege();
      const newSlug = `e2e-${run}-renamed-${sequence}`;
      const renamed = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ slug: newSlug })
        .expect(200);
      expect(successOf(adminCollegeSchema, renamed).data.slug).toBe(newSlug);

      await asAdmin(ctx.post(`${API}/admin/colleges/${college.id}/activate`))
        .send({})
        .expect(200);
      const blocked = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`)).send({
        slug: `${newSlug}-again`,
      });
      expect(blocked.status).toBe(409);
      expect(errorOf(blocked).message).toMatch(/published/);
      // Sending the slug it already has is fine.
      await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ slug: newSlug, description: 'ok' })
        .expect(200);
    });

    it('conflicts when the new slug or the new name+city belongs to another college', async () => {
      const first = await createCollege();
      const second = await createCollege();
      const takenSlug = await asAdmin(ctx.patch(`${API}/admin/colleges/${second.id}`)).send({
        slug: first.slug,
      });
      expect(takenSlug.status).toBe(409);
      const takenName = await asAdmin(ctx.patch(`${API}/admin/colleges/${second.id}`)).send({
        name: first.name.toLowerCase(),
      });
      expect(takenName.status).toBe(409);
      // Renaming to its own current name is not a conflict with itself.
      await asAdmin(ctx.patch(`${API}/admin/colleges/${second.id}`))
        .send({ name: second.name.toUpperCase() })
        .expect(200);
    });

    it('refuses a change that would leave the college at coordinates 0, 0', async () => {
      const college = await createCollege({ latitude: 0, longitude: 75.5 });
      const response = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`)).send({
        longitude: 0,
      });
      expect(response.status).toBe(400);
      expect(Object.keys((errorOf(response).error.details as { fields: object }).fields)).toContain(
        'latitude',
      );
    });

    describe('moving a college recomputes which places serve it', () => {
      it('unlinks places that fall out of range and links the ones that come into it', async () => {
        const here = freshSpot();
        const near = await makeTestPlace(around(here, 0, 300));
        const college = await createCollege({ ...here, serviceRadiusMeters: 1000 });
        expect((await linksOf(college.id)).map((link) => link.placeId)).toEqual([near.id]);

        // Move the college 5 km away: the place is now out of range.
        const target = around(here, 90, 5000);
        const response = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
          .send(target)
          .expect(200);
        expect(await linksOf(college.id)).toEqual([]);
        expect(successOf(adminCollegeSchema, response).data.placeCount).toBe(0);

        const [audit] = await auditRowsFor(ctx.db, response);
        expect(audit?.metadata).toMatchObject({
          changedFields: expect.arrayContaining(['latitude', 'longitude']) as string[],
          coordinates: {
            from: { latitude: here.latitude, longitude: here.longitude },
            to: target,
          },
          linksRemoved: 1,
          placesLinked: 0,
        });

        // ...and back again.
        await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
          .send(here)
          .expect(200);
        expect((await linksOf(college.id)).map((link) => link.placeId)).toEqual([near.id]);
      });

      it('follows a change of radius', async () => {
        const here = freshSpot();
        const place = await makeTestPlace(around(here, 0, 1500));
        const college = await createCollege({ ...here, serviceRadiusMeters: 1000 });
        expect(await linksOf(college.id)).toEqual([]);

        await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
          .send({ serviceRadiusMeters: 2000 })
          .expect(200);
        const [link] = await linksOf(college.id);
        expect(link).toMatchObject({ placeId: place.id, mode: 'AUTO' });
        expect(link?.distanceMeters).toBe(Math.round(distanceMeters(here, place)));

        await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
          .send({ serviceRadiusMeters: 1000 })
          .expect(200);
        expect(await linksOf(college.id)).toEqual([]);
      });

      it('does not touch the links when only unrelated fields change', async () => {
        const here = freshSpot();
        await makeTestPlace(around(here, 0, 300));
        const college = await createCollege({ ...here, serviceRadiusMeters: 1000 });
        const before = await linksOf(college.id);
        expect(before).toHaveLength(1);

        const response = await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
          .send({ description: 'no move' })
          .expect(200);

        expect(await linksOf(college.id)).toEqual(before); // same rows, same computedAt
        const [audit] = await auditRowsFor(ctx.db, response);
        expect(audit?.metadata).not.toHaveProperty('placesLinked');
      });

      it('keeps a staff decision (PINNED, EXCLUDED) however far the college moves', async () => {
        const here = freshSpot();
        const pinnedPlace = await makeTestPlace(around(here, 0, 8000));
        const hiddenPlace = await makeTestPlace(around(here, 90, 200));
        const college = await createCollege({ ...here, serviceRadiusMeters: 1000 });
        await ctx.db.collegePlace.create({
          data: {
            collegeId: college.id,
            placeId: pinnedPlace.id,
            mode: 'PINNED',
            distanceMeters: 1,
          },
        });
        await ctx.db.collegePlace.update({
          where: { collegeId_placeId: { collegeId: college.id, placeId: hiddenPlace.id } },
          data: { mode: 'EXCLUDED' },
        });

        const moved = around(here, 45, 300);
        await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
          .send(moved)
          .expect(200);

        const links = Object.fromEntries(
          (await linksOf(college.id)).map((link) => [link.placeId, link]),
        );
        expect(links[pinnedPlace.id]?.mode).toBe('PINNED');
        expect(links[hiddenPlace.id]?.mode).toBe('EXCLUDED');
        // Their distances are kept fresh even though their modes are staff decisions.
        expect(links[pinnedPlace.id]?.distanceMeters).toBe(
          Math.round(distanceMeters(moved, pinnedPlace)),
        );
        expect(links[hiddenPlace.id]?.distanceMeters).toBe(
          Math.round(distanceMeters(moved, hiddenPlace)),
        );
      });
    });
  });

  // ── Publishing and verification ──────────────────────────────────────────────────────────────

  describe('state changes', () => {
    const act = (id: string, action: string, body?: object) =>
      asAdmin(ctx.post(`${API}/admin/colleges/${id}/${action}`)).send(body ?? {});

    it('activate publishes a draft; the public sees it, and the audit row records from and to', async () => {
      const college = await createCollege();
      expect((await ctx.get(`${API}/colleges/${college.slug}`)).status).toBe(404);

      const response = await act(college.id, 'activate', { reason: 'Reviewed and ready' }).expect(
        200,
      );
      expect(successOf(adminCollegeSchema, response).data.status).toBe('ACTIVE');
      expect(successOf(adminCollegeSchema, response).message).toBe('College activated');
      await ctx.get(`${API}/colleges/${college.slug}`).expect(200);

      const [audit] = await auditRowsFor(ctx.db, response);
      expect(audit).toMatchObject({
        action: 'COLLEGE_ACTIVATED',
        actorId: admin.userId,
        metadata: { from: 'DRAFT', to: 'ACTIVE', reason: 'Reviewed and ready' },
      });
    });

    it('deactivate hides it from the public but keeps it for staff, and it can be reactivated', async () => {
      const college = await createCollege({ status: 'ACTIVE' });
      await act(college.id, 'deactivate', { reason: 'Merged into another campus' }).expect(200);

      expect((await ctx.get(`${API}/colleges/${college.slug}`)).status).toBe(404);
      const listed = successOf(
        listOf(collegeCardSchema),
        await ctx.get(`${API}/colleges`).query({ q: college.name }),
      );
      expect(listed.data).toEqual([]);
      const seenByStaff = await asAdmin(ctx.get(`${API}/admin/colleges/${college.id}`)).expect(200);
      expect(successOf(adminCollegeSchema, seenByStaff).data.status).toBe('INACTIVE');

      await act(college.id, 'activate').expect(200);
      await ctx.get(`${API}/colleges/${college.slug}`).expect(200);
      const actions = (await auditOf(college.id)).map((row) => row.action);
      expect(actions).toEqual(['COLLEGE_CREATED', 'COLLEGE_DEACTIVATED', 'COLLEGE_ACTIVATED']);
    });

    it('repeating an action is a harmless no-op with no extra audit row', async () => {
      const college = await createCollege();
      await act(college.id, 'activate').expect(200);
      await act(college.id, 'activate').expect(200);
      await act(college.id, 'deactivate').expect(200);
      await act(college.id, 'deactivate').expect(200);
      await act(college.id, 'verify').expect(200);
      await act(college.id, 'verify').expect(200);
      await act(college.id, 'unverify').expect(200);
      await act(college.id, 'unverify').expect(200);

      expect((await auditOf(college.id)).map((row) => row.action)).toEqual([
        'COLLEGE_CREATED',
        'COLLEGE_ACTIVATED',
        'COLLEGE_DEACTIVATED',
        'COLLEGE_VERIFIED',
        'COLLEGE_UNVERIFIED',
      ]);
    });

    it('will not deactivate a draft that was never published', async () => {
      const college = await createCollege();
      const response = await act(college.id, 'deactivate');
      expect(response.status).toBe(409);
      expect(errorOf(response).error.code).toBe('CONFLICT');
      expect(errorOf(response).message).toMatch(/never been published/);
      expect((await ctx.db.college.findUniqueOrThrow({ where: { id: college.id } })).status).toBe(
        'DRAFT',
      );
    });

    it('verify and unverify toggle the public verified mark', async () => {
      const college = await createCollege({ status: 'ACTIVE' });
      const publicVerified = async () =>
        successOf(collegeDetailSchema, await ctx.get(`${API}/colleges/${college.slug}`)).data
          .verified;

      expect(await publicVerified()).toBe(false);
      const verified = await act(college.id, 'verify', {
        reason: 'Checked with the registrar',
      }).expect(200);
      expect(successOf(adminCollegeSchema, verified).data).toMatchObject({
        verified: true,
        verificationStatus: 'VERIFIED',
      });
      expect(await publicVerified()).toBe(true);
      expect((await auditRowsFor(ctx.db, verified))[0]).toMatchObject({
        action: 'COLLEGE_VERIFIED',
        metadata: { from: 'PENDING', to: 'VERIFIED', reason: 'Checked with the registrar' },
      });

      await act(college.id, 'unverify').expect(200);
      expect(await publicVerified()).toBe(false);
    });

    it('answers 404 for an unknown college and 400 for a bad body', async () => {
      const college = await createCollege();
      expect((await act(randomUUID(), 'activate')).status).toBe(404);
      expect((await act(college.id, 'activate', { status: 'ACTIVE' })).status).toBe(400);
      expect((await act(college.id, 'activate', { reason: '<script>' })).status).toBe(400);
      expect((await act(college.id, 'activate', { reason: 'x'.repeat(501) })).status).toBe(400);
    });

    it('accepts the action with no body at all', async () => {
      const college = await createCollege();
      await asAdmin(ctx.post(`${API}/admin/colleges/${college.id}/activate`)).expect(200);
    });

    it('two simultaneous activations end in one change and one audit row', async () => {
      const college = await createCollege();
      const results = await Promise.all([act(college.id, 'activate'), act(college.id, 'activate')]);

      for (const result of results) expect([200, 409]).toContain(result.status);
      expect((await ctx.db.college.findUniqueOrThrow({ where: { id: college.id } })).status).toBe(
        'ACTIVE',
      );
      expect(
        (await auditOf(college.id)).filter((row) => row.action === 'COLLEGE_ACTIVATED'),
      ).toHaveLength(1);
    });
  });

  // ── Images ───────────────────────────────────────────────────────────────────────────────────

  describe('images', () => {
    const add = (id: string, body: object) =>
      asAdmin(ctx.post(`${API}/admin/colleges/${id}/images`)).send(body);

    it('adds images at the end by default, orders them by sortOrder, and audits each change', async () => {
      const college = await createCollege();
      const first = successOf(
        adminCollegeSchema,
        await add(college.id, {
          imageUrl: 'https://cdn.example.edu/1.jpg',
          altText: '  Main   gate ',
        }).expect(201),
      );
      const second = successOf(
        adminCollegeSchema,
        await add(college.id, { imageUrl: 'https://cdn.example.edu/2.jpg' }).expect(201),
      );
      const front = successOf(
        adminCollegeSchema,
        await add(college.id, { imageUrl: 'https://cdn.example.edu/0.jpg', sortOrder: 0 }).expect(
          201,
        ),
      );

      expect(first.message).toBe('Image added');
      expect(first.data.images[0]).toMatchObject({ altText: 'Main gate', sortOrder: 0 });
      expect(second.data.images.map((image) => image.sortOrder)).toEqual([0, 1]);
      // Two images share sortOrder 0: the older one stays ahead.
      expect(front.data.images.map((image) => image.imageUrl)).toEqual([
        'https://cdn.example.edu/1.jpg',
        'https://cdn.example.edu/0.jpg',
        'https://cdn.example.edu/2.jpg',
      ]);
      expect((await auditOf(college.id)).map((row) => row.action)).toEqual([
        'COLLEGE_CREATED',
        'COLLEGE_IMAGE_ADDED',
        'COLLEGE_IMAGE_ADDED',
        'COLLEGE_IMAGE_ADDED',
      ]);
    });

    it.each([
      ['a javascript: link', { imageUrl: 'javascript:alert(1)' }],
      ['a data: link', { imageUrl: 'data:image/png;base64,AAAA' }],
      ['no link', {}],
      ['a negative position', { imageUrl: 'https://cdn.example.edu/a.jpg', sortOrder: -1 }],
      [
        'markup in the alt text',
        { imageUrl: 'https://cdn.example.edu/a.jpg', altText: '<b>x</b>' },
      ],
      ['an unknown field', { imageUrl: 'https://cdn.example.edu/a.jpg', collegeId: randomUUID() }],
    ])('answers 400 for %s', async (_label, body) => {
      const college = await createCollege();
      expect((await add(college.id, body)).status).toBe(400);
      expect(await ctx.db.collegeImage.count({ where: { collegeId: college.id } })).toBe(0);
    });

    it(`allows at most ${MAX_COLLEGE_IMAGES} images per college`, async () => {
      const college = await createCollege();
      await ctx.db.collegeImage.createMany({
        data: Array.from({ length: MAX_COLLEGE_IMAGES }, (_, index) => ({
          collegeId: college.id,
          imageUrl: `https://cdn.example.edu/${index}.jpg`,
          sortOrder: index,
        })),
      });
      const response = await add(college.id, {
        imageUrl: 'https://cdn.example.edu/one-too-many.jpg',
      });
      expect(response.status).toBe(409);
      expect(errorOf(response).message).toMatch(/at most 20/);
    });

    it("changes an image's label and position (never its URL) and can remove it", async () => {
      const college = await createCollege();
      const withImage = successOf(
        adminCollegeSchema,
        await add(college.id, { imageUrl: 'https://cdn.example.edu/1.jpg' }).expect(201),
      ).data;
      const imageId = withImage.images[0]?.id ?? '';

      const changed = await asAdmin(
        ctx.patch(`${API}/admin/colleges/${college.id}/images/${imageId}`),
      )
        .send({ altText: 'Library', sortOrder: 9 })
        .expect(200);
      expect(successOf(adminCollegeSchema, changed).data.images[0]).toMatchObject({
        altText: 'Library',
        sortOrder: 9,
        imageUrl: 'https://cdn.example.edu/1.jpg',
      });
      expect(
        (
          await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}/images/${imageId}`)).send({
            imageUrl: 'https://evil.example/x.jpg',
          })
        ).status,
      ).toBe(400);
      expect(
        (await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}/images/${imageId}`)).send({}))
          .status,
      ).toBe(400);

      const removed = await asAdmin(
        ctx.delete(`${API}/admin/colleges/${college.id}/images/${imageId}`),
      ).expect(200);
      expect(successOf(adminCollegeSchema, removed).data.images).toEqual([]);
      expect(successOf(adminCollegeSchema, removed).message).toBe('Image removed');
      expect((await auditOf(college.id)).map((row) => row.action)).toEqual([
        'COLLEGE_CREATED',
        'COLLEGE_IMAGE_ADDED',
        'COLLEGE_IMAGE_UPDATED',
        'COLLEGE_IMAGE_REMOVED',
      ]);
    });

    it("cannot reach another college's image through this college's URL", async () => {
      const mine = await createCollege();
      const theirs = await createCollege();
      const theirImage =
        successOf(
          adminCollegeSchema,
          await add(theirs.id, { imageUrl: 'https://cdn.example.edu/theirs.jpg' }).expect(201),
        ).data.images[0]?.id ?? '';

      expect(
        (
          await asAdmin(ctx.patch(`${API}/admin/colleges/${mine.id}/images/${theirImage}`)).send({
            altText: 'hijack',
          })
        ).status,
      ).toBe(404);
      expect(
        (await asAdmin(ctx.delete(`${API}/admin/colleges/${mine.id}/images/${theirImage}`))).status,
      ).toBe(404);
      expect(await ctx.db.collegeImage.count({ where: { id: theirImage } })).toBe(1);
      expect(
        (await ctx.db.collegeImage.findUniqueOrThrow({ where: { id: theirImage } })).altText,
      ).toBeNull();
    });

    it('answers 404 for an unknown college or image', async () => {
      const college = await createCollege();
      expect((await add(randomUUID(), { imageUrl: 'https://cdn.example.edu/a.jpg' })).status).toBe(
        404,
      );
      expect(
        (await asAdmin(ctx.delete(`${API}/admin/colleges/${college.id}/images/${randomUUID()}`)))
          .status,
      ).toBe(404);
    });
  });

  // ── Across the board ─────────────────────────────────────────────────────────────────────────

  describe('audit trail', () => {
    it('records who did what, from where, and never a secret or the changed text', async () => {
      const college = await createCollege({
        description: 'Sensitive description text',
        website: 'https://college.example.edu',
      });
      await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ description: 'Another private paragraph' })
        .expect(200);
      await asAdmin(ctx.post(`${API}/admin/colleges/${college.id}/images`))
        .send({ imageUrl: 'https://cdn.example.edu/secret-path.jpg' })
        .expect(201);
      await asAdmin(ctx.post(`${API}/admin/colleges/${college.id}/verify`))
        .send({})
        .expect(200);

      const rows = await auditOf(college.id);
      expect(rows.map((row) => row.action)).toEqual([
        'COLLEGE_CREATED',
        'COLLEGE_UPDATED',
        'COLLEGE_IMAGE_ADDED',
        'COLLEGE_VERIFIED',
      ]);
      for (const row of rows) {
        expect(row).toMatchObject({
          actorId: admin.userId,
          entityType: 'College',
          entityId: college.id,
        });
        expect(row.ipAddress).toBeTruthy();
        expect(row.userAgent).toBeTruthy();
        expect(row.requestId).toMatch(/^e2eauth-/);
      }
      const dump = JSON.stringify(rows.map((row) => row.metadata));
      expect(dump).not.toMatch(
        /Sensitive description|private paragraph|secret-path|college\.example\.edu|Bearer|argon2/,
      );
    });

    it('a failed request writes no audit row', async () => {
      const college = await createCollege();
      const before = (await auditOf(college.id)).length;
      await asAdmin(ctx.patch(`${API}/admin/colleges/${college.id}`))
        .send({ name: '<b>bad</b>' })
        .expect(400);
      await asAdmin(ctx.post(`${API}/admin/colleges/${college.id}/deactivate`))
        .send({})
        .expect(409);
      expect((await auditOf(college.id)).length).toBe(before);
    });
  });

  describe('cache headers on real responses', () => {
    it('keeps private responses out of shared caches, and lets the public directory be cached', async () => {
      const account = await registerAndVerify(ctx, { label: 'cachecheck' });
      const signedIn = await ctx
        .post(`${API}/auth/login`)
        .send({ email: account.email, password: account.password })
        .expect(200);
      expect(signedIn.headers['cache-control']).toBe('no-store'); // the tokens travel here
      const token = (signedIn.body as { data: { accessToken: string } }).data.accessToken;

      const me = await ctx.get(`${API}/auth/me`).set('Authorization', bearer(token)).expect(200);
      expect(me.headers['cache-control']).toBe('no-store');
      const staff = await asAdmin(ctx.get(`${API}/admin/colleges`)).expect(200);
      expect(staff.headers['cache-control']).toBe('no-store');

      const directory = await ctx.get(`${API}/colleges`).expect(200);
      expect(directory.headers['cache-control']).toBe(
        'public, s-maxage=60, stale-while-revalidate=300',
      );
      expect((await ctx.get(`${API}/health`).expect(200)).headers['cache-control']).toBeUndefined();
    });
  });

  describe('the demo data from Phase 2', () => {
    it('is still public, still linked, and untouched by all of the above', async () => {
      const demo = await ctx.db.college.findMany({
        where: { isDemo: true },
        select: { slug: true, status: true },
      });
      for (const college of demo.filter((row) => row.status === 'ACTIVE')) {
        await ctx.get(`${API}/colleges/${college.slug}`).expect(200);
      }
      expect(await ctx.db.collegePlace.count({ where: { college: { isDemo: true } } })).toBe(
        demoLinksBefore,
      );
    });
  });
});
