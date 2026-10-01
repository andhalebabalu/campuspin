import { randomUUID } from 'node:crypto';
import {
  businessCapabilitiesSchema,
  businessOrderSchema,
  businessSummarySchema,
  businessTypeDefaultsSchema,
  invoiceSchema,
  invoiceSummarySchema,
  orderSchema,
  ownerQrCodeSchema,
  placeServiceSchema,
  placeTableSchema,
  serviceItemSchema,
  tableStatusSchema,
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

/**
 * One dashboard, capability-driven: each business type gets its modules and nothing else, the
 * server refuses the rest, and completing an order issues exactly one invoice.
 */
describe('Business capabilities, orders and invoices (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let hotel: BusinessFixture;
  let mess: BusinessFixture;
  let pg: BusinessFixture;
  let rooms: BusinessFixture;
  let library: BusinessFixture;
  let xerox: BusinessFixture;
  let student: Persona;
  let otherStudent: Persona;
  let admin: Persona;
  let thali: string;
  let tableToken: string;

  const base = (fixture: BusinessFixture) => `${API}/business/places/${fixture.place.id}`;
  const capabilitiesOf = async (fixture: BusinessFixture) =>
    successOf(
      businessCapabilitiesSchema,
      await as(fixture.owner, ctx.get(`${API}/business/capabilities`)).expect(200),
    ).data;
  const move = (fixture: BusinessFixture, orderId: string, status: string) =>
    as(fixture.owner, ctx.patch(`${API}/business/orders/${orderId}/status`))
      .send({ status })
      .expect(200);
  const summaryOf = async (fixture: BusinessFixture) =>
    successOf(
      businessSummarySchema,
      await as(fixture.owner, ctx.get(`${API}/business/summary?range=today`)).expect(200),
    ).data;

  async function menu(fixture: BusinessFixture, name: string, price: number): Promise<string> {
    await as(fixture.owner, ctx.put(`${base(fixture)}/services/ORDER_FOOD`))
      .send({ enabled: true })
      .expect(200);
    const item = await as(fixture.owner, ctx.post(`${base(fixture)}/items`))
      .send({ serviceKey: 'ORDER_FOOD', name, price })
      .expect(201);
    return successOf(serviceItemSchema, item).data.id;
  }

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    hotel = await businessWithPlace(ctx, 'cap-hotel', undefined, { type: 'HOTEL_RESTAURANT' });
    mess = await businessWithPlace(ctx, 'cap-mess', undefined, { type: 'MESS' });
    pg = await businessWithPlace(ctx, 'cap-pg', undefined, { type: 'PG' });
    rooms = await businessWithPlace(ctx, 'cap-rooms', undefined, { type: 'ROOM_RENTAL' });
    library = await businessWithPlace(ctx, 'cap-library', undefined, { type: 'LIBRARY' });
    xerox = await businessWithPlace(ctx, 'cap-xerox', undefined, { type: 'PRINTING_XEROX' });
    student = await persona(ctx, 'cap-student');
    otherStudent = await persona(ctx, 'cap-other');
    admin = await persona(ctx, 'cap-admin', { role: 'ADMIN' });
    thali = await menu(hotel, 'Veg thali', 120);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('each type gets its modules, and only those', () => {
    it('reports the type defaults', async () => {
      expect((await capabilitiesOf(hotel)).capabilities).toEqual([
        'INVOICE',
        'ORDER_MANAGEMENT',
        'PAYMENT',
        'REVENUE_ANALYTICS',
        'TABLE_ORDER',
      ]);
      expect((await capabilitiesOf(mess)).capabilities).toEqual([
        'INVOICE',
        'ORDER_MANAGEMENT',
        'PAYMENT',
        'REVENUE_ANALYTICS',
      ]);
      expect((await capabilitiesOf(pg)).capabilities).toEqual([
        'BOOKING',
        'ENQUIRY',
        'PAYMENT',
        'SERVICE_REQUEST',
      ]);
      expect((await capabilitiesOf(rooms)).capabilities).toEqual(['BOOKING', 'ENQUIRY', 'PAYMENT']);
      expect((await capabilitiesOf(library)).capabilities).toEqual([
        'BOOKING',
        'ENQUIRY',
        'MEMBERSHIP',
        'PAYMENT',
      ]);
      expect((await capabilitiesOf(xerox)).capabilities).toEqual([
        'INVOICE',
        'ORDER_MANAGEMENT',
        'PAYMENT',
      ]);
    });

    it('refuses restaurant modules to a PG, a room rental and a library on the server', async () => {
      for (const fixture of [pg, rooms, library]) {
        const orders = await as(fixture.owner, ctx.get(`${API}/business/orders`)).expect(403);
        expect(errorOf(orders).error.code).toBe('CAPABILITY_REQUIRED');
        await as(fixture.owner, ctx.get(`${API}/business/invoices`)).expect(403);
        await as(fixture.owner, ctx.get(`${API}/business/tables/live`)).expect(403);
        await as(fixture.owner, ctx.post(`${base(fixture)}/tables`))
          .send({ count: 1 })
          .expect(403);
        await as(fixture.owner, ctx.get(`${base(fixture)}/menus`)).expect(403);
        await as(fixture.owner, ctx.put(`${base(fixture)}/services/ORDER_FOOD`))
          .send({ enabled: true })
          .expect(403);
        await as(fixture.owner, ctx.post(`${base(fixture)}/items`))
          .send({ serviceKey: 'ORDER_FOOD', name: 'Tea', price: 10 })
          .expect(403);
        // ...while their own modules work.
        await as(fixture.owner, ctx.get(`${API}/business/enquiries`)).expect(200);
        await as(fixture.owner, ctx.get(`${API}/business/bookings`)).expect(200);
        // And the services they can switch on never include food.
        const services = successOf(
          z.array(placeServiceSchema),
          await as(fixture.owner, ctx.get(`${base(fixture)}/services`)).expect(200),
        ).data.map((service) => service.serviceType.kind);
        expect(services).not.toContain('FOOD_ORDER');
        expect(services).not.toContain('TABLE_SERVICE');
        expect(services).toContain('BOOKING');
      }
      // Requests: a PG handles jobs; a room rental handles neither kind.
      await as(pg.owner, ctx.get(`${API}/business/requests`)).expect(200);
      await as(rooms.owner, ctx.get(`${API}/business/requests`)).expect(403);
    });

    it('keeps enquiries from a mess and bookings from a hotel', async () => {
      await as(mess.owner, ctx.get(`${API}/business/enquiries`)).expect(403);
      await as(hotel.owner, ctx.get(`${API}/business/bookings`)).expect(403);
      await as(mess.owner, ctx.get(`${API}/business/tables/live`)).expect(403);
      await as(xerox.owner, ctx.get(`${API}/business/orders`)).expect(200);
      await as(xerox.owner, ctx.get(`${API}/business/invoices`)).expect(200);
    });

    it('builds the summary from the capabilities only', async () => {
      const pgSummary = await summaryOf(pg);
      expect(pgSummary.orders).toBeNull();
      expect(pgSummary.revenue).toBeNull();
      expect(pgSummary.invoices).toBeNull();
      expect(pgSummary.tables).toBeNull();
      expect(pgSummary.enquiries).toEqual({ total: 0, pending: 0 });
      expect(pgSummary.bookings).not.toBeNull();
      expect(pgSummary.requests).not.toBeNull();
      expect(pgSummary.recentOrders).toEqual([]);

      const xeroxSummary = await summaryOf(xerox);
      expect(xeroxSummary.orders).not.toBeNull();
      expect(xeroxSummary.revenue).toBeNull(); // no REVENUE_ANALYTICS for printing
      expect(xeroxSummary.enquiries).toBeNull();
    });
  });

  describe('hotel: table order → completed → invoice → paid', () => {
    let orderId: string;
    let invoiceId: string;

    it('shows the table busy while the order runs', async () => {
      const [table] = successOf(
        z.array(placeTableSchema),
        await as(hotel.owner, ctx.post(`${base(hotel)}/tables`))
          .send({ count: 2 })
          .expect(201),
      ).data;
      const qr = successOf(
        ownerQrCodeSchema,
        await as(hotel.owner, ctx.post(`${base(hotel)}/qr`))
          .send({ kind: 'TABLE', tableId: table?.id })
          .expect(201),
      ).data;
      tableToken = qr.token;
      const placed = successOf(
        orderSchema,
        await as(student, ctx.post(`${API}/orders`))
          .send({
            placeId: hotel.place.id,
            qrToken: tableToken,
            items: [{ itemId: thali, quantity: 2 }],
            paymentMethod: 'CASH_AT_TABLE',
            idempotencyKey: key(),
          })
          .expect(201),
      ).data;
      orderId = placed.id;
      expect(placed).toMatchObject({ total: 240, paymentStatus: 'UNPAID', invoice: null });

      const board = successOf(
        z.array(tableStatusSchema),
        await as(hotel.owner, ctx.get(`${API}/business/tables/live`)).expect(200),
      ).data;
      expect(board.find((row) => row.id === table?.id)).toMatchObject({
        status: 'ORDER_PENDING',
        currentOrder: { id: orderId },
      });
      expect(board.filter((row) => row.status === 'AVAILABLE')).toHaveLength(1);
    });

    it('issues exactly one invoice when the order is completed, not before', async () => {
      for (const status of ['ACCEPTED', 'PREPARING', 'READY']) {
        const moved = successOf(businessOrderSchema, await move(hotel, orderId, status)).data;
        expect(moved.invoice).toBeNull();
      }
      const done = successOf(businessOrderSchema, await move(hotel, orderId, 'COMPLETED')).data;
      expect(done.completedAt).not.toBeNull();
      expect(done.paymentStatus).toBe('UNPAID'); // completed is not paid
      expect(done.invoice?.status).toBe('ISSUED');
      expect(done.invoice?.number).toMatch(/^[A-Z]{1,3}-\d{4}-0001$/);
      invoiceId = done.invoice?.id ?? '';

      // Completing again is refused, and there is still one invoice.
      await as(hotel.owner, ctx.patch(`${API}/business/orders/${orderId}/status`))
        .send({ status: 'COMPLETED' })
        .expect(409);
      expect(await ctx.db.invoice.count({ where: { orderId } })).toBe(1);

      const invoice = successOf(
        invoiceSchema,
        await as(hotel.owner, ctx.get(`${API}/business/invoices/${invoiceId}`)).expect(200),
      ).data;
      expect(invoice).toMatchObject({
        status: 'ISSUED',
        customer: { name: 'Asha Kulkarni' },
        order: { id: orderId, table: expect.stringMatching(/^Table/) as unknown },
        items: [{ name: 'Veg thali', quantity: 2, unitPrice: 120, lineTotal: 240 }],
        subtotal: 240,
        discount: 0,
        tax: 0,
        total: 240,
        paymentStatus: 'UNPAID',
      });
      const raw = JSON.stringify(invoice);
      expect(raw).not.toContain(student.email);
      expect(raw).not.toContain(hotel.businessId);
    });

    it('downloads a real PDF, for the business and the student who ordered only', async () => {
      const pdf = await as(hotel.owner, ctx.get(`${API}/business/invoices/${invoiceId}/pdf`))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      const bytes = pdf.body as Buffer;
      expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
      expect(bytes.toString('latin1')).toContain('Veg thali');
      expect(bytes.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);

      await as(student, ctx.get(`${API}/me/invoices/${invoiceId}`)).expect(200);
      await as(student, ctx.get(`${API}/me/invoices/${invoiceId}/pdf`)).expect(200);
      await as(otherStudent, ctx.get(`${API}/me/invoices/${invoiceId}`)).expect(404);
      await as(mess.owner, ctx.get(`${API}/business/invoices/${invoiceId}`)).expect(404);
      const mine = successOf(
        orderSchema,
        await as(student, ctx.get(`${API}/me/orders/${orderId}`)).expect(200),
      ).data;
      expect(mine.invoice?.id).toBe(invoiceId);
    });

    it('records the payment separately; the invoice follows; twice is refused', async () => {
      const paid = successOf(
        businessOrderSchema,
        await as(hotel.owner, ctx.post(`${API}/business/orders/${orderId}/payment`))
          .send({ via: 'UPI' })
          .expect(200),
      ).data;
      expect(paid).toMatchObject({
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        paidVia: 'UPI',
        invoice: { status: 'PAID' },
      });
      await as(hotel.owner, ctx.post(`${API}/business/orders/${orderId}/payment`))
        .send({ via: 'CASH' })
        .expect(409);
      await as(student, ctx.post(`${API}/business/orders/${orderId}/payment`))
        .send({ via: 'CASH' })
        .expect(403);

      const list = successOf(
        z.array(invoiceSummarySchema),
        await as(hotel.owner, ctx.get(`${API}/business/invoices?period=today&status=PAID`)).expect(
          200,
        ),
      ).data;
      expect(list.map((row) => row.id)).toEqual([invoiceId]);
    });

    it('counts it on the dashboard', async () => {
      const summary = await summaryOf(hotel);
      expect(summary.orders).toMatchObject({ total: 1, completed: 1, pending: 0, cancelled: 0 });
      expect(summary.revenue).toEqual({ completed: 240, paid: 240 });
      expect(summary.invoices).toEqual({ issued: 1, unpaid: 0 });
      expect(summary.payments).toEqual({ paidOrders: 1, unpaidCompleted: 0 });
      expect(summary.recentOrders[0]).toMatchObject({ id: orderId, invoice: { id: invoiceId } });
    });
  });

  describe('mess: pickup order → invoice; no tables', () => {
    it('completes an order and invoices it', async () => {
      const dal = await menu(mess, 'Dal rice', 70);
      const placed = successOf(
        orderSchema,
        await as(student, ctx.post(`${API}/orders`))
          .send({
            placeId: mess.place.id,
            items: [{ itemId: dal, quantity: 1 }],
            paymentMethod: 'PAY_AT_COUNTER',
            idempotencyKey: key(),
          })
          .expect(201),
      ).data;
      await as(mess.owner, ctx.post(`${API}/business/orders/${placed.id}/payment`))
        .send({ via: 'CASH' })
        .expect(200);
      for (const status of ['ACCEPTED', 'READY', 'COMPLETED']) await move(mess, placed.id, status);
      const done = successOf(
        businessOrderSchema,
        await as(mess.owner, ctx.get(`${API}/business/orders/${placed.id}`)).expect(200),
      ).data;
      // Paid before completion: the invoice is issued already paid.
      expect(done.invoice?.status).toBe('PAID');
      const summary = await summaryOf(mess);
      expect(summary.tables).toBeNull();
      expect(summary.orders?.completed).toBe(1);
    });

    it('refuses a table order when the business has no table ordering', async () => {
      // The hotel's table code, used at the mess: the table is not the mess's.
      await as(student, ctx.post(`${API}/orders`))
        .send({
          placeId: mess.place.id,
          qrToken: tableToken,
          items: [],
          paymentMethod: 'PAY_AT_COUNTER',
          idempotencyKey: key(),
        })
        .expect((res) => expect([400, 404, 409]).toContain(res.status));
    });
  });

  describe('staff control', () => {
    it('turns a capability on for one business, and off again switches its services off', async () => {
      const on = successOf(
        businessCapabilitiesSchema,
        await as(
          admin,
          ctx.put(`${API}/admin/businesses/${pg.businessId}/capabilities/ORDER_MANAGEMENT`),
        )
          .send({ enabled: true, note: 'Canteen on site' })
          .expect(200),
      ).data;
      expect(on.capabilities).toContain('ORDER_MANAGEMENT');
      expect(on.overrides).toEqual([
        { capability: 'ORDER_MANAGEMENT', enabled: true, note: 'Canteen on site' },
      ]);
      await as(pg.owner, ctx.get(`${API}/business/orders`)).expect(200);
      await as(pg.owner, ctx.put(`${base(pg)}/services/ORDER_FOOD`))
        .send({ enabled: true })
        .expect(200);

      await as(
        admin,
        ctx.put(`${API}/admin/businesses/${pg.businessId}/capabilities/ORDER_MANAGEMENT`),
      )
        .send({ enabled: null })
        .expect(200);
      await as(pg.owner, ctx.get(`${API}/business/orders`)).expect(403);
      const service = await ctx.db.placeService.findFirstOrThrow({
        where: { placeId: pg.place.id, serviceType: { key: 'ORDER_FOOD' } },
      });
      expect(service.enabled).toBe(false);
    });

    it('stops invoicing a business whose invoices were switched off', async () => {
      await as(admin, ctx.put(`${API}/admin/businesses/${hotel.businessId}/capabilities/INVOICE`))
        .send({ enabled: false })
        .expect(200);
      const placed = successOf(
        orderSchema,
        await as(otherStudent, ctx.post(`${API}/orders`))
          .send({
            placeId: hotel.place.id,
            items: [{ itemId: thali, quantity: 1 }],
            paymentMethod: 'PAY_AT_COUNTER',
            idempotencyKey: key(),
          })
          .expect(201),
      ).data;
      for (const status of ['ACCEPTED', 'READY', 'COMPLETED']) await move(hotel, placed.id, status);
      expect(await ctx.db.invoice.count({ where: { orderId: placed.id } })).toBe(0);
      await as(hotel.owner, ctx.get(`${API}/business/invoices`)).expect(403);
      await as(admin, ctx.put(`${API}/admin/businesses/${hotel.businessId}/capabilities/INVOICE`))
        .send({ enabled: null })
        .expect(200);
    });

    it('changes a business type, and keeps type defaults for super admins', async () => {
      const changed = successOf(
        businessCapabilitiesSchema,
        await as(admin, ctx.put(`${API}/admin/businesses/${rooms.businessId}/type`))
          .send({ businessType: 'LIBRARY' })
          .expect(200),
      ).data;
      expect(changed).toMatchObject({ businessType: 'LIBRARY', typeSource: 'BUSINESS' });
      const types = successOf(
        z.array(businessTypeDefaultsSchema),
        await as(admin, ctx.get(`${API}/admin/business-types`)).expect(200),
      ).data;
      expect(types.find((row) => row.businessType === 'MESS')?.capabilities).toContain('INVOICE');
      // Changing a type's defaults changes every business of it: super admins only.
      await as(admin, ctx.put(`${API}/admin/business-types/MESS`))
        .send({ capabilities: [] })
        .expect(403);
      await as(pg.owner, ctx.get(`${API}/admin/business-types`)).expect(403);
      await as(student, ctx.get(`${API}/business/capabilities`)).expect(403);
    });
  });
});
