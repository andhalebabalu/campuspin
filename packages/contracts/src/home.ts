import { z } from 'zod';
import { bookingSchema } from './bookings.js';
import { studentOfferSchema } from './offers.js';
import { orderSchema } from './orders.js';
import { serviceRequestSchema } from './requests.js';
import { placeCardSchema } from './places.js';
import { messMenuCardSchema, quickActionSchema } from './services.js';

/** `GET /me/home`: the student's daily dashboard in one call. */
export const studentHomeQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: 'Send both lat and lng, or neither',
  });
export type StudentHomeQuery = z.output<typeof studentHomeQuerySchema>;

export const studentHomeSchema = z.object({
  quickActions: z.array(quickActionSchema),
  /** Orders still in progress, newest first. */
  activeOrders: z.array(orderSchema),
  /** Bookings still ahead (confirmed or waiting), soonest first. */
  upcomingBookings: z.array(bookingSchema),
  /** Requests still open (table requests, repairs). */
  activeRequests: z.array(serviceRequestSchema),
  /** Live offers nearby (or best), usable today. */
  nearbyOffers: z.array(studentOfferSchema),
  /** Published menus for today: saved messes first, then the nearest. */
  todaysMenus: z.array(messMenuCardSchema),
  saved: z.array(placeCardSchema),
  /** Places the student recently ordered from, most recent first. */
  recentPlaces: z.array(placeCardSchema),
});
export type StudentHome = z.infer<typeof studentHomeSchema>;
