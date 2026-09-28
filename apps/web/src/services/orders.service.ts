import {
  adminQrCodeSchema,
  businessInsightsSchema,
  businessOrderSchema,
  orderSchema,
  ownerQrCodeSchema,
  placeTableSchema,
  qrResolutionSchema,
  serviceItemSchema,
  type CreateFoodOrderRequest,
  type CreateQrRequest,
  type CreateTablesRequest,
  type InsightRange,
  type OrderKind,
  type OrderStatus,
  type SaveServiceItemRequest,
  type UpdateServiceItemRequest,
  type UpdateTableRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const enc = encodeURIComponent;
const placeBase = (placeId: string) => `/business/places/${enc(placeId)}`;
const tableList = z.array(placeTableSchema);

/** Orders, tables, QR codes and the price list (student, owner and staff calls). */
export const ordersService = {
  // ── Students and guests ─────────────────────────────────────────────────────────────────────────
  resolveQr: (token: string, signal?: AbortSignal) =>
    apiClient.get(`/qr/${enc(token)}`, { schema: qrResolutionSchema, signal }),

  recordView: (idOrSlug: string) =>
    apiClient.post(`/places/${enc(idOrSlug)}/view`).catch(() => undefined),

  placeFoodOrder: (dto: CreateFoodOrderRequest) =>
    apiClient.post('/orders', { body: dto, schema: orderSchema }),

  myOrders: (
    params: { kind?: OrderKind; active?: boolean; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/me/orders', {
      query: { kind: params.kind, page: params.page, active: params.active ? 'true' : undefined },
      schema: z.array(orderSchema),
      signal,
    }),

  myOrder: (id: string, signal?: AbortSignal) =>
    apiClient.get(`/me/orders/${enc(id)}`, { schema: orderSchema, signal }),

  cancelMine: (id: string) =>
    apiClient.post(`/me/orders/${enc(id)}/cancel`, { schema: orderSchema }),

  // ── Business owner ──────────────────────────────────────────────────────────────────────────────
  businessOrders: (
    params: { scope?: 'active' | 'today' | 'all'; placeId?: string; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/business/orders', {
      query: { ...params },
      schema: z.array(businessOrderSchema),
      signal,
    }),

  updateStatus: (id: string, status: OrderStatus, reason?: string) =>
    apiClient.patch(`/business/orders/${enc(id)}/status`, {
      body: { status, ...(reason ? { reason } : {}) },
      schema: businessOrderSchema,
    }),

  insights: (range: InsightRange, signal?: AbortSignal) =>
    apiClient.get('/business/insights', {
      query: { range },
      schema: businessInsightsSchema,
      signal,
    }),

  items: (placeId: string, service?: string, signal?: AbortSignal) =>
    apiClient.get(`${placeBase(placeId)}/items`, {
      query: { service },
      schema: z.array(serviceItemSchema),
      signal,
    }),

  addItem: (placeId: string, dto: SaveServiceItemRequest) =>
    apiClient.post(`${placeBase(placeId)}/items`, { body: dto, schema: serviceItemSchema }),

  updateItem: (placeId: string, itemId: string, dto: UpdateServiceItemRequest) =>
    apiClient.patch(`${placeBase(placeId)}/items/${enc(itemId)}`, {
      body: dto,
      schema: serviceItemSchema,
    }),

  deleteItem: (placeId: string, itemId: string) =>
    apiClient.delete(`${placeBase(placeId)}/items/${enc(itemId)}`),

  tables: (placeId: string, signal?: AbortSignal) =>
    apiClient.get(`${placeBase(placeId)}/tables`, { schema: tableList, signal }),

  addTables: (placeId: string, dto: CreateTablesRequest) =>
    apiClient.post(`${placeBase(placeId)}/tables`, { body: dto, schema: tableList }),

  updateTable: (placeId: string, tableId: string, dto: UpdateTableRequest) =>
    apiClient.patch(`${placeBase(placeId)}/tables/${enc(tableId)}`, {
      body: dto,
      schema: tableList,
    }),

  deleteTable: (placeId: string, tableId: string) =>
    apiClient.delete(`${placeBase(placeId)}/tables/${enc(tableId)}`, { schema: tableList }),

  qrCodes: (placeId: string, signal?: AbortSignal) =>
    apiClient.get(`${placeBase(placeId)}/qr`, { schema: z.array(ownerQrCodeSchema), signal }),

  createQr: (placeId: string, dto: CreateQrRequest) =>
    apiClient.post(`${placeBase(placeId)}/qr`, { body: dto, schema: ownerQrCodeSchema }),

  regenerateQr: (id: string) =>
    apiClient.post(`/business/qr/${enc(id)}/regenerate`, { schema: ownerQrCodeSchema }),

  setQrEnabled: (id: string, enabled: boolean) =>
    apiClient.post(`/business/qr/${enc(id)}/${enabled ? 'enable' : 'disable'}`, {
      schema: ownerQrCodeSchema,
    }),

  // ── Staff ───────────────────────────────────────────────────────────────────────────────────────
  adminOrders: (
    params: { q?: string; status?: OrderStatus; page?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get('/admin/orders', {
      query: { ...params },
      schema: z.array(businessOrderSchema),
      signal,
    }),

  adminQrCodes: (params: { q?: string; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/admin/qr-codes', {
      query: { ...params },
      schema: z.array(adminQrCodeSchema),
      signal,
    }),

  adminDisableQr: (id: string) => apiClient.post(`/admin/qr-codes/${enc(id)}/disable`),
};
