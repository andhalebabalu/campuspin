import {
  adminOfferSchema,
  businessRedemptionSchema,
  businessServiceRequestSchema,
  ownerOfferSchema,
  ownerTableRequestTypeSchema,
  redemptionSchema,
  serviceRequestSchema,
  studentOfferSchema,
  type CreateOfferRequest,
  type CreateServiceRequest,
  type OfferStatus,
  type RequestStatus,
  type SaveTableRequestTypeRequest,
  type UpdateOfferRequest,
  type UpdateTableRequestTypeRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const enc = encodeURIComponent;
const typeList = z.array(ownerTableRequestTypeSchema);

/** Student offers and service requests (table requests, jobs): student, owner and staff calls. */
export const engagementService = {
  // ── Offers ──────────────────────────────────────────────────────────────────────────────────────
  nearbyOffers: (point: { lat?: number; lng?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/offers/nearby', {
      query: { ...point },
      schema: z.array(studentOfferSchema),
      signal,
    }),

  redeem: (offerId: string) =>
    apiClient.post(`/offers/${enc(offerId)}/redeem`, { schema: redemptionSchema }),

  myRedemptions: (page = 1, signal?: AbortSignal) =>
    apiClient.get('/me/redemptions', {
      query: { page },
      schema: z.array(redemptionSchema),
      signal,
    }),

  ownerOffers: (signal?: AbortSignal) =>
    apiClient.get('/business/offers', { schema: z.array(ownerOfferSchema), signal }),

  createOffer: (dto: CreateOfferRequest) =>
    apiClient.post('/business/offers', { body: dto, schema: ownerOfferSchema }),

  updateOffer: (id: string, dto: UpdateOfferRequest) =>
    apiClient.patch(`/business/offers/${enc(id)}`, { body: dto, schema: ownerOfferSchema }),

  verifyCode: (code: string) =>
    apiClient.post('/business/redemptions/verify', {
      body: { code },
      schema: businessRedemptionSchema,
    }),

  businessRedemptions: (page = 1, signal?: AbortSignal) =>
    apiClient.get('/business/redemptions', {
      query: { page },
      schema: z.array(businessRedemptionSchema),
      signal,
    }),

  adminOffers: (
    params: { q?: string; status?: OfferStatus; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/admin/offers', {
      query: { ...params },
      schema: z.array(adminOfferSchema),
      signal,
    }),

  adminRemoveOffer: (id: string, reason: string) =>
    apiClient.post(`/admin/offers/${enc(id)}/remove`, {
      body: { reason },
      schema: adminOfferSchema,
    }),

  adminRestoreOffer: (id: string) =>
    apiClient.post(`/admin/offers/${enc(id)}/restore`, { schema: adminOfferSchema }),

  // ── Requests ────────────────────────────────────────────────────────────────────────────────────
  sendRequest: (dto: CreateServiceRequest) =>
    apiClient.post('/service-requests', { body: dto, schema: serviceRequestSchema }),

  myRequests: (params: { active?: boolean; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/me/service-requests', {
      query: { page: params.page, active: params.active ? 'true' : undefined },
      schema: z.array(serviceRequestSchema),
      signal,
    }),

  myRequest: (id: string, signal?: AbortSignal) =>
    apiClient.get(`/me/service-requests/${enc(id)}`, { schema: serviceRequestSchema, signal }),

  cancelRequest: (id: string) =>
    apiClient.post(`/me/service-requests/${enc(id)}/cancel`, { schema: serviceRequestSchema }),

  approveEstimate: (id: string) =>
    apiClient.post(`/me/service-requests/${enc(id)}/approve`, { schema: serviceRequestSchema }),

  businessRequests: (
    params: { scope?: 'active' | 'today' | 'all'; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/business/requests', {
      query: { ...params },
      schema: z.array(businessServiceRequestSchema),
      signal,
    }),

  updateRequest: (
    id: string,
    dto: { status: RequestStatus; reason?: string; estimateAmount?: number; estimateNote?: string },
  ) =>
    apiClient.patch(`/business/requests/${enc(id)}/status`, {
      body: dto,
      schema: businessServiceRequestSchema,
    }),

  requestTypes: (placeId: string, signal?: AbortSignal) =>
    apiClient.get(`/business/places/${enc(placeId)}/request-types`, { schema: typeList, signal }),

  addRequestType: (placeId: string, dto: SaveTableRequestTypeRequest) =>
    apiClient.post(`/business/places/${enc(placeId)}/request-types`, {
      body: dto,
      schema: typeList,
    }),

  updateRequestType: (placeId: string, typeId: string, dto: UpdateTableRequestTypeRequest) =>
    apiClient.patch(`/business/places/${enc(placeId)}/request-types/${enc(typeId)}`, {
      body: dto,
      schema: typeList,
    }),

  deleteRequestType: (placeId: string, typeId: string) =>
    apiClient.delete(`/business/places/${enc(placeId)}/request-types/${enc(typeId)}`, {
      schema: typeList,
    }),

  adminRequests: (params: { q?: string; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/admin/service-requests', {
      query: { ...params },
      schema: z.array(businessServiceRequestSchema),
      signal,
    }),
};
