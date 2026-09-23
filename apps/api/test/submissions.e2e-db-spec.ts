import { randomUUID } from 'node:crypto';
import { adminPlaceSchema, placeSubmissionSchema } from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  TEST_CATEGORY_SLUG_PREFIX,
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
// Far from every other e2e suite's test area, so proximity/duplicate-detection here never interacts
// with places another suite created.
const BASE = { latitude: 23.7, longitude: 79.2 };
const run = randomUUID().slice(0, 6);
let sequence = 0;
// Named so the slug it generates starts with `TEST_PLACE_SLUG_PREFIX` ("e2e-place-"): every place a
// submission creates is cleaned up by the shared `removeAuthTestData`, the same as an admin-created one.
const uniqueName = (label = 'Place') => `E2E Place Submission ${run} ${label} ${(sequence += 1)}`;
let spotCount = 0;
/** A location no other test in this file uses, 3 km from the last one. */
const freshSpot = () => destination(BASE, 0, 3000 * (spotCount += 1));

describe('Student submissions and duplicate detection (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let student: { userId: string; token: string };
  let otherStudent: { token: string };
  let moderator: { token: string };
  let admin: { token: string };
  let leafCategoryId: string;
  let otherGroupCategoryId: string;

  async function persona(label: string, role?: string) {
    const account = await registerAndVerify(ctx, { label });
    if (role) await grantRole(ctx.db, account.userId, role);
    const { accessToken } = await login(ctx, account);
    return { userId: account.userId, token: accessToken };
  }

  const asStudent = <T extends { set: (name: string, value: string) => T }>(req: T): T =>
    req.set('Authorization', bearer(student.token));
  const asModerator = <T extends { set: (name: string, value: string) => T }>(req: T): T =>
    req.set('Authorization', bearer(moderator.token));
  // Category and place management need `categories.manage`/`places.manage`, which MODERATOR does not
  // have; only fixture setup uses this, so the review tests below still exercise MODERATOR itself.
  const asAdmin = <T extends { set: (name: string, value: string) => T }>(req: T): T =>
    req.set('Authorization', bearer(admin.token));

  /** An ACTIVE place created directly by staff, to act as the "existing place" duplicates are checked against. */
  async function createActivePlace(overrides: Record<string, unknown> = {}) {
    const response = await asAdmin(ctx.post(`${API}/admin/places`))
      .send({
        name: uniqueName('Existing'),
        address: 'Campus Road, Testville',
        city: 'Testville',
        state: 'Madhya Pradesh',
        ...freshSpot(),
        categoryIds: [leafCategoryId],
        status: 'ACTIVE',
        ...overrides,
      })
      .expect(201);
    return successOf(adminPlaceSchema, response).data;
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    student = await persona('sub-student');
    otherStudent = await persona('sub-other-student');
    moderator = await persona('sub-moderator', 'MODERATOR');
    admin = await persona('sub-admin', 'ADMIN');

    const group = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Sub Group ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}sub-group-${run}`,
      })
      .expect(201);
    const leaf = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Sub Mess ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}sub-mess-${run}`,
        parentId: (group.body as { data: { id: string } }).data.id,
        defaultPriceUnit: 'MONTH',
      })
      .expect(201);
    leafCategoryId = (leaf.body as { data: { id: string } }).data.id;

    const otherGroup = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Sub Other Group ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}sub-other-group-${run}`,
      })
      .expect(201);
    const otherLeaf = await asAdmin(ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Sub Library ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}sub-library-${run}`,
        parentId: (otherGroup.body as { data: { id: string } }).data.id,
      })
      .expect(201);
    otherGroupCategoryId = (otherLeaf.body as { data: { id: string } }).data.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  // ── Access control ─────────────────────────────────────────────────────────────────────────────

  describe('access control', () => {
    const id = randomUUID();

    it('POST /places/duplicate-check and POST /place-submissions need authentication', async () => {
      const check = await ctx
        .post(`${API}/places/duplicate-check`)
        .send({ name: 'X', categoryId: id, ...freshSpot() });
      expect(check.status).toBe(401);
      const create = await ctx
        .post(`${API}/place-submissions`)
        .send({ name: 'X', categoryId: id, address: 'X', ...freshSpot() });
      expect(create.status).toBe(401);
      const get = await ctx.get(`${API}/place-submissions/${id}`);
      expect(get.status).toBe(401);
    });

    const adminRoutes: Array<[string, string, object | undefined]> = [
      ['get', '/admin/submissions', undefined],
      ['get', `/admin/submissions/${id}`, undefined],
      ['post', `/admin/submissions/${id}/approve`, {}],
      ['post', `/admin/submissions/${id}/reject`, { reason: 'x' }],
      ['post', `/admin/submissions/${id}/mark-duplicate`, { duplicateOfPlaceId: id }],
    ];
    const send = (method: string, path: string, body: object | undefined, token?: string) => {
      const request = (ctx as unknown as Record<string, (url: string) => import('supertest').Test>)[
        method
      ]?.(`${API}${path}`);
      if (!request) throw new Error(`no helper for ${method}`);
      const authed = token ? request.set('Authorization', bearer(token)) : request;
      return body ? authed.send(body) : authed;
    };

    it.each(adminRoutes)('%s %s answers 401 without a token', async (method, path, body) => {
      const response = await send(method, path, body);
      expect(response.status).toBe(401);
    });

    it.each(adminRoutes)(
      '%s %s answers 403 to a student (submissions.review is staff-only)',
      async (method, path, body) => {
        const response = await send(method, path, body, student.token);
        expect(response.status).toBe(403);
        expect(errorOf(response).error.code).toBe('FORBIDDEN');
      },
    );

    it('lets a moderator in (unknown ids answer 404, not 401/403)', async () => {
      expect((await send('get', `/admin/submissions/${id}`, undefined, moderator.token)).status).toBe(
        404,
      );
      expect((await send('get', '/admin/submissions', undefined, moderator.token)).status).toBe(200);
    });
  });

  // ── Duplicate check ──────────────────────────────────────────────────────────────────────────────

  describe('POST /places/duplicate-check', () => {
    it('rejects a category that does not exist', async () => {
      const response = await asStudent(ctx.post(`${API}/places/duplicate-check`)).send({
        name: 'X',
        categoryId: randomUUID(),
        ...freshSpot(),
      });
      expect(response.status).toBe(400);
      expect(errorOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it('finds a near-identical, same-category, same-location place as a block-level candidate', async () => {
      const spot = freshSpot();
      const existing = await createActivePlace({ ...spot });

      const response = await asStudent(ctx.post(`${API}/places/duplicate-check`)).send({
        name: existing.name,
        categoryId: leafCategoryId,
        ...spot,
      });
      expect(response.status).toBe(200);
      const { candidates } = successOf(z.object({ candidates: z.array(z.any()) }), response).data;
      expect(candidates[0]).toMatchObject({ placeId: existing.id, level: 'block' });
    });

    it('returns no candidates for something unrelated and far away', async () => {
      const response = await asStudent(ctx.post(`${API}/places/duplicate-check`)).send({
        name: uniqueName('Nothing Like It'),
        categoryId: otherGroupCategoryId,
        ...freshSpot(),
      });
      expect(response.status).toBe(200);
      const { candidates } = successOf(z.object({ candidates: z.array(z.any()) }), response).data;
      expect(candidates).toHaveLength(0);
    });
  });

  // ── Creating a submission ────────────────────────────────────────────────────────────────────────

  describe('POST /place-submissions', () => {
    it('creates a PENDING place and a PENDING submission when nothing looks like a duplicate', async () => {
      const spot = freshSpot();
      const name = uniqueName('Fresh Suggestion');
      const response = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name,
        categoryId: leafCategoryId,
        address: 'New Road, Testville',
        city: 'Testville',
        ...spot,
        priceAmount: 3000,
        priceUnit: 'MONTH',
        images: [{ imageUrl: 'https://example.com/sub.jpg', altText: 'Front view' }],
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const submission = successOf(placeSubmissionSchema, response).data;
      expect(submission.status).toBe('PENDING');
      expect(submission.submittedById).toBe(student.userId);
      expect(submission.duplicateCandidates).toHaveLength(0);
      expect(submission.images).toHaveLength(1);
      expect(submission.resultingPlaceId).not.toBeNull();

      const place = await ctx.db.place.findUniqueOrThrow({
        where: { id: submission.resultingPlaceId as string },
      });
      expect(place.status).toBe('PENDING');
      expect(place.name).toBe(name);

      const audit = await ctx.db.auditLog.findFirst({
        where: { action: 'SUBMISSION_CREATED', entityId: submission.id },
      });
      expect(audit).not.toBeNull();
    });

    it('refuses priceAmount without priceUnit, a group category, and an unknown college', async () => {
      const badPrice = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: uniqueName('Bad Price'),
        categoryId: leafCategoryId,
        address: 'X',
        ...freshSpot(),
        priceAmount: 100,
      });
      expect(badPrice.status).toBe(400);

      const group = await asAdmin(ctx.post(`${API}/admin/categories`)).send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Sub Bad Group ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}sub-bad-group-${run}`,
      });
      const groupCategoryId = (group.body as { data: { id: string } }).data.id;
      const badCategory = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: uniqueName('Bad Category'),
        categoryId: groupCategoryId,
        address: 'X',
        ...freshSpot(),
      });
      expect(badCategory.status).toBe(400);

      const badCollege = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: uniqueName('Bad College'),
        categoryId: leafCategoryId,
        collegeId: randomUUID(),
        address: 'X',
        ...freshSpot(),
      });
      expect(badCollege.status).toBe(400);
    });

    it('blocks a near-identical submission with 409 unless confirmDifferent is sent', async () => {
      const spot = freshSpot();
      const existing = await createActivePlace({ ...spot });
      const placesBefore = await ctx.db.place.count();

      const blocked = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: existing.name,
        categoryId: leafCategoryId,
        address: 'Campus Road, Testville',
        ...spot,
      });
      expect(blocked.status).toBe(409);
      expect(errorOf(blocked).error.code).toBe('DUPLICATE_PLACE_SUSPECTED');
      expect(await ctx.db.place.count()).toBe(placesBefore); // nothing was created

      const confirmed = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: existing.name,
        categoryId: leafCategoryId,
        address: 'Campus Road, Testville',
        ...spot,
        confirmDifferent: true,
      });
      expect(confirmed.status).toBe(201);
      const submission = successOf(placeSubmissionSchema, confirmed).data;
      expect(submission.duplicateCandidates[0]).toMatchObject({ placeId: existing.id, level: 'block' });
    });
  });

  // ── Reading one's own submission ─────────────────────────────────────────────────────────────────

  describe('GET /place-submissions/:id', () => {
    it('is visible to the submitter and to staff, but not to another student', async () => {
      const created = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: uniqueName('Visibility'),
        categoryId: leafCategoryId,
        address: 'X',
        ...freshSpot(),
      });
      const id = successOf(placeSubmissionSchema, created).data.id;

      expect((await asStudent(ctx.get(`${API}/place-submissions/${id}`))).status).toBe(200);
      expect((await asModerator(ctx.get(`${API}/place-submissions/${id}`))).status).toBe(200);
      const asOther = await ctx
        .get(`${API}/place-submissions/${id}`)
        .set('Authorization', bearer(otherStudent.token));
      expect(asOther.status).toBe(404);
    });
  });

  // ── Staff review ─────────────────────────────────────────────────────────────────────────────────

  describe('staff review', () => {
    async function createSubmission() {
      const response = await asStudent(ctx.post(`${API}/place-submissions`)).send({
        name: uniqueName('Review'),
        categoryId: leafCategoryId,
        address: 'X',
        ...freshSpot(),
      });
      return successOf(placeSubmissionSchema, response).data;
    }

    it('approve publishes the pending place and cannot be repeated', async () => {
      const submission = await createSubmission();
      const response = await asModerator(
        ctx.post(`${API}/admin/submissions/${submission.id}/approve`),
      ).send({});
      expect(response.status).toBe(200);
      expect(successOf(placeSubmissionSchema, response).data.status).toBe('APPROVED');

      const place = await ctx.db.place.findUniqueOrThrow({
        where: { id: submission.resultingPlaceId as string },
      });
      expect(place.status).toBe('ACTIVE');
      expect(place.publishedAt).not.toBeNull();

      const again = await asModerator(
        ctx.post(`${API}/admin/submissions/${submission.id}/approve`),
      ).send({});
      expect(again.status).toBe(409);
    });

    it('reject requires a reason and rejects the pending place too', async () => {
      const submission = await createSubmission();
      const noReason = await asModerator(
        ctx.post(`${API}/admin/submissions/${submission.id}/reject`),
      ).send({});
      expect(noReason.status).toBe(400);

      const rejected = await asModerator(
        ctx.post(`${API}/admin/submissions/${submission.id}/reject`),
      ).send({ reason: 'Could not verify this place' });
      expect(rejected.status).toBe(200);
      expect(successOf(placeSubmissionSchema, rejected).data.status).toBe('REJECTED');

      const place = await ctx.db.place.findUniqueOrThrow({
        where: { id: submission.resultingPlaceId as string },
      });
      expect(place.status).toBe('REJECTED');
    });

    it('mark-duplicate links to an existing place and rejects the pending one', async () => {
      const existing = await createActivePlace();
      const submission = await createSubmission();

      const badTarget = await asModerator(
        ctx.post(`${API}/admin/submissions/${submission.id}/mark-duplicate`),
      ).send({ duplicateOfPlaceId: randomUUID() });
      expect(badTarget.status).toBe(400);

      const response = await asModerator(
        ctx.post(`${API}/admin/submissions/${submission.id}/mark-duplicate`),
      ).send({ duplicateOfPlaceId: existing.id, reason: 'Same place' });
      expect(response.status).toBe(200);
      const updated = successOf(placeSubmissionSchema, response).data;
      expect(updated.status).toBe('DUPLICATE');
      expect(updated.duplicateOfPlaceId).toBe(existing.id);

      const place = await ctx.db.place.findUniqueOrThrow({
        where: { id: submission.resultingPlaceId as string },
      });
      expect(place.status).toBe('REJECTED');
    });
  });
});
