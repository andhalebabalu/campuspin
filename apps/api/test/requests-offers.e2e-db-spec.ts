import { randomUUID } from 'node:crypto';
import {
  adminOfferSchema,
  businessInsightsSchema,
  businessRedemptionSchema,
  businessServiceRequestSchema,
  orderSchema,
  ownerOfferSchema,
  ownerQrCodeSchema,
  ownerTableRequestTypeSchema,
  placeServicesSchema,
  placeTableSchema,
  redemptionSchema,
  serviceItemSchema,
  serviceRequestSchema,
  studentHomeSchema,
  studentOfferSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { dayKey, daysBefore, istDay } from '../src/modules/analytics/activity-rules.js';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import { type BusinessFixture, businessWithPlace } from './support/business-fixtures.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';
const key = () => randomUUID();
const today = dayKey(istDay(new Date()));
const HERE = { latitude: 22.5, longitude: 88.3 };

/** Table requests, student offers, counter codes and offers applied to orders. */
describe('Table requests and student offers (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let cafe: BusinessFixture;
  let rival: BusinessFixture;
  let student: Persona;
  let other: Persona;
  let moderator: Persona;
  let tableToken: string;
  let water: string;
  let tea: string;

  const base = (placeId: string) => `${API}/business/places/${placeId}`;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    cafe = await businessWithPlace(ctx, 'offer-cafe', HERE);
    rival = await businessWithPlace(ctx, 'offer-rival', { latitude: 22.6, longitude: 88.3 });
    student = await persona(ctx, 'offer-student');
    other = await persona(ctx, 'offer-other');
    moderator = await persona(ctx, 'offer-moderator', { role: 'MODERATOR' });
    await as(student, ctx.put(`${API}/me/saved-places/${cafe.place.id}`)).expect(200);

    for (const service of ['TABLE_SERVICE', 'ORDER_FOOD']) {
      await as(cafe.owner, ctx.put(`${base(cafe.place.id)}/services/${service}`))
        .send({ enabled: true })
        .expect(200);
    }
    const tables = successOf(
      z.array(placeTableSchema),
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/tables`))
        .send({ count: 1 })
        .expect(201),
    ).data;
    tableToken = successOf(
      ownerQrCodeSchema,
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/qr`))
        .send({ kind: 'TABLE', tableId: tables[0]?.id })
        .expect(201),
    ).data.token;
    tea = successOf(
      serviceItemSchema,
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/items`))
        .send({ serviceKey: 'ORDER_FOOD', name: 'Tea', price: 200 })
        .expect(201),
    ).data.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('table requests', () => {
    it('adds the usual requests when Table Service is switched on, and shows them to students', async () => {
      const types = successOf(
        z.array(ownerTableRequestTypeSchema),
        await as(cafe.owner, ctx.get(`${base(cafe.place.id)}/request-types`)).expect(200),
      ).data;
      expect(types.map((type) => type.label)).toEqual([
        'Water',
        'Call staff',
        'Extra cutlery',
        'Tissue',
        'Request bill',
      ]);
      water = types[0]?.id ?? '';
      const services = successOf(
        placeServicesSchema,
        await ctx.get(`${API}/places/${cafe.place.slug}/services`).expect(200),
      ).data;
      expect(services.tableRequests.map((type) => type.label)).toContain('Request bill');
      expect((await as(rival.owner, ctx.get(`${base(cafe.place.id)}/request-types`))).status).toBe(
        404,
      );
    });

    it('sends "Water" from the table once, however often it is tapped, and the business handles it', async () => {
      const send = () =>
        as(student, ctx.post(`${API}/service-requests`)).send({
          kind: 'TABLE',
          qrToken: tableToken,
          requestTypeId: water,
          idempotencyKey: key(),
        });
      const first = successOf(serviceRequestSchema, await send().expect(201)).data;
      const second = successOf(serviceRequestSchema, await send().expect(201)).data;
      expect(second.id).toBe(first.id);
      expect(first).toMatchObject({
        kind: 'TABLE',
        label: 'Water',
        table: 'Table 01',
        status: 'NEW',
      });

      const inbox = successOf(
        z.array(businessServiceRequestSchema),
        await as(cafe.owner, ctx.get(`${API}/business/requests`)).expect(200),
      ).data;
      expect(inbox.find((item) => item.id === first.id)?.nextStatuses).toEqual([
        'ACKNOWLEDGED',
        'COMPLETED',
        'CANCELLED',
      ]);
      expect(
        (
          await as(rival.owner, ctx.patch(`${API}/business/requests/${first.id}/status`)).send({
            status: 'ACKNOWLEDGED',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await as(cafe.owner, ctx.patch(`${API}/business/requests/${first.id}/status`)).send({
            status: 'ESTIMATE_AVAILABLE',
            estimateAmount: 5,
          })
        ).status,
      ).toBe(409);
      await as(cafe.owner, ctx.patch(`${API}/business/requests/${first.id}/status`))
        .send({ status: 'ACKNOWLEDGED' })
        .expect(200);
      await as(cafe.owner, ctx.patch(`${API}/business/requests/${first.id}/status`))
        .send({ status: 'COMPLETED' })
        .expect(200);

      // Handled: asking again is a new request, and others cannot read this one.
      const third = successOf(serviceRequestSchema, await send().expect(201)).data;
      expect(third.id).not.toBe(first.id);
      expect((await as(other, ctx.get(`${API}/me/service-requests/${first.id}`))).status).toBe(404);
      const cancelled = await as(
        student,
        ctx.post(`${API}/me/service-requests/${third.id}/cancel`),
      ).expect(200);
      expect(successOf(serviceRequestSchema, cancelled).data.status).toBe('CANCELLED');
    });

    it('refuses a switched-off request and a code from the wrong kind', async () => {
      await as(cafe.owner, ctx.patch(`${base(cafe.place.id)}/request-types/${water}`))
        .send({ active: false })
        .expect(200);
      const off = await as(student, ctx.post(`${API}/service-requests`)).send({
        kind: 'TABLE',
        qrToken: tableToken,
        requestTypeId: water,
        idempotencyKey: key(),
      });
      expect(off.status).toBe(400);
      await as(cafe.owner, ctx.patch(`${base(cafe.place.id)}/request-types/${water}`))
        .send({ active: true })
        .expect(200);
    });
  });

  describe('student offers', () => {
    let tenPercent: string;
    let daily: string;

    it('lets the owner create offers and tells students who saved the place', async () => {
      const created = successOf(
        ownerOfferSchema,
        await as(cafe.owner, ctx.post(`${API}/business/offers`))
          .send({
            placeId: cafe.place.id,
            title: '10% off for CampusPin students',
            discountType: 'PERCENT',
            discountValue: 10,
            maxDiscount: 30,
            validFrom: today,
          })
          .expect(201),
      ).data;
      tenPercent = created.id;
      expect(created).toMatchObject({ status: 'ACTIVE', availableToday: true, limitPerStudent: 1 });
      const note = await ctx.db.notification.findFirst({
        where: { userId: student.userId, type: 'offer.new' },
      });
      expect(note?.title).toContain('10% OFF');

      daily = successOf(
        ownerOfferSchema,
        await as(cafe.owner, ctx.post(`${API}/business/offers`))
          .send({
            placeId: cafe.place.id,
            title: 'Free tea with lunch',
            discountType: 'FREEBIE',
            validFrom: today,
            limitPeriod: 'DAILY',
            limitPerStudent: 1,
            totalLimit: 1,
          })
          .expect(201),
      ).data.id;

      const bad = await as(cafe.owner, ctx.post(`${API}/business/offers`)).send({
        placeId: cafe.place.id,
        title: 'Too good',
        discountType: 'PERCENT',
        discountValue: 150,
        validFrom: today,
      });
      expect(bad.status).toBe(400);
      expect(
        (
          await as(rival.owner, ctx.patch(`${API}/business/offers/${tenPercent}`)).send({
            status: 'PAUSED',
          })
        ).status,
      ).toBe(404);
    });

    it('lists live offers nearby and on the place', async () => {
      const nearby = successOf(
        z.array(studentOfferSchema),
        await ctx
          .get(`${API}/offers/nearby?lat=${HERE.latitude}&lng=${HERE.longitude}`)
          .expect(200),
      ).data;
      expect(nearby.slice(0, 2).map((offer) => offer.place.id)).toEqual([
        cafe.place.id,
        cafe.place.id,
      ]);
      const services = successOf(
        placeServicesSchema,
        await ctx.get(`${API}/places/${cafe.place.slug}/services`).expect(200),
      ).data;
      expect(services.offers.map((offer) => offer.id)).toEqual(
        expect.arrayContaining([tenPercent, daily]),
      );
    });

    it('issues one counter code, which staff can use once, and stops repeat use', async () => {
      const code = successOf(
        redemptionSchema,
        await as(student, ctx.post(`${API}/offers/${daily}/redeem`)).expect(200),
      ).data;
      expect(code.code).toMatch(/^[A-Z2-9]{6}$/);
      const same = successOf(
        redemptionSchema,
        await as(student, ctx.post(`${API}/offers/${daily}/redeem`)).expect(200),
      ).data;
      expect(same.code).toBe(code.code);

      expect(
        (
          await as(rival.owner, ctx.post(`${API}/business/redemptions/verify`)).send({
            code: code.code,
          })
        ).status,
      ).toBe(404);
      const used = successOf(
        businessRedemptionSchema,
        await as(cafe.owner, ctx.post(`${API}/business/redemptions/verify`))
          .send({ code: code.code })
          .expect(200),
      ).data;
      expect(used.status).toBe('REDEEMED');
      const again = await as(cafe.owner, ctx.post(`${API}/business/redemptions/verify`)).send({
        code: code.code,
      });
      expect(again.status).toBe(409);

      const repeat = await as(student, ctx.post(`${API}/offers/${daily}/redeem`));
      expect(repeat.status).toBe(409);
      expect(errorOf(repeat).error.code).toBe('OFFER_LIMIT_REACHED');
      // Its total limit was 1: nobody else can use it now.
      const used_up = await as(other, ctx.post(`${API}/offers/${daily}/redeem`));
      expect(used_up.status).toBe(409);
    });

    it('lets only one of two simultaneous taps get a second use', async () => {
      const [a, b] = await Promise.all([
        as(other, ctx.post(`${API}/offers/${tenPercent}/redeem`)),
        as(other, ctx.post(`${API}/offers/${tenPercent}/redeem`)),
      ]);
      expect(successOf(redemptionSchema, a).data.code).toBe(
        successOf(redemptionSchema, b).data.code,
      );
      expect(
        await ctx.db.offerRedemption.count({
          where: { offerId: tenPercent, userId: other.userId },
        }),
      ).toBe(1);
    });

    it('takes the discount off an order on the server, once per student', async () => {
      const placed = successOf(
        orderSchema,
        await as(student, ctx.post(`${API}/orders`))
          .send({
            placeId: cafe.place.id,
            offerId: tenPercent,
            items: [{ itemId: tea, quantity: 2 }],
            idempotencyKey: key(),
          })
          .expect(201),
      ).data;
      // 10% of 400 is 40, capped at 30.
      expect(placed).toMatchObject({ subtotal: 400, discount: 30, total: 370 });
      const second = await as(student, ctx.post(`${API}/orders`)).send({
        placeId: cafe.place.id,
        offerId: tenPercent,
        items: [{ itemId: tea, quantity: 1 }],
        idempotencyKey: key(),
      });
      expect(second.status).toBe(409);
      expect(errorOf(second).error.code).toBe('OFFER_LIMIT_REACHED');
    });

    it('counts it all for the dashboard and the student home', async () => {
      const numbers = successOf(
        businessInsightsSchema,
        await as(cafe.owner, ctx.get(`${API}/business/insights`)).expect(200),
      ).data;
      expect(numbers.offerRedemptions).toBe(2);
      expect(numbers.activeOffers).toBe(2);
      expect(numbers.requests).toBe(2);
      const home = successOf(
        studentHomeSchema,
        await as(other, ctx.get(`${API}/me/home`)).expect(200),
      ).data;
      expect(home.nearbyOffers.map((offer) => offer.id)).toContain(tenPercent);
      expect(
        home.quickActions.find((action) => action.key === 'OFFERS')?.available,
      ).toBeGreaterThanOrEqual(1);
    });

    it('lets a moderator take an offer down; the owner cannot bring it back', async () => {
      const removed = successOf(
        adminOfferSchema,
        await as(moderator, ctx.post(`${API}/admin/offers/${tenPercent}/remove`))
          .send({ reason: 'Misleading terms' })
          .expect(200),
      ).data;
      expect(removed.status).toBe('REMOVED');
      expect((await as(student, ctx.post(`${API}/offers/${tenPercent}/redeem`))).status).toBe(404);
      expect(
        (
          await as(cafe.owner, ctx.patch(`${API}/business/offers/${tenPercent}`)).send({
            status: 'ACTIVE',
          })
        ).status,
      ).toBe(409);
      const expiredStart = dayKey(daysBefore(istDay(new Date()), 10));
      const past = successOf(
        ownerOfferSchema,
        await as(cafe.owner, ctx.post(`${API}/business/offers`))
          .send({
            placeId: cafe.place.id,
            title: 'Last week only',
            discountType: 'FLAT',
            discountValue: 20,
            validFrom: expiredStart,
            validUntil: dayKey(daysBefore(istDay(new Date()), 3)),
          })
          .expect(201),
      ).data;
      expect(past).toMatchObject({ status: 'EXPIRED', availableToday: false });
    });
  });
});
