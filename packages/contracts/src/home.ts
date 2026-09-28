import { z } from 'zod';
import { orderSchema } from './orders.js';
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
  /** Published menus for today: saved messes first, then the nearest. */
  todaysMenus: z.array(messMenuCardSchema),
  saved: z.array(placeCardSchema),
  /** Places the student recently ordered from, most recent first. */
  recentPlaces: z.array(placeCardSchema),
});
export type StudentHome = z.infer<typeof studentHomeSchema>;
