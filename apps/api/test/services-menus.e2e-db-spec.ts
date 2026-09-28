import {
  adminDailyMenuSchema,
  adminServiceTypeSchema,
  messMenuCardSchema,
  ownerDailyMenuSchema,
  placeMenusSchema,
  placeServiceSchema,
  placeServicesSchema,
  studentHomeSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { daysBefore, dayKey, istDay } from '../src/modules/analytics/activity-rules.js';
import {
  type AuthTestContext,
  createAuthTestContext,
  errorOf,
  successOf,
} from './support/auth-e2e.js';
import { type BusinessFixture, businessWithPlace } from './support/business-fixtures.js';
import { type Persona, as, persona } from './support/student-fixtures.js';

const API = '/api/v1';
const today = dayKey(istDay(new Date()));
const tomorrow = dayKey(daysBefore(istDay(new Date()), -1));
const yesterday = dayKey(daysBefore(istDay(new Date()), 1));
// A spot far from the other suites' places, so "nearest" lists are predictable.
const HERE = { latitude: 21.2, longitude: 79.1 };

const MENU = {
  meals: {
    BREAKFAST: ['Poha', 'Tea'],
    LUNCH: ['Dal', 'Rice', 'Roti', 'Bhaji', 'Salad', 'rice'],
    SNACKS: [],
    DINNER: ['Paneer', 'Roti'],
  },
};

/** Services and mess daily menus: owner editing, publishing, student views and staff moderation. */
describe('Services and daily menus (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let mess: BusinessFixture;
  let other: BusinessFixture;
  let student: Persona;
  let moderator: Persona;
  let admin: Persona;

  const menuUrl = (placeId: string, date: string) =>
    `${API}/business/places/${placeId}/menus/${date}`;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    mess = await businessWithPlace(ctx, 'mess', HERE);
    other = await businessWithPlace(ctx, 'other-mess', { latitude: 21.21, longitude: 79.1 });
    student = await persona(ctx, 'menu-student');
    moderator = await persona(ctx, 'menu-moderator', { role: 'MODERATOR' });
    admin = await persona(ctx, 'menu-admin', { role: 'ADMIN' });
    await as(student, ctx.put(`${API}/me/saved-places/${mess.place.id}`)).expect(200);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('lists the services an owner can switch on, off by default', async () => {
    const response = await as(
      mess.owner,
      ctx.get(`${API}/business/places/${mess.place.id}/services`),
    ).expect(200);
    const services = successOf(z.array(placeServiceSchema), response).data;
    const menu = services.find((service) => service.serviceType.key === 'DAILY_MENU');
    expect(menu).toMatchObject({ enabled: false, config: { monthlyPrice: null } });
  });

  it('never lets another business, a student or a guest near the place', async () => {
    const url = `${API}/business/places/${mess.place.id}/services`;
    expect((await as(other.owner, ctx.get(url))).status).toBe(404);
    expect((await as(student, ctx.get(url))).status).toBe(403);
    expect((await ctx.get(url)).status).toBe(401);
    expect((await as(other.owner, ctx.put(menuUrl(mess.place.id, today)).send(MENU))).status).toBe(
      404,
    );
  });

  it('validates service settings against the kind', async () => {
    const url = `${API}/business/places/${mess.place.id}/services/DAILY_MENU`;
    const bad = await as(mess.owner, ctx.put(url)).send({ config: { monthlyPrice: -5 } });
    expect(bad.status).toBe(400);
    expect(Object.keys(errorOf(bad).error.details?.fields ?? {})).toContain('config.monthlyPrice');
    const unknown = await as(mess.owner, ctx.put(url)).send({ config: { surprise: true } });
    expect(unknown.status).toBe(400);
    const good = await as(mess.owner, ctx.put(url))
      .send({ enabled: false, config: { monthlyPrice: 2800 } })
      .expect(200);
    expect(successOf(placeServiceSchema, good).data).toMatchObject({
      enabled: false,
      config: { monthlyPrice: 2800 },
    });
  });

  it('keeps a draft private, then publishes it and switches the menu service on', async () => {
    const saved = await as(mess.owner, ctx.put(menuUrl(mess.place.id, today)))
      .send(MENU)
      .expect(200);
    const draft = successOf(ownerDailyMenuSchema, saved).data;
    expect(draft).toMatchObject({ date: today, status: 'DRAFT' });
    // Duplicate dishes within a meal are dropped, the owner's order is kept.
    expect(draft.meals.LUNCH).toEqual(['Dal', 'Rice', 'Roti', 'Bhaji', 'Salad']);
    expect((await ctx.get(`${API}/places/${mess.place.slug}/menus`)).status).toBe(404);

    const published = await as(
      mess.owner,
      ctx.post(`${menuUrl(mess.place.id, today)}/publish`),
    ).expect(200);
    expect(successOf(ownerDailyMenuSchema, published).data.status).toBe('PUBLISHED');

    const menus = successOf(
      placeMenusSchema,
      await ctx.get(`${API}/places/${mess.place.slug}/menus`).expect(200),
    ).data;
    expect(menus.today?.meals.BREAKFAST).toEqual(['Poha', 'Tea']);
    expect(menus.tomorrow).toBeNull();

    const services = successOf(
      placeServicesSchema,
      await ctx.get(`${API}/places/${mess.place.slug}/services`).expect(200),
    ).data;
    expect(services.services.map((service) => service.key)).toContain('DAILY_MENU');
    expect(services.menus.today?.id).toBe(menus.today?.id);
  });

  it('tells students who saved the mess that the menu is out', async () => {
    const note = await ctx.db.notification.findFirst({
      where: { userId: student.userId, type: 'menu.published' },
    });
    expect(note?.title).toContain(mess.place.name);
    expect(note?.message).toContain('Poha');
  });

  it("copies today's menu to tomorrow and yesterday's is refused when there is none", async () => {
    const copied = await as(mess.owner, ctx.post(`${menuUrl(mess.place.id, tomorrow)}/copy`))
      .send({ fromDate: today })
      .expect(200);
    expect(successOf(ownerDailyMenuSchema, copied).data).toMatchObject({
      date: tomorrow,
      status: 'DRAFT',
    });
    const missing = await as(mess.owner, ctx.post(`${menuUrl(mess.place.id, today)}/copy`)).send({
      fromDate: yesterday,
    });
    expect(missing.status).toBe(404);
  });

  it('refuses dates outside the editing window and empty menus', async () => {
    const farAway = dayKey(daysBefore(istDay(new Date()), -60));
    expect((await as(mess.owner, ctx.put(menuUrl(mess.place.id, farAway))).send(MENU)).status).toBe(
      400,
    );
    const empty = { meals: { BREAKFAST: [], LUNCH: [], SNACKS: [], DINNER: [] } };
    expect((await as(mess.owner, ctx.put(menuUrl(mess.place.id, today))).send(empty)).status).toBe(
      400,
    );
    expect(
      (await as(mess.owner, ctx.put(menuUrl(mess.place.id, '2026-02-30'))).send(MENU)).status,
    ).toBe(400);
  });

  it("shows today's menus nearby, saved messes first, and on the student home", async () => {
    const nearby = successOf(
      z.array(messMenuCardSchema),
      await as(
        student,
        ctx.get(`${API}/menus/today?lat=${HERE.latitude}&lng=${HERE.longitude}`),
      ).expect(200),
    ).data;
    const first = nearby[0];
    expect(first?.place.id).toBe(mess.place.id);
    expect(first?.saved).toBe(true);
    expect(first?.place.distanceMeters).toBe(0);

    const home = successOf(
      studentHomeSchema,
      await as(
        student,
        ctx.get(`${API}/me/home?lat=${HERE.latitude}&lng=${HERE.longitude}`),
      ).expect(200),
    ).data;
    expect(home.todaysMenus.map((card) => card.place.id)).toContain(mess.place.id);
    expect(home.saved.map((card) => card.id)).toContain(mess.place.id);
    const room = home.quickActions.find((action) => action.key === 'ROOM');
    expect(room?.kind).toBe('LISTING');
    expect(home.quickActions.every((action) => action.available >= 0)).toBe(true);

    expect((await ctx.get(`${API}/me/home`)).status).toBe(401);
    expect(
      successOf(
        z.array(messMenuCardSchema),
        await ctx.get(`${API}/menus/today?saved=true`).expect(200),
      ).data,
    ).toEqual([]);
  });

  it('lets staff switch a business service off, which hides the menu', async () => {
    const list = await as(
      admin,
      ctx.get(`${API}/admin/place-services?q=${encodeURIComponent(mess.place.name)}`),
    ).expect(200);
    const row = (
      list.body as { data: Array<{ id: string; serviceType: { key: string } }> }
    ).data.find((item) => item.serviceType.key === 'DAILY_MENU');
    expect(row).toBeDefined();
    await as(admin, ctx.patch(`${API}/admin/place-services/${row?.id}`))
      .send({ disabledByAdmin: true, adminNote: 'Checking a complaint' })
      .expect(200);
    expect((await ctx.get(`${API}/places/${mess.place.slug}/menus`)).status).toBe(404);
    const owned = successOf(
      z.array(placeServiceSchema),
      await as(mess.owner, ctx.get(`${API}/business/places/${mess.place.id}/services`)).expect(200),
    ).data.find((service) => service.serviceType.key === 'DAILY_MENU');
    expect(owned).toMatchObject({ disabledByAdmin: true, adminNote: 'Checking a complaint' });
    await as(admin, ctx.patch(`${API}/admin/place-services/${row?.id}`))
      .send({ disabledByAdmin: false })
      .expect(200);
    await ctx.get(`${API}/places/${mess.place.slug}/menus`).expect(200);
  });

  it('lets a moderator take a menu down, but not manage the service catalogue', async () => {
    const menus = successOf(
      z.array(adminDailyMenuSchema),
      await as(moderator, ctx.get(`${API}/admin/menus?date=${today}`)).expect(200),
    ).data;
    const target = menus.find((menu) => menu.place.id === mess.place.id);
    expect(target).toBeDefined();
    const removed = await as(moderator, ctx.post(`${API}/admin/menus/${target?.id}/remove`))
      .send({ reason: 'Contains an offensive dish name' })
      .expect(200);
    expect(successOf(adminDailyMenuSchema, removed).data.status).toBe('REMOVED');
    const publicMenus = successOf(
      placeMenusSchema,
      await ctx.get(`${API}/places/${mess.place.slug}/menus`).expect(200),
    ).data;
    expect(publicMenus.today).toBeNull();

    const ownerView = successOf(
      z.array(ownerDailyMenuSchema),
      await as(mess.owner, ctx.get(`${API}/business/places/${mess.place.id}/menus`)).expect(200),
    ).data.find((menu) => menu.date === today);
    expect(ownerView).toMatchObject({
      status: 'REMOVED',
      removedReason: 'Contains an offensive dish name',
    });

    expect((await as(moderator, ctx.get(`${API}/admin/service-types`))).status).toBe(403);
    const types = successOf(
      z.array(adminServiceTypeSchema),
      await as(admin, ctx.get(`${API}/admin/service-types`)).expect(200),
    ).data;
    expect(types.map((type) => type.key)).toEqual(
      expect.arrayContaining(['ORDER_FOOD', 'DAILY_MENU', 'ROOM']),
    );
  });

  it('lets the owner unpublish and delete a menu', async () => {
    await as(mess.owner, ctx.put(menuUrl(mess.place.id, tomorrow)))
      .send({ ...MENU, publish: true })
      .expect(200);
    const draft = await as(
      mess.owner,
      ctx.post(`${menuUrl(mess.place.id, tomorrow)}/unpublish`),
    ).expect(200);
    expect(successOf(ownerDailyMenuSchema, draft).data.status).toBe('DRAFT');
    await as(mess.owner, ctx.delete(menuUrl(mess.place.id, tomorrow))).expect(200);
    expect((await as(mess.owner, ctx.delete(menuUrl(mess.place.id, tomorrow)))).status).toBe(404);
  });
});
