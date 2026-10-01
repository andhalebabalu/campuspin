import { z } from 'zod';
import { singleLineField } from './text.js';

/**
 * Business types and capabilities: one business dashboard for every kind of business, whose
 * modules (and the APIs behind them) depend on what the business can do.
 *
 *   business type (from its category, or set by staff)
 *     → the type's default capabilities (data: `business_type_capabilities`)
 *     ± per-business overrides set by staff
 *     → the modules the dashboard shows and the APIs the business may call
 *
 * Adding a type or changing what a type gets is data; a new capability is one enum value plus
 * its module entry.
 */

// Matches the Prisma `BusinessType` enum exactly.
export const BUSINESS_TYPES = [
  'HOTEL_RESTAURANT',
  'MESS',
  'PG',
  'ROOM_RENTAL',
  'LIBRARY',
  'PRINTING_XEROX',
  'SALON',
  'SERVICE',
  'OTHER',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const businessTypeSchema = z.enum(BUSINESS_TYPES);

export const BUSINESS_TYPE_LABELS: Readonly<Record<BusinessType, string>> = {
  HOTEL_RESTAURANT: 'Hotel / restaurant',
  MESS: 'Mess',
  PG: 'PG / hostel',
  ROOM_RENTAL: 'Room rental',
  LIBRARY: 'Library / study room',
  PRINTING_XEROX: 'Printing / xerox',
  SALON: 'Salon',
  SERVICE: 'Service',
  OTHER: 'Other',
};

// Matches the Prisma `BusinessCapability` enum exactly.
export const BUSINESS_CAPABILITIES = [
  'ORDER_MANAGEMENT',
  'TABLE_ORDER',
  'INVOICE',
  'PAYMENT',
  'BOOKING',
  'ENQUIRY',
  'SERVICE_REQUEST',
  'MEMBERSHIP',
  'APPOINTMENT',
  'REVENUE_ANALYTICS',
] as const;
export type BusinessCapability = (typeof BUSINESS_CAPABILITIES)[number];
export const businessCapabilitySchema = z.enum(BUSINESS_CAPABILITIES);

export const CAPABILITY_INFO: Readonly<
  Record<BusinessCapability, { label: string; description: string }>
> = {
  ORDER_MANAGEMENT: {
    label: 'Orders',
    description: 'Take food and print orders, manage the menu and move orders to completion',
  },
  TABLE_ORDER: {
    label: 'Table ordering',
    description: 'Tables with QR codes: students order and ask for service from their table',
  },
  INVOICE: { label: 'Invoices', description: 'An invoice for every completed order' },
  PAYMENT: { label: 'Payments', description: 'Record how orders were paid' },
  BOOKING: { label: 'Bookings', description: 'Time slots, seats or rooms students can book' },
  ENQUIRY: { label: 'Enquiries', description: 'Questions students send from the business page' },
  SERVICE_REQUEST: {
    label: 'Service requests',
    description: 'Jobs students request (repair, laundry, maintenance) with estimates',
  },
  MEMBERSHIP: {
    label: 'Memberships',
    description: 'Monthly members (reserved: no membership module yet)',
  },
  APPOINTMENT: { label: 'Appointments', description: 'Appointments in time slots' },
  REVENUE_ANALYTICS: {
    label: 'Revenue analytics',
    description: 'Revenue from completed orders on the dashboard',
  },
};

/**
 * The default capabilities of each type, as seeded into `business_type_capabilities`. The
 * database is the source of truth afterwards (staff can change a type's defaults).
 */
export const DEFAULT_TYPE_CAPABILITIES: Readonly<
  Record<BusinessType, readonly BusinessCapability[]>
> = {
  HOTEL_RESTAURANT: ['ORDER_MANAGEMENT', 'TABLE_ORDER', 'INVOICE', 'PAYMENT', 'REVENUE_ANALYTICS'],
  MESS: ['ORDER_MANAGEMENT', 'INVOICE', 'PAYMENT', 'REVENUE_ANALYTICS'],
  PRINTING_XEROX: ['ORDER_MANAGEMENT', 'INVOICE', 'PAYMENT'],
  PG: ['ENQUIRY', 'BOOKING', 'SERVICE_REQUEST', 'PAYMENT'],
  ROOM_RENTAL: ['ENQUIRY', 'BOOKING', 'PAYMENT'],
  LIBRARY: ['ENQUIRY', 'BOOKING', 'MEMBERSHIP', 'PAYMENT'],
  SALON: ['APPOINTMENT', 'ORDER_MANAGEMENT', 'INVOICE', 'PAYMENT'],
  SERVICE: ['SERVICE_REQUEST', 'BOOKING', 'INVOICE', 'PAYMENT'],
  OTHER: ['ENQUIRY'],
};

/**
 * Which capability a place service needs before a business can switch it on (and before students
 * can use it). BOOKING services work with either BOOKING or APPOINTMENT. Offers and listings are
 * for every business.
 */
export const SERVICE_KIND_CAPABILITIES: Readonly<Record<string, readonly BusinessCapability[]>> = {
  FOOD_ORDER: ['ORDER_MANAGEMENT'],
  DAILY_MENU: ['ORDER_MANAGEMENT'],
  PRINT_ORDER: ['ORDER_MANAGEMENT'],
  TABLE_SERVICE: ['TABLE_ORDER'],
  SERVICE_REQUEST: ['SERVICE_REQUEST'],
  BOOKING: ['BOOKING', 'APPOINTMENT'],
  OFFERS: [],
  LISTING: [],
};

export const capabilityOverrideSchema = z.object({
  capability: businessCapabilitySchema,
  enabled: z.boolean(),
  note: z.string().nullable(),
});

/** `GET /business/capabilities` (and inside the admin business detail). */
export const businessCapabilitiesSchema = z.object({
  businessType: businessTypeSchema,
  /** Where the type comes from: set on the business by staff, its category, or the default. */
  typeSource: z.enum(['BUSINESS', 'CATEGORY', 'DEFAULT']),
  /** The effective capabilities: the type's defaults with the overrides applied. */
  capabilities: z.array(businessCapabilitySchema),
  overrides: z.array(capabilityOverrideSchema),
});
export type BusinessCapabilities = z.infer<typeof businessCapabilitiesSchema>;

/** `PUT /admin/businesses/:id/type`: set the type (null = back to the category's). */
export const setBusinessTypeRequestSchema = z.strictObject({
  businessType: businessTypeSchema.nullable(),
});
export type SetBusinessTypeRequest = z.output<typeof setBusinessTypeRequestSchema>;

/** `PUT /admin/businesses/:id/capabilities/:capability`: force on/off, or null = the type's default. */
export const setCapabilityOverrideRequestSchema = z.strictObject({
  enabled: z.boolean().nullable(),
  note: singleLineField('Note', 255).optional(),
});
export type SetCapabilityOverrideRequest = z.output<typeof setCapabilityOverrideRequestSchema>;

/** `GET /admin/business-types`: every type with its default capabilities. */
export const businessTypeDefaultsSchema = z.object({
  businessType: businessTypeSchema,
  capabilities: z.array(businessCapabilitySchema),
  /** Businesses of this type (by override or category). */
  businessCount: z.number().int(),
});
export type BusinessTypeDefaults = z.infer<typeof businessTypeDefaultsSchema>;

/** `PUT /admin/business-types/:type`: replace a type's default capabilities. */
export const updateTypeCapabilitiesRequestSchema = z.strictObject({
  capabilities: z.array(businessCapabilitySchema).max(BUSINESS_CAPABILITIES.length),
});
export type UpdateTypeCapabilitiesRequest = z.output<typeof updateTypeCapabilitiesRequestSchema>;
