import {
  businessDashboardSchema,
  businessLeadSchema,
  businessListingSchema,
  businessProfileSchema,
  businessReviewSchema,
  placeSubmissionSchema,
  type CreateSubmissionRequest,
  type LeadStatus,
  type UpdateBusinessProfileRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const listingListSchema = z.array(businessListingSchema);
const leadListSchema = z.array(businessLeadSchema);
const reviewListSchema = z.array(businessReviewSchema);

/** The business owner's dashboard (`/business/*`). Every call needs a BUSINESS_OWNER session. */
export const businessService = {
  dashboard: (signal?: AbortSignal) =>
    apiClient.get('/business/dashboard', { schema: businessDashboardSchema, signal }),

  updateProfile: (dto: UpdateBusinessProfileRequest) =>
    apiClient.patch('/business/profile', { body: dto, schema: businessProfileSchema }),

  listings: (signal?: AbortSignal) =>
    apiClient.get('/business/listings', { schema: listingListSchema, signal }),

  /** Same body and `409 DUPLICATE_PLACE_SUSPECTED` behaviour as `POST /place-submissions`. */
  createListing: (dto: CreateSubmissionRequest) =>
    apiClient.post('/business/listings', { body: dto, schema: placeSubmissionSchema }),

  enquiries: (
    params: { status?: LeadStatus; placeId?: string; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/business/enquiries', { query: { ...params }, schema: leadListSchema, signal }),

  updateEnquiry: (id: string, status: LeadStatus) =>
    apiClient.patch(`/business/enquiries/${encodeURIComponent(id)}`, {
      body: { status },
      schema: businessLeadSchema,
    }),

  reviews: (params: { placeId?: string; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/business/reviews', { query: { ...params }, schema: reviewListSchema, signal }),
};
