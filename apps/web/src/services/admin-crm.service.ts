import {
  adminBusinessAnalyticsSchema,
  adminBusinessDetailSchema,
  adminBusinessSchema,
  adminPlanSchema,
  adminSubscriptionSchema,
  auditEntrySchema,
  bulkBusinessResultSchema,
  ownershipIssueSchema,
  type AdminListAuditQuery,
  type AdminListSubscriptionsQuery,
  type AdminUpdateBusinessRequest,
  type AssignSubscriptionRequest,
  type BulkBusinessAction,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const id = (value: string) => encodeURIComponent(value);

/** The CRM side of the admin panel: business decisions, plans, audit log, business analytics. */
export const adminCrmService = {
  business: (businessId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/businesses/${id(businessId)}`, {
      schema: adminBusinessDetailSchema,
      signal,
    }),

  /** verify / unverify / reinstate take an optional reason; reject and suspend require one. */
  decide: (
    businessId: string,
    action: 'verify' | 'unverify' | 'reject' | 'suspend' | 'reinstate',
    reason?: string,
  ) =>
    apiClient.post(`/admin/businesses/${id(businessId)}/${action}`, {
      body: reason ? { reason } : {},
      schema: adminBusinessSchema,
    }),

  update: (businessId: string, dto: AdminUpdateBusinessRequest) =>
    apiClient.patch(`/admin/businesses/${id(businessId)}`, {
      body: dto,
      schema: adminBusinessDetailSchema,
    }),

  remove: (businessId: string) => apiClient.delete(`/admin/businesses/${id(businessId)}`),

  bulk: (ids: string[], action: BulkBusinessAction, reason?: string) =>
    apiClient.post('/admin/businesses/bulk', {
      body: { ids, action, ...(reason ? { reason } : {}) },
      schema: bulkBusinessResultSchema,
    }),

  assignPlan: (businessId: string, dto: AssignSubscriptionRequest) =>
    apiClient.post(`/admin/businesses/${id(businessId)}/subscription`, {
      body: dto,
      schema: adminBusinessDetailSchema,
    }),

  transfer: (businessId: string, ownerEmail: string, reason: string) =>
    apiClient.post(`/admin/businesses/${id(businessId)}/transfer`, {
      body: { ownerEmail, reason },
      schema: adminBusinessDetailSchema,
    }),

  ownershipCheck: (signal?: AbortSignal) =>
    apiClient.get('/admin/businesses/ownership-check', {
      schema: z.array(ownershipIssueSchema),
      signal,
    }),

  plans: (signal?: AbortSignal) =>
    apiClient.get('/admin/plans', { schema: z.array(adminPlanSchema), signal }),

  subscriptions: (query: Partial<AdminListSubscriptionsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/subscriptions', {
      query: { ...query },
      schema: z.array(adminSubscriptionSchema),
      signal,
    }),

  auditLogs: (query: Partial<AdminListAuditQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/audit-logs', {
      query: { ...query },
      schema: z.array(auditEntrySchema),
      signal,
    }),

  businessAnalytics: (days: 7 | 30 | 90, signal?: AbortSignal) =>
    apiClient.get('/admin/business-analytics', {
      query: { days: String(days) },
      schema: adminBusinessAnalyticsSchema,
      signal,
    }),
};
