import { z } from 'zod';

/** `GET /api/v1/health` */
export const healthSchema = z.object({
  status: z.literal('ok'),
});
export type Health = z.infer<typeof healthSchema>;

/** `GET /api/v1/health/database` */
export const databaseHealthSchema = z.object({
  status: z.literal('ok'),
  database: z.string(),
  serverVersion: z.string(),
});
export type DatabaseHealth = z.infer<typeof databaseHealthSchema>;
