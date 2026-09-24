import { randomUUID } from 'node:crypto';
import {
  adminPlaceSchema,
  placeCardSchema,
  placeDetailSchema,
  publicReviewSchema,
  reviewSchema,
  reviewSummarySchema,
  reviewWithdrawnSchema,
} from '@platform/contracts';
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
// Far from every other e2e suite's test area, so college links computed here never interact.
const BASE = { latitude: 24.9, longitude: 81.3 };
const run = randomUUID().slice(0, 6);
let sequence = 0;
// Slugs start with "e2e-place-", so the shared cleanup removes these places (and their reviews).
const uniqueName = (label = 'Place') => `E2E Place Review ${run} ${label} ${(sequence += 1)}`;
let spotCount = 0;
const freshSpot = () => destination(BASE, 90, 3000 * (spotCount += 1));

interface Persona {
  userId: string;
  token: string;
}

describe('Reviews (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let student: Persona;
  let otherStudent: Persona;
  let moderator: Persona;
  let admin: Persona;
  let ownerOnly: Persona;
  let leafCategoryId: string;
  let foodDimensionId: string;
  let otherCategoryDimensionId: string;

  async function persona(
    label: string,
    options: { role?: string; name?: string; withoutStudent?: boolean } = {},
  ) {
    const account = await registerAndVerify(ctx, { label, name: options.name });
    if (options.role) await grantRole(ctx.db, account.userId, options.role);
    if (options.withoutStudent) {
      await ctx.db.userRole.deleteMany({
        where: { userId: account.userId, role: { key: 'STUDENT' } },
      });
    }
    // Roles travel in the access token, so log in only once they are final.
    const { accessToken } = await login(ctx, account);
    return { userId: account.userId, token: accessToken };
  }

  const as = <T extends { set: (name: string, value: string) => T }>(who: Persona, req: T): T =>
    req.set('Authorization', bearer(who.token));

  async function createActivePlace(label = 'Mess') {
    const response = await as(admin, ctx.post(`${API}/admin/places`))
      .send({
        name: uniqueName(label),
        address: 'Review Road, Testville',
        city: 'Testville',
        state: 'Madhya Pradesh',
        ...freshSpot(),
        categoryIds: [leafCategoryId],
        status: 'ACTIVE',
      })
      .expect(201);
    return successOf(adminPlaceSchema, response).data;
  }

  const postReview = (who: Persona, place: string, body: object) =>
    as(who, ctx.post(`${API}/places/${place}/reviews`)).send(body);

  async function placeRating(slug: string) {
    const response = await ctx.get(`${API}/places/${slug}`).expect(200);
    const { ratingAverage, ratingCount } = successOf(placeDetailSchema, response).data;
    return { ratingAverage, ratingCount };
  }

  async function summaryOf(slug: string) {
    const response = await ctx.get(`${API}/places/${slug}/reviews/summary`).expect(200);
    return successOf(reviewSummarySchema, response).data;
  }

  async function publicReviews(slug: string, query = '') {
    const response = await ctx.get(`${API}/places/${slug}/reviews${query}`).expect(200);
    return successOf(z.array(publicReviewSchema), response);
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    student = await persona('rev-student', { name: 'Asha Kulkarni' });
    otherStudent = await persona('rev-other-student', { name: 'Rohan Patil' });
    moderator = await persona('rev-moderator', { role: 'MODERATOR' });
    admin = await persona('rev-admin', { role: 'ADMIN' });
    // A business owner who is NOT also a student: the role gate itself must refuse them.
    ownerOnly = await persona('rev-owner', { role: 'BUSINESS_OWNER', withoutStudent: true });

    const group = await as(admin, ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Rev Group ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}rev-group-${run}`,
      })
      .expect(201);
    const groupId = (group.body as { data: { id: string } }).data.id;
    const leaf = await as(admin, ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Rev Mess ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}rev-mess-${run}`,
        parentId: groupId,
      })
      .expect(201);
    leafCategoryId = (leaf.body as { data: { id: string } }).data.id;
    const withFood = await as(
      admin,
      ctx.post(`${API}/admin/categories/${leafCategoryId}/rating-dimensions`),
    )
      .send({ key: 'food', label: 'Food', sortOrder: 1 })
      .expect(201);
    foodDimensionId = dimensionIdOf(withFood.body, 'food');
    await as(admin, ctx.post(`${API}/admin/categories/${leafCategoryId}/rating-dimensions`))
      .send({ key: 'hygiene', label: 'Hygiene', sortOrder: 2 })
      .expect(201);

    const other = await as(admin, ctx.post(`${API}/admin/categories`))
      .send({
        name: `${TEST_CATEGORY_SLUG_PREFIX} Rev Gym ${run}`,
        slug: `${TEST_CATEGORY_SLUG_PREFIX}rev-gym-${run}`,
        parentId: groupId,
      })
      .expect(201);
    const otherId = (other.body as { data: { id: string } }).data.id;
    const withEquipment = await as(
      admin,
      ctx.post(`${API}/admin/categories/${otherId}/rating-dimensions`),
    )
      .send({ key: 'equipment', label: 'Equipment' })
      .expect(201);
    otherCategoryDimensionId = dimensionIdOf(withEquipment.body, 'equipment');
  });

  afterAll(async () => {
    await ctx.close();
  });

  function dimensionIdOf(body: unknown, key: string): string {
    const dimensions = (body as { data: { ratingDimensions: Array<{ id: string; key: string }> } })
      .data.ratingDimensions;
    const found = dimensions.find((dimension) => dimension.key === key);
    if (!found) throw new Error(`no ${key} dimension in the response`);
    return found.id;
  }

  // ── Access control ─────────────────────────────────────────────────────────────────────────────

  describe('access control', () => {
    const id = randomUUID();

    it('reading is public; writing and /me/reviews need a session', async () => {
      const place = await createActivePlace('Public Read');
      expect((await ctx.get(`${API}/places/${place.slug}/reviews`)).status).toBe(200);
      expect((await ctx.get(`${API}/places/${place.slug}/reviews/summary`)).status).toBe(200);
      expect(
        (await ctx.post(`${API}/places/${place.slug}/reviews`).send({ rating: 5 })).status,
      ).toBe(401);
      expect((await ctx.get(`${API}/me/reviews`)).status).toBe(401);
      expect((await ctx.patch(`${API}/reviews/${id}`).send({ rating: 3 })).status).toBe(401);
      expect((await ctx.delete(`${API}/reviews/${id}`)).status).toBe(401);
    });

    it('only a STUDENT may post: a business owner without that role gets 403', async () => {
      const place = await createActivePlace('Owner Only');
      const response = await postReview(ownerOnly, place.slug, { rating: 5 });
      expect(response.status).toBe(403);
      expect(errorOf(response).error.code).toBe('FORBIDDEN');
    });

    const adminRoutes: Array<[string, string, object | undefined]> = [
      ['get', '/admin/reviews', undefined],
      ['get', `/admin/reviews/${id}`, undefined],
      ['post', `/admin/reviews/${id}/hide`, { reason: 'x' }],
      ['post', `/admin/reviews/${id}/restore`, {}],
      ['post', `/admin/reviews/${id}/remove`, { reason: 'x' }],
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
      expect((await send(method, path, body)).status).toBe(401);
    });

    it.each(adminRoutes)(
      '%s %s answers 403 to a student (reviews.moderate is staff-only)',
      async (method, path, body) => {
        const response = await send(method, path, body, student.token);
        expect(response.status).toBe(403);
      },
    );

    it('lets a moderator in (unknown ids answer 404)', async () => {
      expect((await send('get', `/admin/reviews/${id}`, undefined, moderator.token)).status).toBe(
        404,
      );
      expect((await send('get', '/admin/reviews', undefined, moderator.token)).status).toBe(200);
    });
  });

  // ── Posting ────────────────────────────────────────────────────────────────────────────────────

  describe('POST /places/:idOrSlug/reviews', () => {
    it('publishes at once, shows a display name only, updates the place rating and audits it', async () => {
      const place = await createActivePlace('First Review');
      const response = await postReview(student, place.slug, {
        rating: 4,
        comment: 'Good food, fair price.',
        dimensionRatings: [{ dimensionId: foodDimensionId, rating: 5 }],
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const review = successOf(reviewSchema, response).data;
      expect(review).toMatchObject({
        rating: 4,
        comment: 'Good food, fair price.',
        authorName: 'Asha K.',
        status: 'PUBLISHED',
        userId: student.userId,
        place: { id: place.id, slug: place.slug },
      });
      expect(review.dimensionRatings).toEqual([
        { dimensionId: foodDimensionId, key: 'food', label: 'Food', rating: 5 },
      ]);

      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 4, ratingCount: 1 });

      const [publicReview] = (await publicReviews(place.slug)).data;
      expect(publicReview?.authorName).toBe('Asha K.');
      expect(JSON.stringify(publicReview)).not.toContain('Kulkarni');
      expect(JSON.stringify(publicReview)).not.toContain(student.userId);

      const audit = await ctx.db.auditLog.findFirst({
        where: { action: 'REVIEW_CREATED', entityId: review.id },
      });
      expect(audit?.actorId).toBe(student.userId);
    });

    it('also accepts the place id instead of its slug', async () => {
      const place = await createActivePlace('By Id');
      expect((await postReview(student, place.id, { rating: 3 })).status).toBe(201);
    });

    it('refuses a second review of the same place with 409 ALREADY_REVIEWED', async () => {
      const place = await createActivePlace('Twice');
      await postReview(student, place.slug, { rating: 4 }).expect(201);
      const again = await postReview(student, place.slug, { rating: 1 });
      expect(again.status).toBe(409);
      expect(errorOf(again).error.code).toBe('ALREADY_REVIEWED');
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 4, ratingCount: 1 });
    });

    it('refuses a dimension from another category, and bad ratings', async () => {
      const place = await createActivePlace('Bad Dimension');
      const foreign = await postReview(student, place.slug, {
        rating: 4,
        dimensionRatings: [{ dimensionId: otherCategoryDimensionId, rating: 5 }],
      });
      expect(foreign.status).toBe(400);
      expect(errorOf(foreign).error.details).toMatchObject({
        fields: { dimensionRatings: [expect.any(String)] },
      });
      expect((await postReview(student, place.slug, { rating: 6 })).status).toBe(400);
      expect((await postReview(student, place.slug, { rating: 4, status: 'HIDDEN' })).status).toBe(
        400,
      );
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 0, ratingCount: 0 });
    });

    it('answers 404 for an unknown or deactivated place', async () => {
      expect((await postReview(student, 'e2e-place-no-such-place', { rating: 4 })).status).toBe(
        404,
      );
      const place = await createActivePlace('Deactivated');
      await as(admin, ctx.post(`${API}/admin/places/${place.id}/deactivate`)).expect(200);
      expect((await postReview(student, place.slug, { rating: 4 })).status).toBe(404);
      expect((await ctx.get(`${API}/places/${place.slug}/reviews`)).status).toBe(404);
    });

    it('refuses the owner of the business that manages the place (403)', async () => {
      const place = await createActivePlace('Own Business');
      const business = await ctx.db.businessProfile.create({
        data: {
          ownerId: otherStudent.userId,
          businessName: `E2E Review Business ${run}`,
          slug: `e2e-review-business-${run}`,
        },
      });
      try {
        await ctx.db.place.update({
          where: { id: place.id },
          data: { businessProfileId: business.id },
        });
        const response = await postReview(otherStudent, place.slug, { rating: 5 });
        expect(response.status).toBe(403);
        expect(errorOf(response).message).toMatch(/your business/);
        // Anyone else may still review it.
        expect((await postReview(student, place.slug, { rating: 5 })).status).toBe(201);
      } finally {
        await ctx.db.place.update({ where: { id: place.id }, data: { businessProfileId: null } });
        await ctx.db.businessProfile.delete({ where: { id: business.id } });
      }
    });

    it('keeps the rating exact when many students post at the same moment', async () => {
      const place = await createActivePlace('Concurrent');
      // Accounts are made one at a time (simultaneous sign-ups are not what this test is about);
      // the reviews themselves are then posted all at once.
      const crowd: Persona[] = [];
      for (const index of [1, 2, 3, 4, 5]) crowd.push(await persona(`rev-crowd-${index}`));
      const responses = await Promise.all(
        crowd.map((who, index) => postReview(who, place.slug, { rating: index + 1 })),
      );
      expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 3, ratingCount: 5 });
    });
  });

  // ── Reading ────────────────────────────────────────────────────────────────────────────────────

  describe('reading', () => {
    it('sorts by recent, highest and lowest, and summarises a histogram and dimension averages', async () => {
      const place = await createActivePlace('Sorted');
      await postReview(student, place.slug, {
        rating: 2,
        dimensionRatings: [{ dimensionId: foodDimensionId, rating: 3 }],
      }).expect(201);
      await postReview(otherStudent, place.slug, {
        rating: 5,
        dimensionRatings: [{ dimensionId: foodDimensionId, rating: 4 }],
      }).expect(201);

      expect((await publicReviews(place.slug)).data.map((r) => r.rating)).toEqual([5, 2]);
      expect((await publicReviews(place.slug, '?sort=highest')).data.map((r) => r.rating)).toEqual([
        5, 2,
      ]);
      expect((await publicReviews(place.slug, '?sort=lowest')).data.map((r) => r.rating)).toEqual([
        2, 5,
      ]);
      const page = await publicReviews(place.slug, '?limit=1&page=2&sort=highest');
      expect(page.data.map((r) => r.rating)).toEqual([2]);
      expect(page.meta).toMatchObject({ total: 2, totalPages: 2 });

      const summary = await summaryOf(place.slug);
      expect(summary.ratingAverage).toBe(3.5);
      expect(summary.ratingCount).toBe(2);
      expect(summary.histogram).toEqual([
        { rating: 5, count: 1 },
        { rating: 4, count: 0 },
        { rating: 3, count: 0 },
        { rating: 2, count: 1 },
        { rating: 1, count: 0 },
      ]);
      expect(summary.dimensions).toEqual([
        { id: foodDimensionId, key: 'food', label: 'Food', average: 3.5, count: 2 },
        expect.objectContaining({ key: 'hygiene', average: null, count: 0 }),
      ]);
    });

    it('GET /me/reviews lists only my own reviews, and placeId narrows it', async () => {
      const place = await createActivePlace('Mine');
      await postReview(otherStudent, place.slug, { rating: 3 }).expect(201);
      const mine = await as(otherStudent, ctx.get(`${API}/me/reviews?placeId=${place.id}`)).expect(
        200,
      );
      const reviews = successOf(z.array(reviewSchema), mine).data;
      expect(reviews).toHaveLength(1);
      expect(reviews[0]?.userId).toBe(otherStudent.userId);

      const noneHere = await as(student, ctx.get(`${API}/me/reviews?placeId=${place.id}`)).expect(
        200,
      );
      expect(successOf(z.array(reviewSchema), noneHere).data).toHaveLength(0);
    });
  });

  // ── Editing and withdrawing ────────────────────────────────────────────────────────────────────

  describe('PATCH and DELETE /reviews/:id', () => {
    it("edits the author's own review and recomputes the rating", async () => {
      const place = await createActivePlace('Edit');
      await postReview(otherStudent, place.slug, { rating: 5 }).expect(201);
      const created = successOf(
        reviewSchema,
        await postReview(student, place.slug, {
          rating: 1,
          comment: 'Bad',
          dimensionRatings: [{ dimensionId: foodDimensionId, rating: 1 }],
        }).expect(201),
      ).data;

      const response = await as(student, ctx.patch(`${API}/reviews/${created.id}`))
        .send({ rating: 3, comment: null, dimensionRatings: [] })
        .expect(200);
      const updated = successOf(reviewSchema, response).data;
      expect(updated).toMatchObject({ rating: 3, comment: null, dimensionRatings: [] });
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 4, ratingCount: 2 });
      expect((await summaryOf(place.slug)).dimensions[0]).toMatchObject({ key: 'food', count: 0 });
    });

    it("answers 404 for someone else's review (existence is not revealed)", async () => {
      const place = await createActivePlace('Not Yours');
      const created = successOf(
        reviewSchema,
        await postReview(student, place.slug, { rating: 4 }).expect(201),
      ).data;
      expect(
        (await as(otherStudent, ctx.patch(`${API}/reviews/${created.id}`)).send({ rating: 1 }))
          .status,
      ).toBe(404);
      expect((await as(otherStudent, ctx.delete(`${API}/reviews/${created.id}`))).status).toBe(404);
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 4, ratingCount: 1 });
    });

    it('withdraws a review, returns the new rating, and lets the author review again', async () => {
      const place = await createActivePlace('Withdraw');
      await postReview(otherStudent, place.slug, { rating: 2 }).expect(201);
      const created = successOf(
        reviewSchema,
        await postReview(student, place.slug, { rating: 4 }).expect(201),
      ).data;

      const response = await as(student, ctx.delete(`${API}/reviews/${created.id}`)).expect(200);
      expect(successOf(reviewWithdrawnSchema, response).data).toEqual({
        placeId: place.id,
        ratingAverage: 2,
        ratingCount: 1,
      });
      expect(await ctx.db.review.findUnique({ where: { id: created.id } })).toBeNull();
      expect(
        await ctx.db.auditLog.findFirst({
          where: { action: 'REVIEW_WITHDRAWN', entityId: created.id },
        }),
      ).not.toBeNull();

      expect((await postReview(student, place.slug, { rating: 5 })).status).toBe(201);
    });
  });

  // ── Moderation ─────────────────────────────────────────────────────────────────────────────────

  describe('moderation', () => {
    it('hide -> restore -> remove, keeping the rating, the public list and the author view in step', async () => {
      const place = await createActivePlace('Moderated');
      await postReview(otherStudent, place.slug, { rating: 5 }).expect(201);
      const created = successOf(
        reviewSchema,
        await postReview(student, place.slug, { rating: 1, comment: 'Spammy' }).expect(201),
      ).data;
      const moderate = (action: string, body: object = {}) =>
        as(moderator, ctx.post(`${API}/admin/reviews/${created.id}/${action}`)).send(body);

      // Hide: out of the list and the rating; the author sees why and cannot edit or withdraw.
      expect((await moderate('hide', {})).status).toBe(400); // a reason is required
      const hidden = successOf(
        reviewSchema,
        await moderate('hide', { reason: 'Looks like spam' }).expect(200),
      ).data;
      expect(hidden).toMatchObject({
        status: 'HIDDEN',
        moderationNote: 'Looks like spam',
        moderatedById: moderator.userId,
      });
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 5, ratingCount: 1 });
      expect((await publicReviews(place.slug)).data.map((r) => r.id)).not.toContain(created.id);
      const authorView = successOf(
        z.array(reviewSchema),
        await as(student, ctx.get(`${API}/me/reviews?placeId=${place.id}`)).expect(200),
      ).data;
      expect(authorView[0]).toMatchObject({ status: 'HIDDEN', moderationNote: 'Looks like spam' });
      const edit = await as(student, ctx.patch(`${API}/reviews/${created.id}`)).send({ rating: 5 });
      expect(edit.status).toBe(409);
      expect((await as(student, ctx.delete(`${API}/reviews/${created.id}`))).status).toBe(409);

      // Hiding again is a harmless no-op.
      expect((await moderate('hide', { reason: 'Again' })).status).toBe(200);

      // Restore: back in the list and the rating.
      const restored = successOf(reviewSchema, await moderate('restore').expect(200)).data;
      expect(restored.status).toBe('PUBLISHED');
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 3, ratingCount: 2 });

      // Remove: final. The row stays; nothing brings it back; the author cannot post another.
      const removed = successOf(
        reviewSchema,
        await moderate('remove', { reason: 'Spam' }).expect(200),
      ).data;
      expect(removed.status).toBe('REMOVED');
      expect(await placeRating(place.slug)).toEqual({ ratingAverage: 5, ratingCount: 1 });
      expect((await moderate('restore')).status).toBe(409);
      expect((await moderate('hide', { reason: 'x' })).status).toBe(409);
      expect((await moderate('remove', { reason: 'Again' })).status).toBe(200);
      expect(await ctx.db.review.findUnique({ where: { id: created.id } })).not.toBeNull();
      const again = await postReview(student, place.slug, { rating: 4 });
      expect(errorOf(again).error.code).toBe('ALREADY_REVIEWED');

      const actions = await ctx.db.auditLog.findMany({
        where: {
          entityId: created.id,
          action: { in: ['REVIEW_HIDDEN', 'REVIEW_RESTORED', 'REVIEW_REMOVED'] },
        },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      });
      // No-ops and refused actions are not audited.
      expect(actions.map((row) => row.action)).toEqual([
        'REVIEW_HIDDEN',
        'REVIEW_RESTORED',
        'REVIEW_REMOVED',
      ]);
    });

    it('filters the queue by status and place', async () => {
      const place = await createActivePlace('Queue');
      const created = successOf(
        reviewSchema,
        await postReview(student, place.slug, { rating: 2 }).expect(201),
      ).data;
      await as(moderator, ctx.post(`${API}/admin/reviews/${created.id}/hide`))
        .send({ reason: 'Check' })
        .expect(200);
      const response = await as(
        moderator,
        ctx.get(`${API}/admin/reviews?status=HIDDEN&placeId=${place.id}`),
      ).expect(200);
      expect(successOf(z.array(reviewSchema), response).data.map((r) => r.id)).toEqual([
        created.id,
      ]);
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────────────────────────────

  describe('GET /places rating options', () => {
    it('sort=rating puts established ratings first and unrated last; minRating filters', async () => {
      const tag = `Rank${run}`;
      const oneFive = await createActivePlace(`${tag} One Five`);
      const solid = await createActivePlace(`${tag} Solid`);
      const unrated = await createActivePlace(`${tag} Unrated`);
      const low = await createActivePlace(`${tag} Low`);

      await postReview(student, oneFive.slug, { rating: 5 }).expect(201);
      const voters: Persona[] = [];
      for (const index of [1, 2, 3]) voters.push(await persona(`rev-voter-${index}`));
      for (const who of [student, otherStudent, ...voters]) {
        await postReview(who, solid.slug, { rating: 5 }).expect(201);
      }
      await postReview(otherStudent, low.slug, { rating: 2 }).expect(201);

      const ranked = await ctx.get(`${API}/places?q=${tag}&sort=rating`).expect(200);
      expect(successOf(z.array(placeCardSchema), ranked).data.map((card) => card.id)).toEqual([
        solid.id,
        oneFive.id,
        low.id,
        unrated.id,
      ]);

      const good = await ctx.get(`${API}/places?q=${tag}&minRating=4&sort=name`).expect(200);
      expect(
        successOf(z.array(placeCardSchema), good)
          .data.map((card) => card.id)
          .sort(),
      ).toEqual([oneFive.id, solid.id].sort());

      // The lowest threshold still never matches an unrated place.
      const any = await ctx.get(`${API}/places?q=${tag}&minRating=1`).expect(200);
      expect(successOf(z.array(placeCardSchema), any).data.map((card) => card.id)).not.toContain(
        unrated.id,
      );
    });
  });
});
