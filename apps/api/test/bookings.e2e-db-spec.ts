import { randomUUID } from 'node:crypto';
import {
  availabilitySchema,
  bookingSchema,
  businessBookingSchema,
  businessInsightsSchema,
  serviceItemSchema,
  studentHomeSchema,
} from '@platform/contracts';
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
const tomorrow = dayKey(daysBefore(istDay(new Date()), -1));
const everyDay = (openTime: string, closeTime: string) =>
  Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1, openTime, closeTime }));

/** Appointments and study seats: slots, confirmation, full slots and double-booking races. */
describe('Bookings (e2e, real database)', () => {
  let ctx: AuthTestContext;
  let salon: BusinessFixture;
  let library: BusinessFixture;
  let asha: Persona;
  let ravi: Persona;
  let meera: Persona;
  let haircut: string;
  let seat: string;

  const base = (placeId: string) => `${API}/business/places/${placeId}`;
  const slotsOf = async (fixture: BusinessFixture, item: string) =>
    successOf(
      availabilitySchema,
      await ctx
        .get(`${API}/places/${fixture.place.slug}/availability?item=${item}&date=${tomorrow}`)
        .expect(200),
    ).data.slots;
  const book = (who: Persona, itemId: string, startAt: string) =>
    as(who, ctx.post(`${API}/bookings`)).send({ itemId, startAt, idempotencyKey: key() });

  beforeAll(async () => {
    ctx = await createAuthTestContext();
    salon = await businessWithPlace(ctx, 'salon');
    library = await businessWithPlace(ctx, 'library');
    asha = await persona(ctx, 'book-asha');
    ravi = await persona(ctx, 'book-ravi');
    meera = await persona(ctx, 'book-meera');

    await as(salon.owner, ctx.put(`${base(salon.place.id)}/services/APPOINTMENT`))
      .send({ enabled: true, config: { bookingEnabled: true, autoConfirm: false } })
      .expect(200);
    await as(salon.owner, ctx.put(`${base(salon.place.id)}/schedules/APPOINTMENT`))
      .send({ windows: everyDay('09:00', '11:00') })
      .expect(200);
    haircut = successOf(
      serviceItemSchema,
      await as(salon.owner, ctx.post(`${base(salon.place.id)}/items`))
        .send({
          serviceKey: 'APPOINTMENT',
          name: 'Haircut',
          price: 150,
          durationMinutes: 30,
          capacity: 1,
        })
        .expect(201),
    ).data.id;

    await as(library.owner, ctx.put(`${base(library.place.id)}/services/STUDY_SPACE`))
      .send({
        enabled: true,
        config: {
          bookingEnabled: true,
          autoConfirm: true,
          seats: 40,
          pricePerDay: 60,
          facilities: ['AC', 'Wi-Fi'],
        },
      })
      .expect(200);
    await as(library.owner, ctx.put(`${base(library.place.id)}/schedules/STUDY_SPACE`))
      .send({ windows: everyDay('08:00', '22:00') })
      .expect(200);
    seat = successOf(
      serviceItemSchema,
      await as(library.owner, ctx.post(`${base(library.place.id)}/items`))
        .send({
          serviceKey: 'STUDY_SPACE',
          name: 'Day seat',
          price: 60,
          durationMinutes: null,
          capacity: 2,
        })
        .expect(201),
    ).data.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('rejects overlapping opening windows and schedules from another business', async () => {
    const overlap = await as(
      salon.owner,
      ctx.put(`${base(salon.place.id)}/schedules/APPOINTMENT`),
    ).send({
      windows: [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '12:00' },
        { dayOfWeek: 1, openTime: '11:00', closeTime: '13:00' },
      ],
    });
    expect(overlap.status).toBe(400);
    expect(
      (
        await as(library.owner, ctx.put(`${base(salon.place.id)}/schedules/APPOINTMENT`)).send({
          windows: [],
        })
      ).status,
    ).toBe(404);
  });

  it('lays out half-hour slots and books one for confirmation', async () => {
    const slots = await slotsOf(salon, haircut);
    expect(slots).toHaveLength(4); // 09:00 09:30 10:00 10:30
    expect(slots.every((slot) => slot.remaining === 1)).toBe(true);
    const first = slots[0]!.startAt;

    const booked = successOf(bookingSchema, await book(asha, haircut, first).expect(201)).data;
    expect(booked).toMatchObject({
      status: 'PENDING',
      itemName: 'Haircut',
      price: 150,
      wholeDay: false,
      cancellable: true,
    });
    expect((await slotsOf(salon, haircut))[0]?.remaining).toBe(0);

    const full = await book(ravi, haircut, first);
    expect(full.status).toBe(409);
    expect(errorOf(full).error.code).toBe('SLOT_FULL');
    expect((await book(asha, haircut, first)).status).toBe(409);
    expect((await book(asha, haircut, '2026-01-01T03:30:00.000Z')).status).toBe(400);

    const list = successOf(
      businessBookingSchema.array(),
      await as(salon.owner, ctx.get(`${API}/business/bookings`)).expect(200),
    ).data;
    const mine = list.find((item) => item.id === booked.id);
    expect(mine?.nextStatuses).toEqual(['CONFIRMED', 'CANCELLED']);
    await as(salon.owner, ctx.patch(`${API}/business/bookings/${booked.id}/status`))
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(
      (
        await as(library.owner, ctx.patch(`${API}/business/bookings/${booked.id}/status`)).send({
          status: 'COMPLETED',
        })
      ).status,
    ).toBe(404);
    const note = await ctx.db.notification.findFirst({
      where: { userId: asha.userId, type: 'booking.confirmed' },
    });
    expect(note?.title).toContain('Haircut');
  });

  it('gives the last seat to exactly one of two simultaneous requests', async () => {
    const slot = (await slotsOf(salon, haircut))[2]!.startAt;
    const [a, b] = await Promise.all([book(ravi, haircut, slot), book(meera, haircut, slot)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await ctx.db.booking.count({
        where: {
          serviceItemId: haircut,
          startAt: new Date(slot),
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
    ).toBe(1);
  });

  it('frees the seat when the student cancels', async () => {
    const slot = (await slotsOf(salon, haircut))[3]!.startAt;
    const booked = successOf(bookingSchema, await book(ravi, haircut, slot).expect(201)).data;
    expect((await as(meera, ctx.post(`${API}/me/bookings/${booked.id}/cancel`))).status).toBe(404);
    await as(ravi, ctx.post(`${API}/me/bookings/${booked.id}/cancel`)).expect(200);
    await book(meera, haircut, slot).expect(201);
  });

  it('books whole-day study seats up to the seats there are', async () => {
    const [day] = await slotsOf(library, seat);
    expect(day?.remaining).toBe(2);
    const booked = successOf(bookingSchema, await book(asha, seat, day!.startAt).expect(201)).data;
    expect(booked).toMatchObject({ status: 'CONFIRMED', wholeDay: true });
    await book(ravi, seat, day!.startAt).expect(201);
    const third = await book(meera, seat, day!.startAt);
    expect(errorOf(third).error.code).toBe('SLOT_FULL');
  });

  it('refuses bookings when the place takes them in person only', async () => {
    await as(library.owner, ctx.put(`${base(library.place.id)}/services/STUDY_SPACE`))
      .send({ config: { bookingEnabled: false } })
      .expect(200);
    const [day] = await slotsOf(library, seat);
    const refused = await book(meera, seat, day!.startAt);
    expect(errorOf(refused).error.code).toBe('SERVICE_UNAVAILABLE_NOW');
    await as(library.owner, ctx.put(`${base(library.place.id)}/services/STUDY_SPACE`))
      .send({ config: { bookingEnabled: true } })
      .expect(200);
  });

  it('shows upcoming bookings on the home screen and in the dashboard numbers', async () => {
    const home = successOf(
      studentHomeSchema,
      await as(asha, ctx.get(`${API}/me/home`)).expect(200),
    ).data;
    expect(home.upcomingBookings.map((item) => item.itemName)).toEqual(
      expect.arrayContaining(['Haircut', 'Day seat']),
    );
    const numbers = successOf(
      businessInsightsSchema,
      await as(salon.owner, ctx.get(`${API}/business/insights`)).expect(200),
    ).data;
    expect(numbers.bookings).toBeGreaterThanOrEqual(3);
    expect(numbers.upcomingBookings).toBeGreaterThanOrEqual(2);
  });
});
