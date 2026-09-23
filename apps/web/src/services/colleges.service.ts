import { collegeCardSchema, collegeDetailSchema, type COLLEGE_SORTS } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

export interface CollegeListParams {
  q?: string;
  city?: string;
  sort?: (typeof COLLEGE_SORTS)[number];
  page?: number;
  limit?: number;
}

const collegeListSchema = z.array(collegeCardSchema);

export const collegesService = {
  /** `GET /colleges`: active colleges as cards, paginated (public, cacheable). */
  list: (params: CollegeListParams = {}, signal?: AbortSignal) =>
    apiClient.get('/colleges', {
      query: { ...params },
      schema: collegeListSchema,
      signal,
      init: { next: { revalidate: 60 } },
    }),

  /** `GET /colleges/:idOrSlug`: one active college with its images (public, cacheable). */
  getBySlug: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/colleges/${encodeURIComponent(idOrSlug)}`, {
      schema: collegeDetailSchema,
      signal,
      init: { next: { revalidate: 300, tags: [`college:${idOrSlug}`] } },
    }),
};
