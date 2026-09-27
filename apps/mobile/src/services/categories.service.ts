import { categoryGroupSchema } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const categoryGroupListSchema = z.array(categoryGroupSchema);

export const categoriesService = {
  /** `GET /categories`: the two-level tree (public, cacheable) — groups with their active children. */
  list: (signal?: AbortSignal) =>
    apiClient.get('/categories', {
      schema: categoryGroupListSchema,
      signal,
    }),
};
