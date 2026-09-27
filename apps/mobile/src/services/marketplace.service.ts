import {
  conversationSchema,
  listingCardSchema,
  listingQuotaSchema,
  listingSchema,
  reportReceiptSchema,
  type CreateListingRequest,
  type ListingCategory,
  type ListingCondition,
  type ListingSellerAction,
  type ListingStatus,
  type MarketplaceReportRequest,
  type MarketplaceScope,
  type MarketplaceSort,
  type UpdateListingRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const id = (value: string) => encodeURIComponent(value);

export interface BrowseParams {
  page?: number;
  scope?: MarketplaceScope;
  q?: string;
  category?: ListingCategory;
  condition?: ListingCondition;
  minPrice?: number;
  maxPrice?: number;
  sort?: MarketplaceSort;
}

/** The student marketplace (verified students only). */
export const marketplaceService = {
  browse: (params: BrowseParams, signal?: AbortSignal) =>
    apiClient.get('/marketplace/listings', {
      query: { ...params },
      schema: z.array(listingCardSchema),
      signal,
    }),
  listing: (listingId: string, signal?: AbortSignal) =>
    apiClient.get(`/marketplace/listings/${id(listingId)}`, {
      schema: listingSchema,
      signal,
    }),
  mine: (params: { page?: number; status?: ListingStatus }, signal?: AbortSignal) =>
    apiClient.get('/me/listings', {
      query: { ...params },
      schema: z.array(listingCardSchema),
      signal,
    }),
  /** My free listings and credits: what the next listing costs. */
  quota: (signal?: AbortSignal) =>
    apiClient.get('/me/listing-quota', { schema: listingQuotaSchema, signal }),
  create: (dto: CreateListingRequest) =>
    apiClient.post('/marketplace/listings', { body: dto, schema: listingSchema }),
  update: (listingId: string, dto: UpdateListingRequest) =>
    apiClient.patch(`/marketplace/listings/${id(listingId)}`, { body: dto, schema: listingSchema }),
  act: (listingId: string, action: ListingSellerAction) =>
    apiClient.post(`/marketplace/listings/${id(listingId)}/actions`, {
      body: { action },
      schema: listingSchema,
    }),
  remove: (listingId: string) =>
    apiClient.delete(`/marketplace/listings/${id(listingId)}`, { schema: z.null() }),
  report: (listingId: string, dto: MarketplaceReportRequest) =>
    apiClient.post(`/marketplace/listings/${id(listingId)}/report`, {
      body: dto,
      schema: reportReceiptSchema,
    }),
  message: (listingId: string, message: string) =>
    apiClient.post(`/marketplace/listings/${id(listingId)}/conversations`, {
      body: { message },
      schema: conversationSchema,
    }),
};
