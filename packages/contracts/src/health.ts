import { z } from 'zod';

/**
 * `GET /api/v1/health`
 * `status` describes the API process; `database` reports whether MySQL currently answers. A
 * stopped database does not turn the API "down": it is reported, not treated as a failure.
 */
export const healthSchema = z.object({
  status: z.literal('ok'),
  database: z.enum(['connected', 'unavailable']),
});
export type Health = z.infer<typeof healthSchema>;

/** `GET /api/v1/health/database`: detailed database readiness (503 when unusable). */
export const databaseHealthSchema = z.object({
  status: z.literal('ok'),
  database: z.string(),
  serverVersion: z.string(),
});
export type DatabaseHealth = z.infer<typeof databaseHealthSchema>;
