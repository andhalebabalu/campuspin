import { z } from 'zod';
import { businessCapabilitySchema } from './capabilities.js';
import { orderKindSchema, paymentChannelSchema, paymentStatusSchema } from './orders.js';
import { paginationQuerySchema } from './pagination.js';

/**
 * Invoices: one per completed order of a business with the INVOICE capability, numbered per
 * business. The business and customer details are copied when the invoice is issued. No tax is
 * configured on CampusPin, so `tax` is 0 and not printed until one is.
 */

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export const INVOICE_STATUS_LABELS: Readonly<Record<InvoiceStatus, string>> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

export const invoiceLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  lineTotal: z.number().int(),
  /** Add-ons, e.g. "Extra cheese". */
  options: z.array(z.string()),
});

export const invoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: invoiceStatusSchema,
  business: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  customer: z.object({ name: z.string() }),
  order: z.object({
    id: z.string(),
    code: z.string(),
    kind: orderKindSchema,
    table: z.string().nullable(),
    placedAt: z.string(),
    completedAt: z.string().nullable(),
  }),
  items: z.array(invoiceLineSchema),
  subtotal: z.number().int(),
  discount: z.number().int(),
  tax: z.number().int(),
  total: z.number().int(),
  paymentStatus: paymentStatusSchema,
  /** How it was paid, once paid; otherwise how the student said they would pay. */
  paymentMethod: z.string(),
  paidVia: paymentChannelSchema.nullable(),
  issuedAt: z.string(),
  paidAt: z.string().nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

/** A row of the business's invoice list. */
export const invoiceSummarySchema = invoiceSchema
  .pick({
    id: true,
    number: true,
    status: true,
    customer: true,
    total: true,
    paymentStatus: true,
    issuedAt: true,
  })
  .extend({ orderId: z.string(), orderCode: z.string() });
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const INVOICE_PERIODS = ['today', 'week', 'month', 'all', 'custom'] as const;

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  period: z.enum(INVOICE_PERIODS).default('all'),
  /** With `period=custom`: YYYY-MM-DD, India time, inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: invoiceStatusSchema.optional(),
  /** Invoice number or order code. */
  q: z.string().trim().max(40).optional(),
});
export type ListInvoicesQuery = z.output<typeof listInvoicesQuerySchema>;

// ── The capability-aware dashboard summary ───────────────────────────────────────────────────────

export const SUMMARY_RANGES = ['today', '7d', '30d'] as const;
export const summaryQuerySchema = z.object({
  range: z.enum(SUMMARY_RANGES).default('today'),
});
export type SummaryQuery = z.output<typeof summaryQuerySchema>;

/**
 * `GET /business/summary`: the dashboard's numbers. Each section is present only when the
 * business has the capability it belongs to (null otherwise), and nothing else is queried.
 */
export const businessSummarySchema = z.object({
  range: z.enum(SUMMARY_RANGES),
  capabilities: z.array(businessCapabilitySchema),
  orders: z
    .object({
      total: z.number().int(),
      pending: z.number().int(),
      inProgress: z.number().int(),
      completed: z.number().int(),
      cancelled: z.number().int(),
    })
    .nullable(),
  /** Completed orders only; `paid` is what has actually been recorded as paid. */
  revenue: z.object({ completed: z.number().int(), paid: z.number().int() }).nullable(),
  invoices: z.object({ issued: z.number().int(), unpaid: z.number().int() }).nullable(),
  payments: z
    .object({ paidOrders: z.number().int(), unpaidCompleted: z.number().int() })
    .nullable(),
  tables: z
    .object({ total: z.number().int(), occupied: z.number().int(), available: z.number().int() })
    .nullable(),
  enquiries: z.object({ total: z.number().int(), pending: z.number().int() }).nullable(),
  bookings: z
    .object({
      upcoming: z.number().int(),
      pending: z.number().int(),
      confirmed: z.number().int(),
      completed: z.number().int(),
    })
    .nullable(),
  requests: z.object({ open: z.number().int(), total: z.number().int() }).nullable(),
  /** The latest orders (only with ORDER_MANAGEMENT), newest first. */
  recentOrders: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      customer: z.string(),
      total: z.number().int(),
      status: z.string(),
      statusLabel: z.string(),
      paymentStatus: paymentStatusSchema,
      invoice: z.object({ id: z.string(), number: z.string() }).nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type BusinessSummary = z.infer<typeof businessSummarySchema>;

/** A table and what is happening at it right now (derived from its open orders). */
export const TABLE_LIVE_STATUSES = [
  'AVAILABLE',
  'ORDER_PENDING',
  'OCCUPIED',
  'ORDER_COMPLETED',
] as const;
export const tableStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  place: z.object({ id: z.string(), name: z.string() }),
  status: z.enum(TABLE_LIVE_STATUSES),
  /** The newest open order at the table. */
  currentOrder: z
    .object({ id: z.string(), code: z.string(), total: z.number().int(), status: z.string() })
    .nullable(),
});
export type TableStatus = z.infer<typeof tableStatusSchema>;
