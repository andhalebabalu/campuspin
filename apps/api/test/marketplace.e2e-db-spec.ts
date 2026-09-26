import {
  conversationSchema,
  cursorPageSchema,
  listingCardSchema,
  listingSchema,
  messageSchema,
  messagesUnreadSchema,
  notificationSchema,
  reportReceiptSchema,
  uploadedImageSchema,
} from '@platform/contracts';
import { z } from 'zod';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import {
  type Persona,
  as,
  makeCollege,
  persona,
  verifyStudent,
} from './support/student-fixtures.js';

const API = '/api/v1';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const cards = z.array(listingCardSchema);

describe('Student marketplace and chat (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let home: string; // the seller's college
  let near: string; // ~1.5 km away, same city
  let farSameCity: string; // 40 km away, same city name
  let farOtherCity: string;
  let seller: Persona;
  let classmate: Persona;
  let neighbour: Persona;
  let citymate: Persona;
  let stranger: Persona;
  let guest: Persona;
  let imageUrl: string;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    const admin = await persona(ctx, 'market-admin', { role: 'ADMIN' });
    home = await makeCollege(ctx, admin, 'Market Home', {
      latitude: 19.09,
      longitude: 74.74,
      city: 'E2E Market City',
    });
    near = await makeCollege(ctx, admin, 'Market Near', {
      latitude: 19.1,
      longitude: 74.75,
      city: 'E2E Market City',
    });
    farSameCity = await makeCollege(ctx, admin, 'Market Far', {
      latitude: 19.45,
      longitude: 74.74,
      city: 'E2E Market City',
    });
    farOtherCity = await makeCollege(ctx, admin, 'Market Other', {
      latitude: 18.52,
      longitude: 73.85,
      city: 'E2E Other City',
    });
    seller = await persona(ctx, 'market-seller', { name: 'Rahul Awasthi' });
    classmate = await persona(ctx, 'market-classmate', { name: 'Kiran Patil' });
    neighbour = await persona(ctx, 'market-neighbour', { name: 'Neha Shah' });
    citymate = await persona(ctx, 'market-citymate', { name: 'Om More' });
    stranger = await persona(ctx, 'market-stranger', { name: 'Sam Rao' });
    guest = await persona(ctx, 'market-guest', { name: 'Guest User' });
    await verifyStudent(ctx, seller, home);
    await verifyStudent(ctx, classmate, home);
    await verifyStudent(ctx, neighbour, near);
    await verifyStudent(ctx, citymate, farSameCity);
    await verifyStudent(ctx, stranger, farOtherCity);

    const upload = await as(seller, ctx.post(`${API}/uploads/images`))
      .attach('file', PNG, { filename: 'book.png', contentType: 'image/png' })
      .expect(201);
    imageUrl = successOf(uploadedImageSchema, upload).data.url;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function list(who: Persona, body: Record<string, unknown> = {}) {
    const response = await as(who, ctx.post(`${API}/marketplace/listings`)).send({
      title: 'Engineering Maths textbook',
      description: 'Good condition.',
      category: 'BOOKS',
      condition: 'GOOD',
      price: 300,
      ...body,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return successOf(listingSchema, response).data;
  }

  const canSee = async (who: Persona, id: string) =>
    (await as(who, ctx.get(`${API}/marketplace/listings/${id}`))).status === 200;

  describe('selling', () => {
    it('lists under the seller’s verified college and never shows contact details', async () => {
      const listing = await list(seller, { images: [imageUrl], location: 'Main gate' });
      expect(listing.college.id).toBe(home);
      expect(listing.visibility).toBe('NEARBY_COLLEGES');
      expect(listing.status).toBe('ACTIVE');
      expect(listing.images).toEqual([imageUrl]);
      expect(listing.seller.displayName).toBe('Rahul A.');
      expect(JSON.stringify(listing)).not.toContain(seller.email);
    });

    it('refuses a college in the body, outside photo URLs and unverified sellers', async () => {
      const spoof = await as(seller, ctx.post(`${API}/marketplace/listings`)).send({
        title: 'Spoof',
        description: 'x',
        category: 'OTHER',
        condition: 'GOOD',
        price: 1,
        collegeId: farOtherCity,
      });
      expect(spoof.status).toBe(400);

      const outside = await as(seller, ctx.post(`${API}/marketplace/listings`)).send({
        title: 'Hotlinked',
        description: 'x',
        category: 'OTHER',
        condition: 'GOOD',
        price: 1,
        images: ['https://tracker.example.com/pixel.png'],
      });
      expect(errorOf(outside).error.code).toBe('VALIDATION_ERROR');

      const unverified = await as(guest, ctx.post(`${API}/marketplace/listings`)).send({
        title: 'Hi',
        description: 'x',
        category: 'OTHER',
        condition: 'GOOD',
        price: 1,
      });
      expect(errorOf(unverified).error.code).toBe('STUDENT_VERIFICATION_REQUIRED');
      const browse = await as(guest, ctx.get(`${API}/marketplace/listings`));
      expect(errorOf(browse).error.code).toBe('STUDENT_VERIFICATION_REQUIRED');
    });

    it('moves through reserve, sold and renew, refusing moves that make no sense', async () => {
      const listing = await list(seller);
      const act = (action: string) =>
        as(seller, ctx.post(`${API}/marketplace/listings/${listing.id}/actions`)).send({ action });

      expect(successOf(listingSchema, await act('reserve').expect(200)).data.status).toBe(
        'RESERVED',
      );
      expect(successOf(listingSchema, await act('sold').expect(200)).data.status).toBe('SOLD');
      await act('reserve').expect(409);

      const expiring = await list(seller);
      await ctx.db.marketplaceListing.update({
        where: { id: expiring.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await as(classmate, ctx.get(`${API}/marketplace/listings/${expiring.id}`)).expect(404);
      const renewed = successOf(
        listingSchema,
        await as(seller, ctx.post(`${API}/marketplace/listings/${expiring.id}/actions`))
          .send({ action: 'renew' })
          .expect(200),
      ).data;
      expect(renewed.status).toBe('ACTIVE');
      expect(new Date(renewed.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('lets only the seller edit or delete', async () => {
      const listing = await list(seller);
      await as(classmate, ctx.patch(`${API}/marketplace/listings/${listing.id}`))
        .send({ price: 1 })
        .expect(404);
      const edited = successOf(
        listingSchema,
        await as(seller, ctx.patch(`${API}/marketplace/listings/${listing.id}`))
          .send({ price: 250, negotiable: true })
          .expect(200),
      ).data;
      expect(edited).toMatchObject({ price: 250, negotiable: true });
      await as(seller, ctx.delete(`${API}/marketplace/listings/${listing.id}`)).expect(200);
      expect(await canSee(classmate, listing.id)).toBe(false);
    });
  });

  describe('who sees what', () => {
    let mine: string;
    let nearby: string;
    let city: string;

    beforeAll(async () => {
      mine = (
        await list(seller, { title: 'College only lamp', visibility: 'MY_COLLEGE', price: 100 })
      ).id;
      nearby = (
        await list(seller, { title: 'Nearby cycle', visibility: 'NEARBY_COLLEGES', price: 2500 })
      ).id;
      city = (await list(seller, { title: 'City-wide desk', visibility: 'CITY', price: 900 })).id;
    });

    it('keeps MY_COLLEGE listings inside the college', async () => {
      expect(await canSee(classmate, mine)).toBe(true);
      expect(await canSee(neighbour, mine)).toBe(false);
    });

    it('shows NEARBY_COLLEGES listings within the radius only', async () => {
      expect(await canSee(neighbour, nearby)).toBe(true);
      expect(await canSee(citymate, nearby)).toBe(false);
      expect(await canSee(stranger, nearby)).toBe(false);
    });

    it('shows CITY listings across the city, not beyond', async () => {
      expect(await canSee(citymate, city)).toBe(true);
      expect(await canSee(stranger, city)).toBe(false);
    });

    it('browses by scope, with the distance from my college', async () => {
      const ids = async (who: Persona, query: string) =>
        successOf(
          cards,
          await as(who, ctx.get(`${API}/marketplace/listings?limit=50&${query}`)).expect(200),
        ).data;

      const nearbyView = await ids(neighbour, 'scope=nearby');
      expect(nearbyView.map((card) => card.id)).toEqual(expect.arrayContaining([nearby, city]));
      expect(nearbyView.map((card) => card.id)).not.toContain(mine);
      expect(nearbyView.find((card) => card.id === nearby)?.distanceKm).toBeGreaterThan(0);

      expect((await ids(citymate, 'scope=nearby')).map((card) => card.id)).not.toContain(city);
      expect((await ids(citymate, 'scope=city')).map((card) => card.id)).toContain(city);

      const own = await ids(classmate, 'scope=my_college');
      expect(own.every((card) => card.college.id === home)).toBe(true);
      expect(own.find((card) => card.id === mine)?.distanceKm).toBeNull();

      const cheap = await ids(classmate, 'scope=my_college&maxPrice=500&sort=price_asc');
      expect(cheap.every((card) => card.price <= 500)).toBe(true);
      const prices = cheap.map((card) => card.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });
  });

  describe('chat', () => {
    let listingId: string;
    let conversationId: string;

    beforeAll(async () => {
      listingId = (await list(seller, { title: 'Scientific calculator', category: 'ELECTRONICS' }))
        .id;
    });

    it('lets a buyer message the seller, who is notified and can reply', async () => {
      const conversation = successOf(
        conversationSchema,
        await as(neighbour, ctx.post(`${API}/marketplace/listings/${listingId}/conversations`))
          .send({ message: 'Is this still available?' })
          .expect(201),
      ).data;
      conversationId = conversation.id;
      expect(conversation.role).toBe('BUYER');
      expect(conversation.other.displayName).toBe('Rahul A.');

      const notes = successOf(
        z.array(notificationSchema),
        await as(seller, ctx.get(`${API}/me/notifications`)).expect(200),
      ).data;
      expect(notes.some((note) => note.link === `/messages/${conversationId}`)).toBe(true);

      const unread = successOf(
        messagesUnreadSchema,
        await as(seller, ctx.get(`${API}/me/conversations/unread-count`)).expect(200),
      ).data;
      expect(unread.unread).toBeGreaterThanOrEqual(1);

      await as(seller, ctx.post(`${API}/me/conversations/${conversationId}/messages`))
        .send({ body: 'Yes! Meet at the library?' })
        .expect(201);
      const page = successOf(
        cursorPageSchema(messageSchema),
        await as(neighbour, ctx.get(`${API}/me/conversations/${conversationId}/messages`)).expect(
          200,
        ),
      ).data;
      expect(page.items.map((message) => message.body)).toEqual([
        'Yes! Meet at the library?',
        'Is this still available?',
      ]);
      expect(page.items[1]!.mine).toBe(true);

      await as(seller, ctx.post(`${API}/me/conversations/${conversationId}/read`)).expect(200);
      const list = successOf(
        z.array(conversationSchema),
        await as(seller, ctx.get(`${API}/me/conversations`)).expect(200),
      ).data;
      expect(list.find((item) => item.id === conversationId)).toMatchObject({
        role: 'SELLER',
        unread: false,
      });
    });

    it('reuses the same conversation for the same buyer and listing', async () => {
      const again = successOf(
        conversationSchema,
        await as(neighbour, ctx.post(`${API}/marketplace/listings/${listingId}/conversations`))
          .send({ message: 'Following up' })
          .expect(201),
      ).data;
      expect(again.id).toBe(conversationId);
    });

    it('keeps conversations private to their two members', async () => {
      await as(classmate, ctx.get(`${API}/me/conversations/${conversationId}`)).expect(404);
      await as(classmate, ctx.get(`${API}/me/conversations/${conversationId}/messages`)).expect(
        404,
      );
      await as(classmate, ctx.post(`${API}/me/conversations/${conversationId}/messages`))
        .send({ body: 'Butting in' })
        .expect(404);
    });

    it('refuses messaging your own listing, or a seller who turned messages off', async () => {
      await as(seller, ctx.post(`${API}/marketplace/listings/${listingId}/conversations`))
        .send({ message: 'Me?' })
        .expect(400);
      await as(seller, ctx.patch(`${API}/me/settings`))
        .send({ allowMarketplaceMessages: false })
        .expect(200);
      const refused = await as(
        classmate,
        ctx.post(`${API}/marketplace/listings/${listingId}/conversations`),
      ).send({
        message: 'Hi',
      });
      expect(refused.status).toBe(403);
      await as(seller, ctx.patch(`${API}/me/settings`))
        .send({ allowMarketplaceMessages: true })
        .expect(200);
    });

    it('stops messages once either side blocks the other', async () => {
      await as(seller, ctx.post(`${API}/me/blocks`))
        .send({ userId: neighbour.userId })
        .expect(201);
      const blocked = await as(
        neighbour,
        ctx.post(`${API}/me/conversations/${conversationId}/messages`),
      ).send({
        body: 'Hello?',
      });
      expect(errorOf(blocked).error.code).toBe('BLOCKED');
      expect(await canSee(neighbour, listingId)).toBe(false);
      await as(seller, ctx.delete(`${API}/me/blocks/${neighbour.userId}`)).expect(200);
    });

    it('records reports on listings once, with marketplace reasons', async () => {
      const send = () =>
        as(neighbour, ctx.post(`${API}/marketplace/listings/${listingId}/report`)).send({
          reason: 'SCAM',
        });
      const first = successOf(reportReceiptSchema, await send().expect(200)).data;
      const again = successOf(reportReceiptSchema, await send().expect(200)).data;
      expect(again.id).toBe(first.id);
      const wrong = await as(
        neighbour,
        ctx.post(`${API}/marketplace/listings/${listingId}/report`),
      ).send({
        reason: 'BUSINESS_CLOSED',
      });
      expect(errorOf(wrong).error.code).toBe('VALIDATION_ERROR');
      await as(seller, ctx.post(`${API}/marketplace/listings/${listingId}/report`))
        .send({ reason: 'SPAM' })
        .expect(400);

      await as(neighbour, ctx.post(`${API}/me/conversations/${conversationId}/report`))
        .send({ reason: 'HARASSMENT' })
        .expect(200);
    });
  });
});
