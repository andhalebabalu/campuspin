import type { PageMeta } from '@platform/contracts';

/**
 * What a list endpoint returns. The response interceptor sees this type and renders the standard
 * list envelope, `{ success, data: items, message, meta }`, so controllers never build `meta` by
 * hand and every list in the API is paginated the same way.
 */
export class Paginated<T> {
  private constructor(
    readonly items: readonly T[],
    readonly meta: PageMeta,
  ) {}

  static of<T>(
    items: readonly T[],
    page: { page: number; limit: number; total: number },
  ): Paginated<T> {
    return new Paginated(items, {
      page: page.page,
      limit: page.limit,
      total: page.total,
      totalPages: Math.ceil(page.total / page.limit),
    });
  }
}

/** `skip` / `take` for a database query from 1-based `page` and `limit`. */
export function pageWindow(page: { page: number; limit: number }): { skip: number; take: number } {
  return { skip: (page.page - 1) * page.limit, take: page.limit };
}
