import {
  availabilitySchema,
  bookingSchema,
  businessBookingSchema,
  scheduleWindowSchema,
  type BookingStatus,
  type CreateBookingRequest,
  type SaveScheduleRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const enc = encodeURIComponent;

/** Bookings (appointments, study seats): student, owner and staff calls. */
export const bookingsService = {
  availability: (placeSlug: string, itemId: string, date: string, signal?: AbortSignal) =>
    apiClient.get(`/places/${enc(placeSlug)}/availability`, {
      query: { item: itemId, date },
      schema: availabilitySchema,
      signal,
    }),

  book: (dto: CreateBookingRequest) => apiClient.post('/bookings', { body: dto, schema: bookingSchema }),

  mine: (params: { upcoming?: boolean; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/me/bookings', {
      query: { page: params.page, upcoming: params.upcoming ? 'true' : undefined },
      schema: z.array(bookingSchema),
      signal,
    }),

  cancel: (id: string) => apiClient.post(`/me/bookings/${enc(id)}/cancel`, { schema: bookingSchema }),

  businessList: (params: { scope?: 'upcoming' | 'today' | 'all'; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/business/bookings', { query: { ...params }, schema: z.array(businessBookingSchema), signal }),

  updateStatus: (id: string, status: BookingStatus, reason?: string) =>
    apiClient.patch(`/business/bookings/${enc(id)}/status`, {
      body: { status, ...(reason ? { reason } : {}) },
      schema: businessBookingSchema,
    }),

  schedule: (placeId: string, key: string, signal?: AbortSignal) =>
    apiClient.get(`/business/places/${enc(placeId)}/schedules/${enc(key)}`, {
      schema: z.array(scheduleWindowSchema),
      signal,
    }),

  saveSchedule: (placeId: string, key: string, dto: SaveScheduleRequest) =>
    apiClient.put(`/business/places/${enc(placeId)}/schedules/${enc(key)}`, {
      body: dto,
      schema: z.array(scheduleWindowSchema),
    }),

  adminList: (params: { q?: string; page?: number } = {}, signal?: AbortSignal) =>
    apiClient.get('/admin/bookings', { query: { ...params }, schema: z.array(businessBookingSchema), signal }),
};
