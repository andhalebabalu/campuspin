import {
  adminDailyMenuSchema,
  adminPlaceServiceSchema,
  adminServiceTypeSchema,
  messMenuCardSchema,
  ownerDailyMenuSchema,
  placeCardSchema,
  placeMenusSchema,
  placeServiceSchema,
  placeServicesSchema,
  serviceTypeSchema,
  studentHomeSchema,
  type AdminUpdatePlaceServiceRequest,
  type CreateServiceTypeRequest,
  type MenuStatus,
  type SaveDailyMenuRequest,
  type UpdatePlaceServiceRequest,
  type UpdateServiceTypeRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

export interface Point {
  lat: number;
  lng: number;
}

const enc = encodeURIComponent;
const placeBase = (placeId: string) => `/business/places/${enc(placeId)}`;

/** Daily-use services: quick actions, place services, mess menus (student, owner and staff calls). */
export const servicesService = {
  // ── Students and guests ─────────────────────────────────────────────────────────────────────────
  types: (signal?: AbortSignal) =>
    apiClient.get('/service-types', { schema: z.array(serviceTypeSchema), signal }),

  typePlaces: (key: string, params: Partial<Point> & { page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get(`/service-types/${enc(key)}/places`, {
      query: { ...params },
      schema: z.array(placeCardSchema),
      signal,
    }),

  placeServices: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/places/${enc(idOrSlug)}/services`, { schema: placeServicesSchema, signal }),

  placeMenus: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/places/${enc(idOrSlug)}/menus`, { schema: placeMenusSchema, signal }),

  todaysMenus: (params: Partial<Point> & { saved?: boolean } = {}, signal?: AbortSignal) =>
    apiClient.get('/menus/today', {
      query: { lat: params.lat, lng: params.lng, saved: params.saved ? 'true' : undefined },
      schema: z.array(messMenuCardSchema),
      signal,
    }),

  home: (point: Point | null, signal?: AbortSignal) =>
    apiClient.get('/me/home', { query: { ...point }, schema: studentHomeSchema, signal }),

  // ── Business owner ──────────────────────────────────────────────────────────────────────────────
  ownerServices: (placeId: string, signal?: AbortSignal) =>
    apiClient.get(`${placeBase(placeId)}/services`, { schema: z.array(placeServiceSchema), signal }),

  updateOwnerService: (placeId: string, key: string, dto: UpdatePlaceServiceRequest) =>
    apiClient.put(`${placeBase(placeId)}/services/${enc(key)}`, { body: dto, schema: placeServiceSchema }),

  ownerMenus: (placeId: string, range: { from?: string; to?: string } = {}, signal?: AbortSignal) =>
    apiClient.get(`${placeBase(placeId)}/menus`, {
      query: { ...range },
      schema: z.array(ownerDailyMenuSchema),
      signal,
    }),

  saveMenu: (placeId: string, date: string, dto: SaveDailyMenuRequest) =>
    apiClient.put(`${placeBase(placeId)}/menus/${date}`, { body: dto, schema: ownerDailyMenuSchema }),

  publishMenu: (placeId: string, date: string) =>
    apiClient.post(`${placeBase(placeId)}/menus/${date}/publish`, { schema: ownerDailyMenuSchema }),

  unpublishMenu: (placeId: string, date: string) =>
    apiClient.post(`${placeBase(placeId)}/menus/${date}/unpublish`, { schema: ownerDailyMenuSchema }),

  copyMenu: (placeId: string, date: string, fromDate: string) =>
    apiClient.post(`${placeBase(placeId)}/menus/${date}/copy`, {
      body: { fromDate },
      schema: ownerDailyMenuSchema,
    }),

  deleteMenu: (placeId: string, date: string) =>
    apiClient.delete(`${placeBase(placeId)}/menus/${date}`),

  // ── Staff ───────────────────────────────────────────────────────────────────────────────────────
  adminTypes: (signal?: AbortSignal) =>
    apiClient.get('/admin/service-types', { schema: z.array(adminServiceTypeSchema), signal }),

  createType: (dto: CreateServiceTypeRequest) =>
    apiClient.post('/admin/service-types', { body: dto, schema: adminServiceTypeSchema }),

  updateType: (id: string, dto: UpdateServiceTypeRequest) =>
    apiClient.patch(`/admin/service-types/${enc(id)}`, { body: dto, schema: adminServiceTypeSchema }),

  adminPlaceServices: (
    params: { serviceType?: string; q?: string; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/admin/place-services', {
      query: { ...params },
      schema: z.array(adminPlaceServiceSchema),
      signal,
    }),

  adminUpdatePlaceService: (id: string, dto: AdminUpdatePlaceServiceRequest) =>
    apiClient.patch(`/admin/place-services/${enc(id)}`, { body: dto, schema: adminPlaceServiceSchema }),

  adminMenus: (params: { date?: string; status?: MenuStatus; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/admin/menus', { query: { ...params }, schema: z.array(adminDailyMenuSchema), signal }),

  adminRemoveMenu: (id: string, reason: string) =>
    apiClient.post(`/admin/menus/${enc(id)}/remove`, { body: { reason }, schema: adminDailyMenuSchema }),

  adminRestoreMenu: (id: string) =>
    apiClient.post(`/admin/menus/${enc(id)}/restore`, { schema: adminDailyMenuSchema }),
};
