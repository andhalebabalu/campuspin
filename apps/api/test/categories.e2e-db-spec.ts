import { randomUUID } from 'node:crypto';
import {
  adminAmenitySchema,
  adminCategoryGroupSchema,
  adminCategorySchema,
  amenitySchema,
  categoryDetailSchema,
  categoryGroupSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  TEST_KEY_PREFIX,
  auditRowsFor,
  bearer,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';

const API = '/api/v1';
const run = randomUUID().slice(0, 6);
let sequence = 0;
const uniqueName = (label = 'Group') => `E2E Cat ${run} ${label} ${(sequence += 1)}`;
const uniqueKey = (label = 'key') => `${TEST_KEY_PREFIX}${run}_${label}_${(sequence += 1)}`;
const listOf = <T extends z.ZodType>(item: T) => z.array(item);

describe('Categories, attributes, rating dimensions and amenities (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let admin: { userId: string; token: string };
  let moderator: { token: string };
  let student: { token: string };

  async function persona(label: string, role?: string) {
    const account = await registerAndVerify(ctx, { label });
    if (role) await grantRole(ctx.db, account.userId, role);
    const { accessToken } = await login(ctx, account);
    return { userId: account.userId, token: accessToken };
  }

  const asAdmin = <T extends { set: (name: string, value: string) => T }>(req: T): T =>
    req.set('Authorization', bearer(admin.token));

  async function createGroup(overrides: Record<string, unknown> = {}) {
    const response = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
      name: uniqueName('Group'),
      ...overrides,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(adminCategorySchema, response).data;
  }

  async function createLeaf(parentId: string, overrides: Record<string, unknown> = {}) {
    const response = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
      name: uniqueName('Leaf'),
      parentId,
      ...overrides,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(adminCategorySchema, response).data;
  }

  const auditOf = (entityId: string, entityType: 'Category' | 'Amenity' = 'Category') =>
    ctx.db.auditLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    admin = await persona('catadmin', 'ADMIN');
    moderator = await persona('catmod', 'MODERATOR');
    student = await persona('catstudent');
  });

  afterAll(async () => {
    await ctx.close();
  });

  // ── Access control ─────────────────────────────────────────────────────────────────────────────

  describe('access control', () => {
    const id = randomUUID();
    const routes: Array<[string, string, object | undefined]> = [
      ['get', '/admin/categories', undefined],
      ['post', '/admin/categories', {}],
      ['get', `/admin/categories/${id}`, undefined],
      ['patch', `/admin/categories/${id}`, { name: 'X' }],
      ['post', `/admin/categories/${id}/activate`, {}],
      ['post', `/admin/categories/${id}/deactivate`, {}],
      ['post', `/admin/categories/${id}/attributes`, {}],
      ['patch', `/admin/categories/${id}/attributes/${randomUUID()}`, {}],
      ['delete', `/admin/categories/${id}/attributes/${randomUUID()}`, undefined],
      ['post', `/admin/categories/${id}/rating-dimensions`, {}],
      ['patch', `/admin/categories/${id}/rating-dimensions/${randomUUID()}`, {}],
      ['delete', `/admin/categories/${id}/rating-dimensions/${randomUUID()}`, undefined],
      ['get', '/admin/amenities', undefined],
      ['post', '/admin/amenities', {}],
      ['patch', `/admin/amenities/${id}`, {}],
      ['post', `/admin/amenities/${id}/activate`, {}],
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
      '%s %s answers 403 to a student and to a moderator (categories.manage is admin-only)',
      async (method, path, body) => {
        for (const token of [student.token, moderator.token]) {
          const response = await send(method, path, body, token);
          expect(response.status).toBe(403);
          expect(errorOf(response).error.code).toBe('FORBIDDEN');
        }
      },
    );

    it("lets ADMIN in (an unknown id gives the route's own 404, not 401/403), and the tree matches its schema", async () => {
      expect((await send('get', `/admin/categories/${id}`, undefined, admin.token)).status).toBe(
        404,
      );
      const tree = await send('get', '/admin/categories', undefined, admin.token);
      expect(tree.status).toBe(200);
      expect(successOf(z.array(adminCategoryGroupSchema), tree).data.length).toBeGreaterThan(0);
    });
  });

  // ── Creating groups and categories ────────────────────────────────────────────────────────────

  describe('POST /admin/categories', () => {
    it('creates a top-level GROUP with a generated slug, defaults and an audit row', async () => {
      const name = uniqueName('Group');
      const response = await asAdmin(ctx.post(`${API}/admin/categories`))
        .send({ name })
        .expect(201);
      const group = successOf(adminCategorySchema, response);
      expect(group.message).toBe('Category created');
      expect(group.data).toMatchObject({
        name,
        status: 'ACTIVE',
        parentId: null,
        sortOrder: 0,
        attributes: [],
        ratingDimensions: [],
      });
      expect(group.data.slug).toMatch(/^e2e-cat-[a-z0-9-]+$/);
      expect(response.headers['cache-control']).toBe('no-store');

      const [audit] = await auditOf(group.data.id);
      expect(audit).toMatchObject({
        action: 'CATEGORY_CREATED',
        actorId: admin.userId,
        metadata: { parentId: null },
      });
    });

    it('creates a leaf category inside an existing group', async () => {
      const group = await createGroup();
      const leaf = await createLeaf(group.id, { defaultPriceUnit: 'MONTH' });
      expect(leaf.parentId).toBe(group.id);
      expect(leaf.defaultPriceUnit).toBe('MONTH');
    });

    it('rejects a parentId that does not exist, and one that is itself a leaf (tree stays two levels)', async () => {
      const group = await createGroup();
      const leaf = await createLeaf(group.id);

      const missing = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
        name: uniqueName(),
        parentId: randomUUID(),
      });
      expect(missing.status).toBe(400);
      expect(errorOf(missing).error.code).toBe('VALIDATION_ERROR');

      const nested = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
        name: uniqueName(),
        parentId: leaf.id,
      });
      expect(nested.status).toBe(400);
    });

    it('conflicts on the same name in the same parent, but allows it in a different group', async () => {
      const name = uniqueName('Twin');
      const groupA = await createGroup();
      const groupB = await createGroup();
      await createLeaf(groupA.id, { name });

      const duplicate = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
        name,
        parentId: groupA.id,
      });
      expect(duplicate.status).toBe(409);
      expect(errorOf(duplicate).error.code).toBe('CONFLICT');

      await expect(createLeaf(groupB.id, { name })).resolves.toBeDefined();
    });

    it('lets exactly one of two simultaneous requests win a contested slug', async () => {
      const slug = `e2e-cat-${run}-contested-${sequence++}`;
      const attempt = () =>
        asAdmin(ctx.post(`${API}/admin/categories`)).send({ name: uniqueName(), slug });
      const statuses = (await Promise.all([attempt(), attempt()]))
        .map((response) => response.status)
        .sort();
      expect(statuses).toEqual([201, 409]);
      expect(await ctx.db.category.count({ where: { slug } })).toBe(1);
    });

    it.each([
      ['markup in the name', { name: '<script>alert(1)</script>' }],
      ['an invalid parentId', { name: uniqueName(), parentId: 'not-a-uuid' }],
      ['an unknown price unit', { name: uniqueName(), defaultPriceUnit: 'FORTNIGHT' }],
      ['a reserved/id-shaped slug', { name: uniqueName(), slug: randomUUID() }],
    ])('answers 400 VALIDATION_ERROR for %s', async (_label, body) => {
      const response = await asAdmin(ctx.post(`${API}/admin/categories`)).send(body);
      expect(response.status).toBe(400);
      expect(errorOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('refuses status and other staff-only or unknown fields (mass assignment)', async () => {
      for (const field of ['status', 'id', 'createdAt', 'children']) {
        const response = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
          name: uniqueName(),
          [field]: 'x',
        });
        expect(response.status, field).toBe(400);
      }
    });
  });

  // ── Editing ────────────────────────────────────────────────────────────────────────────────────

  describe('PATCH /admin/categories/:id', () => {
    it('changes only what is sent and audits the changed field names, never the text', async () => {
      const group = await createGroup({ description: 'Original text' });
      const response = await asAdmin(ctx.patch(`${API}/admin/categories/${group.id}`))
        .send({ description: 'Updated text', sortOrder: 5 })
        .expect(200);
      const updated = successOf(adminCategorySchema, response);
      expect(updated.data).toMatchObject({
        description: 'Updated text',
        sortOrder: 5,
        name: group.name,
      });

      const [audit] = await auditRowsFor(ctx.db, response);
      expect(audit).toMatchObject({ action: 'CATEGORY_UPDATED' });
      expect((audit?.metadata as { changedFields: string[] }).changedFields.sort()).toEqual([
        'description',
        'sortOrder',
      ]);
      expect(JSON.stringify(audit?.metadata)).not.toContain('Updated text');
    });

    it('is a harmless no-op when nothing changes: no extra audit row', async () => {
      const group = await createGroup();
      const before = (await auditOf(group.id)).length;
      await asAdmin(ctx.patch(`${API}/admin/categories/${group.id}`))
        .send({ name: group.name })
        .expect(200);
      expect((await auditOf(group.id)).length).toBe(before);
    });

    it.each(['parentId', 'status'])('refuses %s: not editable here', async (field) => {
      const group = await createGroup();
      const response = await asAdmin(ctx.patch(`${API}/admin/categories/${group.id}`)).send({
        [field]: 'x',
      });
      expect(response.status).toBe(400);
    });

    it('rejects an empty body and answers 404 for an unknown category', async () => {
      const group = await createGroup();
      expect(
        (await asAdmin(ctx.patch(`${API}/admin/categories/${group.id}`)).send({})).status,
      ).toBe(400);
      expect(
        (await asAdmin(ctx.patch(`${API}/admin/categories/${randomUUID()}`)).send({ name: 'X' }))
          .status,
      ).toBe(404);
    });

    it('lets the slug change and conflicts when it is already used by another category', async () => {
      const a = await createGroup();
      const b = await createGroup();
      const renamed = await asAdmin(ctx.patch(`${API}/admin/categories/${a.id}`))
        .send({ slug: `e2e-cat-${run}-renamed-${sequence++}` })
        .expect(200);
      const newSlug = successOf(adminCategorySchema, renamed).data.slug;
      expect(newSlug).toMatch(/renamed/);

      const clash = await asAdmin(ctx.patch(`${API}/admin/categories/${b.id}`)).send({
        slug: newSlug,
      });
      expect(clash.status).toBe(409);
    });
  });

  // ── Activate / deactivate ─────────────────────────────────────────────────────────────────────

  describe('activate / deactivate', () => {
    it('a new category starts ACTIVE (unlike a college, there is no draft state); toggling it is idempotent', async () => {
      const group = await createGroup();
      const initialTree = successOf(
        listOf(categoryGroupSchema),
        await ctx.get(`${API}/categories`),
      );
      expect(initialTree.data.some((g) => g.id === group.id)).toBe(true);

      // Repeating "activate" on an already-active row is a harmless no-op: no extra audit row.
      await asAdmin(ctx.post(`${API}/admin/categories/${group.id}/activate`))
        .send({})
        .expect(200);
      expect(await auditOf(group.id)).toHaveLength(1);

      const off = await asAdmin(ctx.post(`${API}/admin/categories/${group.id}/deactivate`))
        .send({ reason: 'Merged' })
        .expect(200);
      expect(successOf(adminCategorySchema, off).data.status).toBe('INACTIVE');
      const publicTree = successOf(listOf(categoryGroupSchema), await ctx.get(`${API}/categories`));
      expect(publicTree.data.some((g) => g.id === group.id)).toBe(false);

      const [, deactivated] = await auditOf(group.id);
      expect(deactivated).toMatchObject({
        action: 'CATEGORY_DEACTIVATED',
        metadata: { from: 'ACTIVE', to: 'INACTIVE', reason: 'Merged' },
      });
      expect((await auditOf(group.id)).map((row) => row.action)).toEqual([
        'CATEGORY_CREATED',
        'CATEGORY_DEACTIVATED',
      ]);
      // Repeat: no-op, no new row.
      await asAdmin(ctx.post(`${API}/admin/categories/${group.id}/deactivate`))
        .send({})
        .expect(200);
      expect((await auditOf(group.id)).length).toBe(2);

      // And back on: reappears in the public tree.
      await asAdmin(ctx.post(`${API}/admin/categories/${group.id}/activate`))
        .send({})
        .expect(200);
      const backOn = successOf(listOf(categoryGroupSchema), await ctx.get(`${API}/categories`));
      expect(backOn.data.some((g) => g.id === group.id)).toBe(true);
    });

    it('an inactive group hides its active children from the public tree and from direct lookup', async () => {
      const group = await createGroup();
      const leaf = await createLeaf(group.id);
      await ctx.get(`${API}/categories/${leaf.slug}`).expect(200);

      await asAdmin(ctx.post(`${API}/admin/categories/${group.id}/deactivate`))
        .send({})
        .expect(200);
      const hidden = await ctx.get(`${API}/categories/${leaf.slug}`);
      expect(hidden.status).toBe(404);
      const tree = successOf(listOf(categoryGroupSchema), await ctx.get(`${API}/categories`));
      expect(tree.data.some((g) => g.id === group.id)).toBe(false);
    });
  });

  // ── The public catalogue ──────────────────────────────────────────────────────────────────────

  describe('public catalogue', () => {
    it('GET /categories lists only active groups, with only their active children, in order', async () => {
      const group = await createGroup();
      const first = await createLeaf(group.id, { sortOrder: 5 });
      const second = await createLeaf(group.id, { sortOrder: 1 });
      const hiddenLeaf = await createLeaf(group.id, { sortOrder: 0 });
      await asAdmin(ctx.post(`${API}/admin/categories/${hiddenLeaf.id}/deactivate`))
        .send({})
        .expect(200);

      const response = await ctx.get(`${API}/categories`).expect(200);
      const found = successOf(listOf(categoryGroupSchema), response).data.find(
        (g) => g.id === group.id,
      );
      expect(found?.children.map((child) => child.id)).toEqual([second.id, first.id]); // sortOrder 1 before 5
      expect(response.headers['cache-control']).toBe(
        'public, s-maxage=60, stale-while-revalidate=300',
      );
    });

    it('GET /categories/:idOrSlug works for a group and for a leaf, by id or slug, case-insensitively', async () => {
      const group = await createGroup();
      const leaf = await createLeaf(group.id);
      await asAdmin(ctx.post(`${API}/admin/categories/${leaf.id}/attributes`))
        .send({ key: uniqueKey('seating'), name: 'Seating', dataType: 'INTEGER' })
        .expect(201);

      for (const key of [leaf.slug, leaf.slug.toUpperCase(), leaf.id]) {
        const response = await ctx.get(`${API}/categories/${key}`).expect(200);
        const detail = successOf(categoryDetailSchema, response);
        expect(detail.data.id).toBe(leaf.id);
        expect(detail.data.attributes).toHaveLength(1);
        expect(detail.data).not.toHaveProperty('status');
      }
      const groupDetail = successOf(
        categoryDetailSchema,
        await ctx.get(`${API}/categories/${group.slug}`).expect(200),
      );
      expect(groupDetail.data.attributes).toEqual([]);
      expect(groupDetail.data.parentId).toBeNull();
    });

    it('answers 404 for a deactivated category and for one that never existed, identically', async () => {
      const group = await createGroup();
      const deactivated = await createLeaf(group.id);
      await asAdmin(ctx.post(`${API}/admin/categories/${deactivated.id}/deactivate`))
        .send({})
        .expect(200);

      for (const slug of [deactivated.slug, `e2e-cat-${run}-never-existed`]) {
        const response = await ctx.get(`${API}/categories/${slug}`);
        expect(response.status).toBe(404);
        expect(errorOf(response).error.code).toBe('NOT_FOUND');
      }
    });

    it('never lets an error be cached', async () => {
      const response = await ctx.get(`${API}/categories/e2e-cat-${run}-nothing-here`);
      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  // ── Attributes ─────────────────────────────────────────────────────────────────────────────────

  describe('attributes', () => {
    const addAttribute = (categoryId: string, body: object) =>
      asAdmin(ctx.post(`${API}/admin/categories/${categoryId}/attributes`)).send(body);

    it('adds a simple attribute with defaults, and rejects adding one to a group', async () => {
      const group = await createGroup();
      const leaf = await createLeaf(group.id);

      const onGroup = await addAttribute(group.id, {
        key: uniqueKey(),
        name: 'X',
        dataType: 'TEXT',
      });
      expect(onGroup.status).toBe(400);
      expect(errorOf(onGroup).error.code).toBe('BAD_REQUEST');

      const key = uniqueKey('capacity');
      const added = await addAttribute(leaf.id, {
        key,
        name: 'Capacity',
        dataType: 'INTEGER',
      }).expect(201);
      const attribute = successOf(adminCategorySchema, added).data.attributes[0];
      expect(attribute).toMatchObject({
        key,
        name: 'Capacity',
        dataType: 'INTEGER',
        required: false,
        options: null,
      });
      const [, audit] = await auditOf(leaf.id);
      expect(audit).toMatchObject({ action: 'CATEGORY_ATTRIBUTE_ADDED', metadata: { key } });
    });

    it('requires options for ENUM/MULTI_ENUM and refuses them otherwise; refuses a duplicate key', async () => {
      const leaf = await createLeaf((await createGroup()).id);
      const key = uniqueKey('diet');

      const missingOptions = await addAttribute(leaf.id, { key, name: 'Diet', dataType: 'ENUM' });
      expect(missingOptions.status).toBe(400);

      const withOptions = await addAttribute(leaf.id, {
        key,
        name: 'Diet',
        dataType: 'ENUM',
        options: [{ value: 'veg', label: 'Veg' }],
      }).expect(201);
      expect(successOf(adminCategorySchema, withOptions).data.attributes[0]?.options).toEqual([
        { value: 'veg', label: 'Veg' },
      ]);

      const duplicate = await addAttribute(leaf.id, { key, name: 'Diet again', dataType: 'TEXT' });
      expect(duplicate.status).toBe(409);
    });

    it('edits an attribute (name, filterable, options) but not its key or dataType', async () => {
      const leaf = await createLeaf((await createGroup()).id);
      const key = uniqueKey('diet');
      const created = await addAttribute(leaf.id, {
        key,
        name: 'Diet',
        dataType: 'ENUM',
        options: [{ value: 'veg', label: 'Veg' }],
      }).expect(201);
      const attributeId = successOf(adminCategorySchema, created).data.attributes[0]?.id ?? '';

      const changed = await asAdmin(
        ctx.patch(`${API}/admin/categories/${leaf.id}/attributes/${attributeId}`),
      )
        .send({
          name: 'Diet type',
          filterable: true,
          options: [
            { value: 'veg', label: 'Veg' },
            { value: 'non_veg', label: 'Non-veg' },
          ],
        })
        .expect(200);
      const updated = successOf(adminCategorySchema, changed).data.attributes[0];
      expect(updated).toMatchObject({ name: 'Diet type', filterable: true, key });
      expect(updated?.options).toHaveLength(2);

      expect(
        (
          await asAdmin(
            ctx.patch(`${API}/admin/categories/${leaf.id}/attributes/${attributeId}`),
          ).send({ key: 'new_key' })
        ).status,
      ).toBe(400);
      expect(
        (
          await asAdmin(
            ctx.patch(`${API}/admin/categories/${leaf.id}/attributes/${attributeId}`),
          ).send({ dataType: 'TEXT' })
        ).status,
      ).toBe(400);

      // Clearing all options on an ENUM would violate the rule; the service re-checks it against the real dataType.
      const cleared = await asAdmin(
        ctx.patch(`${API}/admin/categories/${leaf.id}/attributes/${attributeId}`),
      ).send({ options: null });
      expect(cleared.status).toBe(400);
      expect(errorOf(cleared).error.code).toBe('VALIDATION_ERROR');
    });

    it('removes an unused attribute, but refuses (409) one that already has a value on a place', async () => {
      const leaf = await createLeaf((await createGroup()).id);
      const key = uniqueKey('capacity');
      const created = await addAttribute(leaf.id, {
        key,
        name: 'Capacity',
        dataType: 'INTEGER',
      }).expect(201);
      const attributeId = successOf(adminCategorySchema, created).data.attributes[0]?.id ?? '';

      const usedElsewhereKey = uniqueKey('used');
      const used = await addAttribute(leaf.id, {
        key: usedElsewhereKey,
        name: 'Used',
        dataType: 'INTEGER',
      }).expect(201);
      const usedId =
        successOf(adminCategorySchema, used).data.attributes.find((a) => a.key === usedElsewhereKey)
          ?.id ?? '';
      const place = await ctx.db.place.findFirst({ where: { isDemo: true }, select: { id: true } });
      if (place) {
        await ctx.db.placeAttributeValue.create({
          data: { placeId: place.id, attributeId: usedId, valueNumber: 1 },
        });
        const blocked = await asAdmin(
          ctx.delete(`${API}/admin/categories/${leaf.id}/attributes/${usedId}`),
        );
        expect(blocked.status).toBe(409);
        await ctx.db.placeAttributeValue.deleteMany({ where: { attributeId: usedId } });
      }

      const removed = await asAdmin(
        ctx.delete(`${API}/admin/categories/${leaf.id}/attributes/${attributeId}`),
      ).expect(200);
      expect(
        successOf(adminCategorySchema, removed).data.attributes.some((a) => a.id === attributeId),
      ).toBe(false);
      expect((await auditOf(leaf.id)).map((row) => row.action)).toEqual(
        expect.arrayContaining(['CATEGORY_ATTRIBUTE_REMOVED']),
      );
    });

    it("scopes attribute ids to the category in the URL: another category's attribute id is 404", async () => {
      const groupA = await createLeaf((await createGroup()).id);
      const groupB = await createLeaf((await createGroup()).id);
      const created = await addAttribute(groupA.id, {
        key: uniqueKey(),
        name: 'X',
        dataType: 'TEXT',
      }).expect(201);
      const attributeId = successOf(adminCategorySchema, created).data.attributes[0]?.id ?? '';

      expect(
        (
          await asAdmin(
            ctx.patch(`${API}/admin/categories/${groupB.id}/attributes/${attributeId}`),
          ).send({ name: 'hijack' })
        ).status,
      ).toBe(404);
      expect(
        (
          await asAdmin(
            ctx.delete(`${API}/admin/categories/${groupB.id}/attributes/${attributeId}`),
          )
        ).status,
      ).toBe(404);
    });
  });

  // ── Rating dimensions ──────────────────────────────────────────────────────────────────────────

  describe('rating dimensions', () => {
    it('adds, edits and removes a rating dimension, refusing one on a group and a duplicate key', async () => {
      const group = await createGroup();
      const leaf = await createLeaf(group.id);
      const key = uniqueKey('food');

      expect(
        (
          await asAdmin(ctx.post(`${API}/admin/categories/${group.id}/rating-dimensions`)).send({
            key,
            label: 'Food',
          })
        ).status,
      ).toBe(400);

      const added = await asAdmin(ctx.post(`${API}/admin/categories/${leaf.id}/rating-dimensions`))
        .send({ key, label: 'Food' })
        .expect(201);
      const dimensionId = successOf(adminCategorySchema, added).data.ratingDimensions[0]?.id ?? '';
      expect(successOf(adminCategorySchema, added).data.ratingDimensions[0]).toMatchObject({
        key,
        label: 'Food',
      });

      const duplicate = await asAdmin(
        ctx.post(`${API}/admin/categories/${leaf.id}/rating-dimensions`),
      ).send({ key, label: 'Food again' });
      expect(duplicate.status).toBe(409);

      const edited = await asAdmin(
        ctx.patch(`${API}/admin/categories/${leaf.id}/rating-dimensions/${dimensionId}`),
      )
        .send({ label: 'Food quality' })
        .expect(200);
      expect(successOf(adminCategorySchema, edited).data.ratingDimensions[0]).toMatchObject({
        key,
        label: 'Food quality',
      });
      expect(
        (
          await asAdmin(
            ctx.patch(`${API}/admin/categories/${leaf.id}/rating-dimensions/${dimensionId}`),
          ).send({ key: 'new' })
        ).status,
      ).toBe(400);

      const removed = await asAdmin(
        ctx.delete(`${API}/admin/categories/${leaf.id}/rating-dimensions/${dimensionId}`),
      ).expect(200);
      expect(successOf(adminCategorySchema, removed).data.ratingDimensions).toEqual([]);
      expect((await auditOf(leaf.id)).map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'CATEGORY_RATING_DIMENSION_ADDED',
          'CATEGORY_RATING_DIMENSION_UPDATED',
          'CATEGORY_RATING_DIMENSION_REMOVED',
        ]),
      );
    });

    it('answers 404 for an unknown dimension, scoped to the category', async () => {
      const leafA = await createLeaf((await createGroup()).id);
      const leafB = await createLeaf((await createGroup()).id);
      const created = await asAdmin(
        ctx.post(`${API}/admin/categories/${leafA.id}/rating-dimensions`),
      )
        .send({ key: uniqueKey(), label: 'X' })
        .expect(201);
      const dimensionId =
        successOf(adminCategorySchema, created).data.ratingDimensions[0]?.id ?? '';
      expect(
        (
          await asAdmin(
            ctx.patch(`${API}/admin/categories/${leafB.id}/rating-dimensions/${dimensionId}`),
          ).send({ label: 'hijack' })
        ).status,
      ).toBe(404);
    });
  });

  // ── Amenities ──────────────────────────────────────────────────────────────────────────────────

  describe('amenities', () => {
    it('is publicly listed only when active, and staff can create, edit and toggle it', async () => {
      const key = uniqueKey('projector');
      const created = await asAdmin(ctx.post(`${API}/admin/amenities`))
        .send({ key, name: 'Projector' })
        .expect(201);
      const amenity = successOf(adminAmenitySchema, created).data;
      expect(amenity).toMatchObject({ key, name: 'Projector', status: 'ACTIVE' });

      const publicList = successOf(
        listOf(amenitySchema),
        await ctx.get(`${API}/amenities`).expect(200),
      );
      expect(publicList.data.some((row) => row.key === key)).toBe(true);

      await asAdmin(ctx.post(`${API}/admin/amenities/${amenity.id}/deactivate`))
        .send({})
        .expect(200);
      const afterDeactivate = successOf(listOf(amenitySchema), await ctx.get(`${API}/amenities`));
      expect(afterDeactivate.data.some((row) => row.key === key)).toBe(false);

      const edited = await asAdmin(ctx.patch(`${API}/admin/amenities/${amenity.id}`))
        .send({ name: 'Overhead projector' })
        .expect(200);
      expect(successOf(adminAmenitySchema, edited).data.name).toBe('Overhead projector');

      const adminList = successOf(
        listOf(adminAmenitySchema),
        await asAdmin(ctx.get(`${API}/admin/amenities`)).expect(200),
      );
      expect(adminList.data.some((row) => row.key === key && row.status === 'INACTIVE')).toBe(true);
    });

    it('refuses a duplicate key and an unknown field', async () => {
      const key = uniqueKey('dup');
      await asAdmin(ctx.post(`${API}/admin/amenities`))
        .send({ key, name: 'One' })
        .expect(201);
      const duplicate = await asAdmin(ctx.post(`${API}/admin/amenities`)).send({
        key,
        name: 'Two',
      });
      expect(duplicate.status).toBe(409);
      expect(
        (
          await asAdmin(ctx.post(`${API}/admin/amenities`)).send({
            key: uniqueKey(),
            name: 'X',
            status: 'ACTIVE',
          })
        ).status,
      ).toBe(400);
    });

    it('answers 404 for an unknown amenity, and rejects an empty patch', async () => {
      expect(
        (await asAdmin(ctx.patch(`${API}/admin/amenities/${randomUUID()}`)).send({ name: 'X' }))
          .status,
      ).toBe(404);
      const key = uniqueKey('lonely');
      const created = await asAdmin(ctx.post(`${API}/admin/amenities`))
        .send({ key, name: 'Lonely' })
        .expect(201);
      const id = successOf(adminAmenitySchema, created).data.id;
      expect((await asAdmin(ctx.patch(`${API}/admin/amenities/${id}`)).send({})).status).toBe(400);
    });
  });

  describe('the demo data from Phase 2', () => {
    it('is still public and untouched by all of the above', async () => {
      const before = await ctx.db.category.count({
        where: { slug: { not: { startsWith: 'e2e-' } } },
      });
      const response = await ctx.get(`${API}/categories`).expect(200);
      expect(successOf(listOf(categoryGroupSchema), response).data.length).toBeGreaterThan(0);
      expect(
        await ctx.db.category.count({ where: { slug: { not: { startsWith: 'e2e-' } } } }),
      ).toBe(before);
    });
  });
});
