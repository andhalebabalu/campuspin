import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { singleLineField, uuidSchema } from './text.js';

/**
 * Reusable bookings: appointments (salon, clinic, repair drop-off), study seats, courts. A place
 * sets opening windows per weekday; each bookable item has a slot length (or a whole day) and a
 * capacity per slot. The server generates the slots and keeps a seat from being booked twice.
 */

export const BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  PENDING: 'Waiting for confirmation',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Missed',
};

/** How far ahead a slot can be booked. */
export const BOOKING_DAYS_AHEAD = 30;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24 h)');

export const scheduleWindowSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  openTime: z.string(),
  closeTime: z.string(),
});
export type ScheduleWindow = z.infer<typeof scheduleWindowSchema>;

/** `PUT /business/places/:placeId/schedules/:key`: replaces the weekly windows of a service. */
export const saveScheduleSchema = z.strictObject({
  windows: z
    .array(
      z
        .strictObject({
          dayOfWeek: z.number().int().min(1).max(7),
          openTime: time,
          closeTime: time,
        })
        .refine((value) => value.openTime < value.closeTime, {
          message: 'Closes before it opens',
          path: ['closeTime'],
        }),
    )
    .max(28),
});
export type SaveScheduleRequest = z.output<typeof saveScheduleSchema>;

export const availabilityQuerySchema = z.object({
  item: uuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});
export type AvailabilityQuery = z.output<typeof availabilityQuerySchema>;

export const slotSchema = z.object({
  startAt: z.string(),
  endAt: z.string(),
  /** Seats (or chairs) still free. 0 = full. */
  remaining: z.number().int().min(0),
});
export type Slot = z.infer<typeof slotSchema>;

export const availabilitySchema = z.object({
  date: z.string(),
  item: z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().int(),
    durationMinutes: z.number().int().nullable(),
    capacity: z.number().int(),
  }),
  slots: z.array(slotSchema),
});
export type Availability = z.infer<typeof availabilitySchema>;

/** `POST /bookings`: the item and one of the slots from `availability`. The price comes from the item. */
export const createBookingSchema = z.strictObject({
  itemId: uuidSchema,
  startAt: z.iso.datetime(),
  note: singleLineField('Note', 300).optional(),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type CreateBookingRequest = z.output<typeof createBookingSchema>;

export const bookingSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: bookingStatusSchema,
  statusLabel: z.string(),
  place: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  service: z.object({ key: z.string(), name: z.string() }),
  itemName: z.string(),
  date: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  /** Whole-day bookings (study seats) have no time of day. */
  wholeDay: z.boolean(),
  seatNo: z.number().int(),
  price: z.number().int(),
  note: z.string().nullable(),
  statusReason: z.string().nullable(),
  cancellable: z.boolean(),
  createdAt: z.string(),
});
export type Booking = z.infer<typeof bookingSchema>;

export const businessBookingSchema = bookingSchema.extend({
  student: z.object({ name: z.string() }),
  nextStatuses: z.array(bookingStatusSchema),
});
export type BusinessBooking = z.infer<typeof businessBookingSchema>;

export const listMyBookingsQuerySchema = paginationQuerySchema.extend({
  upcoming: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListMyBookingsQuery = z.output<typeof listMyBookingsQuerySchema>;

export const listBusinessBookingsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['upcoming', 'today', 'all']).default('upcoming'),
  placeId: uuidSchema.optional(),
});
export type ListBusinessBookingsQuery = z.output<typeof listBusinessBookingsQuerySchema>;

export const updateBookingStatusSchema = z.strictObject({
  status: bookingStatusSchema,
  reason: singleLineField('Reason', 255).optional(),
});
export type UpdateBookingStatusRequest = z.output<typeof updateBookingStatusSchema>;
