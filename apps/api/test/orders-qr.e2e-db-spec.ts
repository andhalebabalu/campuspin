import { randomUUID } from 'node:crypto';
import {
  adminQrCodeSchema,
  businessInsightsSchema,
  businessOrderSchema,
  orderSchema,
  ownerQrCodeSchema,
  placeServicesSchema,
  placeTableSchema,
  qrResolutionSchema,
  serviceItemSchema,
  studentHomeSchema,
} from '@platform/contracts';
import { z } from 'zod';
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

/** Tables, QR codes, food ordering, the order board and dashboard numbers, on the real database. */
describe('QR codes and table ordering (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let cafe: BusinessFixture;
  let rival: BusinessFixture;
  let student: Persona;
  let otherStudent: Persona;
  let moderator: Persona;
  let admin: Persona;
  let poha: string;
  let pizza: string;
  let soldOut: string;
  let rivalItem: string;
  let tableToken: string;

  const base = (placeId: string) => `${API}/business/places/${placeId}`;
  const order = (who: Persona, body: Record<string, unknown>) =>
    as(who, ctx.post(`${API}/orders`)).send({
      placeId: cafe.place.id,
      idempotencyKey: key(),
      ...body,
    });

  async function addItem(fixture: BusinessFixture, body: Record<string, unknown>): Promise<string> {
    const response = await as(fixture.owner, ctx.post(`${base(fixture.place.id)}/items`))
      .send({ serviceKey: 'ORDER_FOOD', ...body })
      .expect(201);
    return successOf(serviceItemSchema, response).data.id;
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    cafe = await businessWithPlace(ctx, 'cafe');
    rival = await businessWithPlace(ctx, 'rival-cafe');
    student = await persona(ctx, 'order-student');
    otherStudent = await persona(ctx, 'order-other');
    moderator = await persona(ctx, 'order-moderator', { role: 'MODERATOR' });
    admin = await persona(ctx, 'order-admin', { role: 'ADMIN' });

    for (const fixture of [cafe, rival]) {
      await as(fixture.owner, ctx.put(`${base(fixture.place.id)}/services/ORDER_FOOD`))
        .send({ enabled: true })
        .expect(200);
    }
    poha = await addItem(cafe, { section: 'Breakfast', name: 'Poha', price: 30, isVeg: true });
    pizza = await addItem(cafe, {
      section: 'Main course',
      name: 'Pizza',
      price: 150,
      options: [{ name: 'Extra cheese', price: 20 }],
    });
    soldOut = await addItem(cafe, {
      section: 'Main course',
      name: 'Biryani',
      price: 180,
      available: false,
    });
    rivalItem = await addItem(rival, { name: 'Rival tea', price: 10 });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('shows students the available menu only', async () => {
    const services = successOf(
      placeServicesSchema,
      await ctx.get(`${API}/places/${cafe.place.slug}/services`).expect(200),
    ).data;
    expect(services.services.map((service) => service.key)).toContain('ORDER_FOOD');
    const names = (services.catalog.ORDER_FOOD ?? []).flatMap((section) =>
      section.items.map((item) => item.name),
    );
    expect(names).toEqual(['Poha', 'Pizza']);
  });

  it('adds numbered tables and gives each a QR code that resolves without exposing ids', async () => {
    const tables = successOf(
      z.array(placeTableSchema),
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/tables`))
        .send({ count: 3 })
        .expect(201),
    ).data;
    expect(tables.map((table) => table.label)).toEqual(['Table 01', 'Table 02', 'Table 03']);
    const more = successOf(
      z.array(placeTableSchema),
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/tables`))
        .send({ count: 2 })
        .expect(201),
    ).data;
    expect(more.map((table) => table.label)).toContain('Table 05');

    const tableId = tables[1]?.id ?? '';
    const qr = successOf(
      ownerQrCodeSchema,
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/qr`))
        .send({ kind: 'TABLE', tableId })
        .expect(201),
    ).data;
    tableToken = qr.token;
    expect(tableToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // Asking again returns the same live code.
    const again = successOf(
      ownerQrCodeSchema,
      await as(cafe.owner, ctx.post(`${base(cafe.place.id)}/qr`))
        .send({ kind: 'TABLE', tableId })
        .expect(201),
    ).data;
    expect(again.token).toBe(tableToken);

    const resolved = successOf(
      qrResolutionSchema,
      await ctx.get(`${API}/qr/${tableToken}`).expect(200),
    ).data;
    expect(resolved).toMatchObject({
      kind: 'TABLE',
      table: { label: 'Table 02' },
      place: { slug: cafe.place.slug },
    });
    expect(JSON.stringify(resolved)).not.toContain(tableId);
    expect((await ctx.get(`${API}/qr/NotARealCampusPinToken1`)).status).toBe(404);

    // Another business cannot touch this place's tables.
    expect((await as(rival.owner, ctx.get(`${base(cafe.place.id)}/tables`))).status).toBe(404);
  });

  it('prices the order on the server and seats it at the scanned table', async () => {
    const response = await order(student, {
      qrToken: tableToken,
      items: [
        { itemId: poha, quantity: 2 },
        { itemId: pizza, quantity: 1, options: ['Extra cheese'] },
      ],
      paymentMethod: 'CASH_AT_TABLE',
    }).expect(201);
    const placed = successOf(orderSchema, response).data;
    expect(placed).toMatchObject({
      status: 'PENDING',
      table: 'Table 02',
      subtotal: 230,
      discount: 0,
      total: 230,
    });
    expect(placed.code).toMatch(/^CP[A-Z2-9]{6}$/);
    expect(placed.history.map((entry) => entry.status)).toEqual(['PENDING']);

    const note = await ctx.db.notification.findFirst({
      where: { userId: cafe.owner.userId, type: 'order.business' },
    });
    expect(note?.title).toContain(placed.code);
  });

  it('never trusts a price, a foreign item, a sold-out item or a made-up add-on', async () => {
    const withPrice = await order(student, { items: [{ itemId: poha, quantity: 1, price: 1 }] });
    expect(withPrice.status).toBe(400);
    for (const items of [
      [{ itemId: rivalItem, quantity: 1 }],
      [{ itemId: soldOut, quantity: 1 }],
      [{ itemId: pizza, quantity: 1, options: ['Gold leaf'] }],
      [{ itemId: poha, quantity: 0 }],
    ]) {
      expect((await order(student, { items })).status).toBe(400);
    }
  });

  it('returns the same order for a retried request instead of a duplicate', async () => {
    const idempotencyKey = key();
    const first = await order(student, {
      idempotencyKey,
      items: [{ itemId: poha, quantity: 1 }],
    }).expect(201);
    const second = await order(student, {
      idempotencyKey,
      items: [{ itemId: poha, quantity: 5 }],
    }).expect(201);
    expect(successOf(orderSchema, second).data.id).toBe(successOf(orderSchema, first).data.id);
    expect(
      await ctx.db.serviceOrder.count({ where: { userId: student.userId, idempotencyKey } }),
    ).toBe(1);
  });

  it('runs the kitchen flow, refusing moves that skip steps, and keeps orders private', async () => {
    const placed = successOf(
      orderSchema,
      await order(student, { items: [{ itemId: poha, quantity: 1 }] }).expect(201),
    ).data;
    const status = (who: Persona, to: string) =>
      as(who, ctx.patch(`${API}/business/orders/${placed.id}/status`)).send({ status: to });

    expect((await status(rival.owner, 'ACCEPTED')).status).toBe(404);
    expect((await as(otherStudent, ctx.get(`${API}/me/orders/${placed.id}`))).status).toBe(404);
    const skip = await status(cafe.owner, 'COMPLETED');
    expect(skip.status).toBe(409);
    expect(errorOf(skip).error.code).toBe('STATUS_CHANGED');

    const board = successOf(
      z.array(businessOrderSchema),
      await as(cafe.owner, ctx.get(`${API}/business/orders`)).expect(200),
    ).data.find((item) => item.id === placed.id);
    expect(board?.nextStatuses).toEqual(['ACCEPTED', 'REJECTED', 'CANCELLED']);
    expect(board?.student.name).toBeTruthy();

    for (const to of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'])
      await status(cafe.owner, to).expect(200);
    const done = successOf(
      orderSchema,
      await as(student, ctx.get(`${API}/me/orders/${placed.id}`)).expect(200),
    ).data;
    expect(done.status).toBe('COMPLETED');
    expect(done.history.map((entry) => entry.status)).toEqual([
      'PENDING',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'COMPLETED',
    ]);
    const notes = await ctx.db.notification.findMany({
      where: { userId: student.userId, type: { in: ['order.accepted', 'order.ready'] } },
    });
    expect(notes.length).toBeGreaterThanOrEqual(2);
  });

  it('lets a student cancel only while the order is pending', async () => {
    const early = successOf(
      orderSchema,
      await order(student, { items: [{ itemId: poha, quantity: 1 }] }).expect(201),
    ).data;
    const cancelled = await as(student, ctx.post(`${API}/me/orders/${early.id}/cancel`)).expect(
      200,
    );
    expect(successOf(orderSchema, cancelled).data.status).toBe('CANCELLED');

    const late = successOf(
      orderSchema,
      await order(student, { items: [{ itemId: poha, quantity: 1 }] }).expect(201),
    ).data;
    await as(cafe.owner, ctx.patch(`${API}/business/orders/${late.id}/status`))
      .send({ status: 'ACCEPTED' })
      .expect(200);
    expect((await as(student, ctx.post(`${API}/me/orders/${late.id}/cancel`))).status).toBe(409);
  });

  it('refuses orders while paused, and from business accounts', async () => {
    await as(cafe.owner, ctx.put(`${base(cafe.place.id)}/services/ORDER_FOOD`))
      .send({ config: { acceptingOrders: false } })
      .expect(200);
    const paused = await order(student, { items: [{ itemId: poha, quantity: 1 }] });
    expect(paused.status).toBe(409);
    expect(errorOf(paused).error.code).toBe('SERVICE_UNAVAILABLE_NOW');
    await as(cafe.owner, ctx.put(`${base(cafe.place.id)}/services/ORDER_FOOD`))
      .send({ config: { acceptingOrders: true } })
      .expect(200);
    expect((await order(rival.owner, { items: [{ itemId: poha, quantity: 1 }] })).status).toBe(403);
  });

  it('retires a regenerated or disabled code at once', async () => {
    const codes = successOf(
      z.array(ownerQrCodeSchema),
      await as(cafe.owner, ctx.get(`${base(cafe.place.id)}/qr`)).expect(200),
    ).data;
    const current = codes.find((code) => code.token === tableToken);
    expect(current?.scanCount).toBeGreaterThanOrEqual(1);

    const fresh = successOf(
      ownerQrCodeSchema,
      await as(cafe.owner, ctx.post(`${API}/business/qr/${current?.id}/regenerate`)).expect(200),
    ).data;
    const old = await ctx.get(`${API}/qr/${tableToken}`);
    expect(old.status).toBe(410);
    expect(errorOf(old).error.code).toBe('QR_INACTIVE');
    const stale = await order(student, {
      qrToken: tableToken,
      items: [{ itemId: poha, quantity: 1 }],
    });
    expect([400, 410]).toContain(stale.status);

    await as(cafe.owner, ctx.post(`${API}/business/qr/${fresh.id}/disable`)).expect(200);
    expect((await ctx.get(`${API}/qr/${fresh.token}`)).status).toBe(410);
    await as(cafe.owner, ctx.post(`${API}/business/qr/${fresh.id}/enable`)).expect(200);
    await ctx.get(`${API}/qr/${fresh.token}`).expect(200);

    // Staff can switch a code off; the business cannot touch another business's codes.
    expect((await as(rival.owner, ctx.post(`${API}/business/qr/${fresh.id}/disable`))).status).toBe(
      404,
    );
    const listed = successOf(
      z.array(adminQrCodeSchema),
      await as(
        moderator,
        ctx.get(`${API}/admin/qr-codes?q=${encodeURIComponent(cafe.place.name)}`),
      ).expect(200),
    ).data;
    expect(listed.map((code) => code.id)).toContain(fresh.id);
    await as(moderator, ctx.post(`${API}/admin/qr-codes/${fresh.id}/disable`)).expect(200);
    expect((await ctx.get(`${API}/qr/${fresh.token}`)).status).toBe(410);
  });

  it('puts active orders and recently used places on the student home', async () => {
    const home = successOf(
      studentHomeSchema,
      await as(student, ctx.get(`${API}/me/home`)).expect(200),
    ).data;
    expect(home.activeOrders.length).toBeGreaterThanOrEqual(1);
    expect(
      home.activeOrders.every(
        (item) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(item.status),
      ),
    ).toBe(true);
    expect(home.recentPlaces.map((place) => place.id)).toContain(cafe.place.id);
    const food = home.quickActions.find((action) => action.key === 'ORDER_FOOD');
    expect(food?.available).toBeGreaterThanOrEqual(2);
  });

  it('counts views, scans and orders for the dashboard; staff see the order log', async () => {
    await ctx.post(`${API}/places/${cafe.place.slug}/view`).expect(200);
    const numbers = successOf(
      businessInsightsSchema,
      await as(cafe.owner, ctx.get(`${API}/business/insights?range=today`)).expect(200),
    ).data;
    expect(numbers.orders).toBeGreaterThanOrEqual(4);
    expect(numbers.activeOrders).toBeGreaterThanOrEqual(1);
    expect(numbers.profileViews).toBeGreaterThanOrEqual(1);
    expect(numbers.qrScans).toBeGreaterThanOrEqual(2);

    expect((await as(moderator, ctx.get(`${API}/admin/orders`))).status).toBe(403);
    const log = successOf(
      z.array(businessOrderSchema),
      await as(
        admin,
        ctx.get(`${API}/admin/orders?q=${encodeURIComponent(cafe.place.name)}`),
      ).expect(200),
    ).data;
    expect(log.length).toBeGreaterThanOrEqual(4);
  });
});
