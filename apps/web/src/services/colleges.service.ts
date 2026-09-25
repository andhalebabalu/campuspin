import {
  collegeCardSchema,
  collegeDetailSchema,
  collegeFacetsSchema,
  collegeNearbySchema,
  type COLLEGE_SORTS,
  type CollegeManagement,
  type CollegeStream,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

export interface CollegeListParams {
  q?: string;
  city?: string;
  /** Any of these streams. */
  stream?: readonly CollegeStream[];
  /** Any of these management types. */
  management?: readonly CollegeManagement[];
  sort?: (typeof COLLEGE_SORTS)[number];
  page?: number;
  limit?: number;
}

const collegeListSchema = z.array(collegeCardSchema);

export const collegesService = {
  /** `GET /colleges`: active colleges as cards, paginated (public, cacheable). */
  list: ({ stream, management, ...params }: CollegeListParams = {}, signal?: AbortSignal) =>
    apiClient.get('/colleges', {
      query: {
        ...params,
        // Empty lists are left out entirely (the client skips '' values).
        stream: stream?.length ? stream.join(',') : undefined,
        management: management?.length ? management.join(',') : undefined,
      },
      schema: collegeListSchema,
      signal,
      init: { next: { revalidate: 60 } },
    }),

  /** `GET /colleges/facets`: counts for the directory's filters and header (public, cacheable). */
  facets: (signal?: AbortSignal) =>
    apiClient.get('/colleges/facets', {
      schema: collegeFacetsSchema,
      signal,
      init: { next: { revalidate: 300 } },
    }),

  /** `GET /colleges/:idOrSlug`: one active college with its images (public, cacheable). */
  getBySlug: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/colleges/${encodeURIComponent(idOrSlug)}`, {
      schema: collegeDetailSchema,
      signal,
      init: { next: { revalidate: 300, tags: [`college:${idOrSlug}`] } },
    }),

  /** `GET /colleges/:idOrSlug/nearby`: what is around the college, by category (public, cacheable). */
  nearby: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/colleges/${encodeURIComponent(idOrSlug)}/nearby`, {
      schema: collegeNearbySchema,
      signal,
      init: { next: { revalidate: 300, tags: [`college:${idOrSlug}`] } },
    }),
};
