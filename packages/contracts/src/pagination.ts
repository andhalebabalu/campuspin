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

/**
 * `?cursor=&limit=` for feeds and message threads, where new rows arrive all the time and page
 * numbers would skip or repeat them. The cursor is opaque to clients: pass back `nextCursor`.
 */
export const cursorQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type CursorQuery = z.output<typeof cursorQuerySchema>;

/** A cursor page: `nextCursor` is null on the last page. */
export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
