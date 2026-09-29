import { randomUUID } from 'node:crypto';
import {
  businessOrderSchema,
  businessServiceRequestSchema,
  orderSchema,
  placeServicesSchema,
  privateDocumentSchema,
  serviceItemSchema,
  serviceRequestSchema,
} from '@platform/contracts';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import { type BusinessFixture, businessWithPlace } from './support/business-fixtures.js';
import { makePdf } from './support/pdf-fixture.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';
const key = () => randomUUID();
/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Print orders with private PDFs, and repair requests with private photos and estimates. */
describe('Print orders and service requests (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let xerox: BusinessFixture;
  let rival: BusinessFixture;
  let repair: BusinessFixture;
  let student: Persona;
  let other: Persona;

  const base = (placeId: string) => `${API}/business/places/${placeId}`;
  const upload = (who: Persona, bytes: Buffer, name: string) =>
    as(who, ctx.post(`${API}/uploads/documents`)).attach('file', bytes, name);
  const printBody = (documentId: string, extra: Record<string, unknown> = {}) => ({
    placeId: xerox.place.id,
    documentId,
    copies: 2,
    color: true,
    doubleSided: false,
    paperSize: 'A4',
    binding: true,
    lamination: false,
    idempotencyKey: key(),
    ...extra,
  });

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    xerox = await businessWithPlace(ctx, 'xerox');
    rival = await businessWithPlace(ctx, 'xerox-rival');
    repair = await businessWithPlace(ctx, 'repair');
    student = await persona(ctx, 'print-student');
    other = await persona(ctx, 'print-other');
    await as(xerox.owner, ctx.put(`${base(xerox.place.id)}/services/PRINT`))
      .send({
        enabled: true,
        config: { bwPricePerPage: 2, colorPricePerPage: 10, bindingPrice: 30 },
      })
      .expect(200);
    await as(repair.owner, ctx.put(`${base(repair.place.id)}/services/REPAIR`))
      .send({ enabled: true })
      .expect(200);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('private uploads', () => {
    it('reads the page count from the PDF itself and refuses files that are not what they claim', async () => {
      const pdf = successOf(
        privateDocumentSchema,
        await upload(student, makePdf(12), 'notes.pdf').expect(201),
      ).data;
      expect(pdf).toMatchObject({
        kind: 'PRINT',
        pageCount: 12,
        contentType: 'application/pdf',
        fileName: 'notes.pdf',
      });

      const fake = await upload(student, Buffer.from('MZ not really a pdf'), 'virus.pdf');
      expect(fake.status).toBe(415);
      const locked = Buffer.from(
        makePdf(1).toString('latin1').replace('trailer <<', 'trailer << /Encrypt 9 0 R'),
        'latin1',
      );
      expect((await upload(student, locked, 'locked.pdf')).status).toBe(400);
      expect(
        (await ctx.post(`${API}/uploads/documents`).attach('file', makePdf(1), 'x.pdf')).status,
      ).toBe(401);
      expect((await upload(xerox.owner, makePdf(1), 'x.pdf')).status).toBe(403);
    });
  });

  describe('print orders', () => {
    let orderId: string;

    it('prices the job on the server from the page count and the shop’s prices', async () => {
      const pdf = successOf(
        privateDocumentSchema,
        await upload(student, makePdf(12), 'thesis.pdf').expect(201),
      ).data;
      const placed = successOf(
        orderSchema,
        await as(student, ctx.post(`${API}/orders/print`))
          .send(printBody(pdf.id))
          .expect(201),
      ).data;
      orderId = placed.id;
      // 12 pages x Rs 10 colour x 2 copies = 240, + binding Rs 30 x 2 = 60.
      expect(placed).toMatchObject({
        kind: 'PRINT',
        status: 'PENDING',
        statusLabel: 'Submitted',
        subtotal: 300,
        total: 300,
      });
      expect(placed.print).toMatchObject({
        fileName: 'thesis.pdf',
        pageCount: 12,
        copies: 2,
        color: true,
        binding: true,
      });

      // A document is used once, and only by its owner.
      expect(
        (await as(student, ctx.post(`${API}/orders/print`)).send(printBody(pdf.id))).status,
      ).toBe(400);
      const theirs = successOf(
        privateDocumentSchema,
        await upload(other, makePdf(1), 'a.pdf').expect(201),
      ).data;
      expect(
        (await as(student, ctx.post(`${API}/orders/print`)).send(printBody(theirs.id))).status,
      ).toBe(400);
    });

    it('refuses options the shop does not offer', async () => {
      await as(rival.owner, ctx.put(`${base(rival.place.id)}/services/PRINT`))
        .send({ enabled: true })
        .expect(200);
      const pdf = successOf(
        privateDocumentSchema,
        await upload(student, makePdf(2), 'b.pdf').expect(201),
      ).data;
      const colour = await as(student, ctx.post(`${API}/orders/print`)).send(
        printBody(pdf.id, { placeId: rival.place.id, binding: false }),
      );
      expect(colour.status).toBe(400);
      expect(JSON.stringify(errorOf(colour))).toContain('colour');
    });

    it('lets only the student and the shop open the document, and deletes it when the job is done', async () => {
      const shopCopy = await as(
        xerox.owner,
        ctx.get(`${API}/business/orders/${orderId}/document`),
      ).expect(200);
      expect(shopCopy.headers['content-type']).toContain('application/pdf');
      expect(shopCopy.headers['cache-control']).toContain('no-store');
      expect(
        Buffer.from(shopCopy.body as Buffer)
          .subarray(0, 5)
          .toString(),
      ).toBe('%PDF-');
      await as(student, ctx.get(`${API}/me/orders/${orderId}/document`)).expect(200);
      expect(
        (await as(rival.owner, ctx.get(`${API}/business/orders/${orderId}/document`))).status,
      ).toBe(404);
      expect((await as(other, ctx.get(`${API}/me/orders/${orderId}/document`))).status).toBe(404);

      const board = await as(xerox.owner, ctx.get(`${API}/business/orders`)).expect(200);
      const ticket = (board.body as { data: unknown[] }).data
        .map((row) => businessOrderSchema.parse(row))
        .find((row) => row.id === orderId);
      expect(ticket?.nextStatuses).toEqual(['ACCEPTED', 'REJECTED', 'CANCELLED']);
      for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
        await as(xerox.owner, ctx.patch(`${API}/business/orders/${orderId}/status`))
          .send({ status })
          .expect(200);
      }
      expect(
        (await as(xerox.owner, ctx.get(`${API}/business/orders/${orderId}/document`))).status,
      ).toBe(404);
      const opened = await ctx.db.auditLog.count({
        where: { action: 'PRIVATE_DOCUMENT_OPENED', actorId: xerox.owner.userId },
      });
      expect(opened).toBeGreaterThanOrEqual(1);
    });
  });

  describe('repair requests', () => {
    let screen: string;
    let requestId: string;

    it('shows the repair price list and takes a request with a private photo', async () => {
      screen = successOf(
        serviceItemSchema,
        await as(repair.owner, ctx.post(`${base(repair.place.id)}/items`))
          .send({ serviceKey: 'REPAIR', name: 'Screen replacement', price: 1500 })
          .expect(201),
      ).data.id;
      const services = successOf(
        placeServicesSchema,
        await ctx.get(`${API}/places/${repair.place.slug}/services`).expect(200),
      ).data;
      expect(services.catalog.REPAIR?.[0]?.items.map((item) => item.name)).toEqual([
        'Screen replacement',
      ]);

      const photo = successOf(
        privateDocumentSchema,
        await upload(student, PNG, 'cracked.png').expect(201),
      ).data;
      expect(photo.kind).toBe('REQUEST_PHOTO');
      const sent = successOf(
        serviceRequestSchema,
        await as(student, ctx.post(`${API}/service-requests`))
          .send({
            kind: 'GENERAL',
            placeId: repair.place.id,
            serviceKey: 'REPAIR',
            itemId: screen,
            description: 'Screen cracked after a fall, touch still works.',
            imageId: photo.id,
            idempotencyKey: key(),
          })
          .expect(201),
      ).data;
      requestId = sent.id;
      expect(sent).toMatchObject({
        kind: 'GENERAL',
        label: 'Screen replacement',
        status: 'NEW',
        hasImage: true,
      });
      const seen = await as(
        repair.owner,
        ctx.get(`${API}/business/requests/${requestId}/photo`),
      ).expect(200);
      expect(seen.headers['content-type']).toBe('image/png');
      expect(
        (await as(rival.owner, ctx.get(`${API}/business/requests/${requestId}/photo`))).status,
      ).toBe(404);
    });

    it('runs the estimate flow: the student approves before work starts', async () => {
      const move = (status: string, extra: Record<string, unknown> = {}) =>
        as(repair.owner, ctx.patch(`${API}/business/requests/${requestId}/status`)).send({
          status,
          ...extra,
        });
      await move('ACCEPTED').expect(200);
      expect((await move('ESTIMATE_AVAILABLE')).status).toBe(400);
      await move('ESTIMATE_AVAILABLE', {
        estimateAmount: 1800,
        estimateNote: 'Original screen',
      }).expect(200);
      expect((await move('IN_PROGRESS')).status).toBe(409);

      const estimate = successOf(
        serviceRequestSchema,
        await as(student, ctx.get(`${API}/me/service-requests/${requestId}`)).expect(200),
      ).data;
      expect(estimate).toMatchObject({
        status: 'ESTIMATE_AVAILABLE',
        estimateAmount: 1800,
        canApprove: true,
      });
      expect(
        (await as(other, ctx.post(`${API}/me/service-requests/${requestId}/approve`))).status,
      ).toBe(404);
      await as(student, ctx.post(`${API}/me/service-requests/${requestId}/approve`)).expect(200);
      await move('IN_PROGRESS').expect(200);
      expect(
        (await as(student, ctx.post(`${API}/me/service-requests/${requestId}/cancel`))).status,
      ).toBe(409);
      await move('READY').expect(200);
      const done = successOf(
        businessServiceRequestSchema,
        await move('COMPLETED').expect(200),
      ).data;
      expect(done.history.map((entry) => entry.status)).toEqual([
        'NEW',
        'ACCEPTED',
        'ESTIMATE_AVAILABLE',
        'APPROVED',
        'IN_PROGRESS',
        'READY',
        'COMPLETED',
      ]);
      // The photo is gone once the job is finished.
      expect(
        (await as(repair.owner, ctx.get(`${API}/business/requests/${requestId}/photo`))).status,
      ).toBe(404);
      const note = await ctx.db.notification.findFirst({
        where: { userId: student.userId, type: 'request.estimate_available' },
      });
      expect(note?.message).toContain('1800');
    });

    it('refuses a photo when the shop does not take photos', async () => {
      await as(repair.owner, ctx.put(`${base(repair.place.id)}/services/REPAIR`))
        .send({ config: { photosAllowed: false } })
        .expect(200);
      const photo = successOf(
        privateDocumentSchema,
        await upload(student, PNG, 'p.png').expect(201),
      ).data;
      const refused = await as(student, ctx.post(`${API}/service-requests`)).send({
        kind: 'GENERAL',
        placeId: repair.place.id,
        serviceKey: 'REPAIR',
        description: 'Laptop does not turn on at all.',
        imageId: photo.id,
        idempotencyKey: key(),
      });
      expect(refused.status).toBe(400);
    });
  });
});
