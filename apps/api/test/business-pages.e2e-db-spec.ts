import {
  businessAnalyticsSchema,
  ownedPlaceSchema,
  placeDetailSchema,
  publicBusinessSchema,
} from '@platform/contracts';
import { type AuthTestContext, createAuthTestContext, successOf } from './support/auth-e2e.js';
import { type BusinessFixture, businessWithPlace } from './support/business-fixtures.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';
const IMAGE = 'https://cdn.example.com/campuspin-test.jpg';

/** The public business page, its anonymous event counter, and owners editing their own places. */
describe('Business pages (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let mess: BusinessFixture;
  let other: BusinessFixture;
  let student: Persona;
  let slug: string;

  const setBusiness = (data: Record<string, unknown>) =>
    ctx.db.businessProfile.update({ where: { id: mess.businessId }, data });

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    mess = await businessWithPlace(ctx, 'page-mess');
    other = await businessWithPlace(ctx, 'page-other');
    student = await persona(ctx, 'page-student');
    ({ slug } = await ctx.db.businessProfile.findUniqueOrThrow({
      where: { id: mess.businessId },
      select: { slug: true },
    }));
    await setBusiness({ whatsapp: '+91 90000 00001', instagramUrl: 'https://instagram.com/mess' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /businesses/:slug', () => {
    it('shows a live business with its places, and nothing about the owner', async () => {
      const response = await ctx.get(`${API}/businesses/${slug}`).expect(200);
      const business = successOf(publicBusinessSchema, response).data;
      expect(business).toMatchObject({
        slug,
        whatsapp: '+91 90000 00001',
        instagramUrl: 'https://instagram.com/mess',
        verified: false,
        branches: [{ id: mess.place.id, slug: mess.place.slug }],
      });
      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain(mess.owner.email);
      expect(raw).not.toContain(mess.owner.userId);
      expect(raw).not.toContain(mess.businessId);
    });

    it('answers 404 for an unknown slug', async () => {
      await ctx.get(`${API}/businesses/no-such-business-anywhere`).expect(404);
    });

    it('hides a suspended, a rejected and a not-yet-approved business', async () => {
      await setBusiness({ status: 'SUSPENDED' });
      await ctx.get(`${API}/businesses/${slug}`).expect(404);
      await setBusiness({ status: 'ACTIVE', verificationStatus: 'REJECTED' });
      await ctx.get(`${API}/businesses/${slug}`).expect(404);
      await setBusiness({ verificationStatus: 'PENDING' });

      await ctx.db.place.update({ where: { id: mess.place.id }, data: { status: 'PENDING' } });
      await ctx.get(`${API}/businesses/${slug}`).expect(404);
      await ctx.db.place.update({ where: { id: mess.place.id }, data: { status: 'ACTIVE' } });
      await ctx.get(`${API}/businesses/${slug}`).expect(200);
    });

    it('links a place page to its business only while the business page could be live', async () => {
      const live = successOf(
        placeDetailSchema,
        await ctx.get(`${API}/places/${mess.place.slug}`).expect(200),
      ).data;
      expect(live.business).toMatchObject({
        slug,
        logoUrl: null,
        verified: false,
        placeCount: 1,
      });

      await setBusiness({ verificationStatus: 'REJECTED' });
      const hidden = successOf(
        placeDetailSchema,
        await ctx.get(`${API}/places/${mess.place.slug}`).expect(200),
      ).data;
      expect(hidden.business).toBeNull();
      await setBusiness({ verificationStatus: 'PENDING' });
    });
  });

  describe('POST /businesses/:slug/events and GET /business/analytics', () => {
    it('counts anonymous events and shows them only to the owner', async () => {
      for (const type of ['PAGE_VIEW', 'PAGE_VIEW', 'PHONE_CLICK', 'WHATSAPP_CLICK']) {
        await ctx.post(`${API}/businesses/${slug}/events`).send({ type }).expect(204);
      }
      await ctx
        .post(`${API}/businesses/${slug}/events`)
        .send({ type: 'DIRECTION_CLICK', placeId: mess.place.id })
        .expect(204);

      const stored = await ctx.db.businessEvent.findMany({
        where: { businessProfileId: mess.businessId },
      });
      expect(stored).toHaveLength(5);
      // Anonymous by design: the table has no column for who or from where.
      expect(Object.keys(stored[0] ?? {}).sort()).toEqual(
        ['businessProfileId', 'createdAt', 'day', 'id', 'placeId', 'type'].sort(),
      );

      const analytics = successOf(
        businessAnalyticsSchema,
        await as(mess.owner, ctx.get(`${API}/business/analytics?days=7`)).expect(200),
      ).data;
      expect(analytics.totals).toEqual({
        PAGE_VIEW: 2,
        PHONE_CLICK: 1,
        WHATSAPP_CLICK: 1,
        DIRECTION_CLICK: 1,
        SHARE_CLICK: 0,
      });
      expect(analytics.daily).toHaveLength(7);
      expect(analytics.daily.at(-1)?.PAGE_VIEW).toBe(2);

      const others = successOf(
        businessAnalyticsSchema,
        await as(other.owner, ctx.get(`${API}/business/analytics`)).expect(200),
      ).data;
      expect(others.totals.PAGE_VIEW).toBe(0);
      expect(others.daily).toHaveLength(30);
    });

    it('refuses unknown types, another business’s place and hidden businesses', async () => {
      await ctx.post(`${API}/businesses/${slug}/events`).send({ type: 'LIKE' }).expect(400);
      await ctx
        .post(`${API}/businesses/${slug}/events`)
        .send({ type: 'DIRECTION_CLICK', placeId: other.place.id })
        .expect(404);
      await setBusiness({ status: 'SUSPENDED' });
      await ctx.post(`${API}/businesses/${slug}/events`).send({ type: 'PAGE_VIEW' }).expect(404);
      await setBusiness({ status: 'ACTIVE' });
    });

    it('keeps analytics for business owners only', async () => {
      await as(student, ctx.get(`${API}/business/analytics`)).expect(403);
      await ctx.get(`${API}/business/analytics`).expect(401);
    });
  });

  describe('owners editing their own place', () => {
    const base = (placeId: string) => `${API}/business/places/${placeId}`;

    it('edits details and hours, live at once and audited', async () => {
      const response = await as(mess.owner, ctx.patch(base(mess.place.id)))
        .send({
          description: 'Veg thali, monthly plans.',
          hours: [{ dayOfWeek: 1, openTime: '08:00', closeTime: '22:00' }],
        })
        .expect(200);
      const place = successOf(ownedPlaceSchema, response).data;
      expect(place.description).toBe('Veg thali, monthly plans.');
      expect(place.hours).toHaveLength(1);
      expect(place.status).toBe('ACTIVE');

      const audit = await ctx.db.auditLog.findFirst({
        where: { entityId: mess.place.id, action: 'PLACE_UPDATED', actorId: mess.owner.userId },
      });
      expect(audit).not.toBeNull();
    });

    it('adds a photo, makes a second one the cover, and removes it', async () => {
      const first = successOf(
        ownedPlaceSchema,
        await as(mess.owner, ctx.post(`${base(mess.place.id)}/images`))
          .send({ imageUrl: IMAGE })
          .expect(201),
      ).data;
      expect(first.images).toHaveLength(1);
      expect(first.images[0]?.isCover).toBe(true);

      const second = successOf(
        ownedPlaceSchema,
        await as(mess.owner, ctx.post(`${base(mess.place.id)}/images`))
          .send({ imageUrl: `${IMAGE}?2` })
          .expect(201),
      ).data;
      const added = second.images.find((image) => !image.isCover);
      expect(added).toBeDefined();
      const covered = successOf(
        ownedPlaceSchema,
        await as(mess.owner, ctx.patch(`${base(mess.place.id)}/images/${added?.id}`))
          .send({ isCover: true })
          .expect(200),
      ).data;
      expect(covered.images[0]?.id).toBe(added?.id);

      const removed = successOf(
        ownedPlaceSchema,
        await as(mess.owner, ctx.delete(`${base(mess.place.id)}/images/${added?.id}`)).expect(200),
      ).data;
      expect(removed.images).toHaveLength(1);
    });

    it('never lets an owner change the slug or touch another business’s place', async () => {
      await as(mess.owner, ctx.patch(base(mess.place.id))).send({ slug: 'mine-now' }).expect(400);
      await as(mess.owner, ctx.patch(base(other.place.id))).send({ description: 'x' }).expect(404);
      await as(mess.owner, ctx.get(base(other.place.id))).expect(404);
      await as(mess.owner, ctx.post(`${base(other.place.id)}/images`))
        .send({ imageUrl: IMAGE })
        .expect(404);
      await as(student, ctx.patch(base(mess.place.id))).send({ description: 'x' }).expect(403);
    });

    it('stops a suspended business from editing', async () => {
      await setBusiness({ status: 'SUSPENDED' });
      await as(mess.owner, ctx.patch(base(mess.place.id))).send({ description: 'x' }).expect(404);
      await setBusiness({ status: 'ACTIVE' });
    });
  });
});
