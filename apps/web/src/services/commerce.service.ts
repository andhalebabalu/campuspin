import {
  businessCapabilitiesSchema,
  businessOrderSchema,
  businessSummarySchema,
  businessTypeDefaultsSchema,
  invoiceSchema,
  invoiceSummarySchema,
  tableStatusSchema,
  type BusinessCapability,
  type BusinessType,
  type ListInvoicesQuery,
  type OrderStatus,
  type PaymentStatus,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient, fetchPrivateBlob } from '@/lib/api/client';

const enc = encodeURIComponent;

/**
 * The capability-driven business dashboard: capabilities, summary, orders with payment, invoices,
 * the live table board, and staff control of capabilities.
 */
export const commerceService = {
  capabilities: (signal?: AbortSignal) =>
    apiClient.get('/business/capabilities', { schema: businessCapabilitiesSchema, signal }),

  summary: (range: 'today' | '7d' | '30d', signal?: AbortSignal) =>
    apiClient.get('/business/summary', { query: { range }, schema: businessSummarySchema, signal }),

  tables: (signal?: AbortSignal) =>
    apiClient.get('/business/tables/live', { schema: z.array(tableStatusSchema), signal }),

  orders: (
    params: {
      scope?: 'active' | 'today' | 'all';
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      page?: number;
    },
    signal?: AbortSignal,
  ) =>
    apiClient.get('/business/orders', {
      query: { ...params },
      schema: z.array(businessOrderSchema),
      signal,
    }),

  order: (id: string, signal?: AbortSignal) =>
    apiClient.get(`/business/orders/${enc(id)}`, { schema: businessOrderSchema, signal }),

  moveOrder: (id: string, status: OrderStatus, reason?: string) =>
    apiClient.patch(`/business/orders/${enc(id)}/status`, {
      body: { status, ...(reason ? { reason } : {}) },
      schema: businessOrderSchema,
    }),

  recordPayment: (id: string, via: 'CASH' | 'UPI' | 'CARD') =>
    apiClient.post(`/business/orders/${enc(id)}/payment`, {
      body: { via },
      schema: businessOrderSchema,
    }),

  invoices: (params: Partial<ListInvoicesQuery>, signal?: AbortSignal) =>
    apiClient.get('/business/invoices', {
      query: { ...params },
      schema: z.array(invoiceSummarySchema),
      signal,
    }),

  invoice: (id: string, signal?: AbortSignal) =>
    apiClient.get(`/business/invoices/${enc(id)}`, { schema: invoiceSchema, signal }),

  invoicePdf: (id: string) => fetchPrivateBlob(`/business/invoices/${enc(id)}/pdf`),

  // ── Students ────────────────────────────────────────────────────────────────────────────────────
  myInvoice: (id: string, signal?: AbortSignal) =>
    apiClient.get(`/me/invoices/${enc(id)}`, { schema: invoiceSchema, signal }),

  myInvoicePdf: (id: string) => fetchPrivateBlob(`/me/invoices/${enc(id)}/pdf`),

  // ── Staff ───────────────────────────────────────────────────────────────────────────────────────
  adminCapabilities: (businessId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/businesses/${enc(businessId)}/capabilities`, {
      schema: businessCapabilitiesSchema,
      signal,
    }),

  adminSetType: (businessId: string, businessType: BusinessType | null) =>
    apiClient.put(`/admin/businesses/${enc(businessId)}/type`, {
      body: { businessType },
      schema: businessCapabilitiesSchema,
    }),

  adminSetCapability: (
    businessId: string,
    capability: BusinessCapability,
    enabled: boolean | null,
    note?: string,
  ) =>
    apiClient.put(`/admin/businesses/${enc(businessId)}/capabilities/${capability}`, {
      body: { enabled, ...(note ? { note } : {}) },
      schema: businessCapabilitiesSchema,
    }),

  businessTypes: (signal?: AbortSignal) =>
    apiClient.get('/admin/business-types', {
      schema: z.array(businessTypeDefaultsSchema),
      signal,
    }),

  setTypeDefaults: (type: BusinessType, capabilities: BusinessCapability[]) =>
    apiClient.put(`/admin/business-types/${type}`, {
      body: { capabilities },
      schema: z.array(businessTypeDefaultsSchema),
    }),
};

/** Saves a blob as a file in the browser. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
