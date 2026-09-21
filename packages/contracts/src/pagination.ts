import { z } from 'zod';

/** The largest page any list endpoint serves. Bigger requests are rejected, never silently clamped. */
export const PAGE_LIMIT_MAX = 50;
export const PAGE_LIMIT_DEFAULT = 20;

/**
 * `?page=&limit=` for every list endpoint. Query strings arrive as text, so numbers are coerced;
 * `limit` above the maximum is a `400 VALIDATION_ERROR`, so a client learns the rule instead of
 * being quietly given fewer rows than it asked for.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type PaginationQuery = z.output<typeof paginationQuerySchema>;
