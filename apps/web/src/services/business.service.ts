import {
  businessAnalyticsSchema,
  businessDashboardSchema,
  businessLeadSchema,
  businessListingSchema,
  businessProfileSchema,
  businessReviewSchema,
  ownedPlaceSchema,
  placeSubmissionSchema,
  publicBusinessSchema,
  type AddPlaceImageRequest,
  type BusinessEventType,
  type CreateSubmissionRequest,
  type LeadStatus,
  type UpdateBusinessProfileRequest,
  type UpdateOwnedPlaceRequest,
  type UpdatePlaceImageRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const enc = encodeURIComponent;
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

  analytics: (days: 7 | 30 | 90, signal?: AbortSignal) =>
    apiClient.get('/business/analytics', {
      query: { days: String(days) },
      schema: businessAnalyticsSchema,
      signal,
    }),

  place: (placeId: string, signal?: AbortSignal) =>
    apiClient.get(`/business/places/${enc(placeId)}`, { schema: ownedPlaceSchema, signal }),

  updatePlace: (placeId: string, dto: UpdateOwnedPlaceRequest) =>
    apiClient.patch(`/business/places/${enc(placeId)}`, { body: dto, schema: ownedPlaceSchema }),

  addPhoto: (placeId: string, dto: AddPlaceImageRequest) =>
    apiClient.post(`/business/places/${enc(placeId)}/images`, {
      body: dto,
      schema: ownedPlaceSchema,
    }),

  updatePhoto: (placeId: string, imageId: string, dto: UpdatePlaceImageRequest) =>
    apiClient.patch(`/business/places/${enc(placeId)}/images/${enc(imageId)}`, {
      body: dto,
      schema: ownedPlaceSchema,
    }),

  removePhoto: (placeId: string, imageId: string) =>
    apiClient.delete(`/business/places/${enc(placeId)}/images/${enc(imageId)}`, {
      schema: ownedPlaceSchema,
    }),
};

/** The public business page: `/business/<slug>` on the web. */
export const businessPagesService = {
  /** `GET /businesses/:slug`: 404 unless the page is live. Cached briefly, like place pages. */
  get: (slug: string, signal?: AbortSignal) =>
    apiClient.get(`/businesses/${enc(slug)}`, {
      schema: publicBusinessSchema,
      signal,
      init: { next: { revalidate: 60, tags: [`business:${slug}`] } },
    }),

  /** Fire and forget: a lost count never gets in the visitor's way. */
  track: (slug: string, type: BusinessEventType, placeId?: string) =>
    apiClient
      .post(`/businesses/${enc(slug)}/events`, { body: { type, ...(placeId ? { placeId } : {}) } })
      .catch(() => undefined),
};
