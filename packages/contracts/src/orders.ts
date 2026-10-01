import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { itemOptionSchema } from './services.js';
import { singleLineField, uuidSchema } from './text.js';

/**
 * Tables, CampusPin QR codes and orders (food now, print later). Prices and totals are always worked
 * out by the server from the catalogue; the client never sends a price.
 */

// ── Tables ───────────────────────────────────────────────────────────────────────────────────────

export const placeTableSchema = z.object({
  id: z.string(),
  label: z.string(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  /** The table's live QR token, if one was generated. */
  qrToken: z.string().nullable(),
});
export type PlaceTable = z.infer<typeof placeTableSchema>;

export const MAX_TABLES = 200;

/** `POST /business/places/:placeId/tables`: one named table, or `count` numbered ones ("Table 01"…). */
export const createTablesSchema = z.union([
  z.strictObject({ label: singleLineField('Table name', 30) }),
  z.strictObject({ count: z.number().int().min(1).max(50) }),
]);
export type CreateTablesRequest = z.output<typeof createTablesSchema>;

export const updateTableSchema = z
  .strictObject({
    label: singleLineField('Table name', 30),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdateTableRequest = z.output<typeof updateTableSchema>;

// ── QR codes ─────────────────────────────────────────────────────────────────────────────────────

export const QR_KINDS = ['BUSINESS', 'TABLE'] as const;
export type QrKind = (typeof QR_KINDS)[number];
export const qrKindSchema = z.enum(QR_KINDS);

export const QR_STATUSES = ['ACTIVE', 'DISABLED', 'REPLACED'] as const;
export type QrStatus = (typeof QR_STATUSES)[number];

/** A token is 22 URL-safe characters; nothing else is ever looked up. */
export const qrTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,32}$/, 'Not a CampusPin code')
  .meta({ example: 'q8Zx2LmP0aT7vWc3Rk9sYb' });

export const ownerQrCodeSchema = z.object({
  id: z.string(),
  token: z.string(),
  kind: qrKindSchema,
  table: z.object({ id: z.string(), label: z.string() }).nullable(),
  status: z.enum(QR_STATUSES),
  scanCount: z.number().int(),
  lastScannedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OwnerQrCode = z.infer<typeof ownerQrCodeSchema>;

export const createQrSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('BUSINESS') }),
  z.strictObject({ kind: z.literal('TABLE'), tableId: uuidSchema }),
]);
export type CreateQrRequest = z.output<typeof createQrSchema>;

/** `GET /qr/:token`: where a scanned code leads. Contains no internal ids other than public ones. */
export const qrResolutionSchema = z.object({
  kind: qrKindSchema,
  place: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    coverImageUrl: z.string().nullable(),
  }),
  table: z.object({ label: z.string() }).nullable(),
});
export type QrResolution = z.infer<typeof qrResolutionSchema>;

// ── Orders ───────────────────────────────────────────────────────────────────────────────────────

export const ORDER_KINDS = ['FOOD', 'PRINT'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];
export const orderKindSchema = z.enum(ORDER_KINDS);

export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

/** Statuses after which nothing more happens. */
export const FINAL_ORDER_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED'];

/** What each status is called, per kind (a print job is "processing", not "preparing"). */
export const ORDER_STATUS_LABELS: Readonly<Record<OrderKind, Record<OrderStatus, string>>> = {
  FOOD: {
    PENDING: 'Waiting for the restaurant',
    ACCEPTED: 'Accepted',
    PREPARING: 'Preparing',
    READY: 'Ready',
    SERVED: 'Served',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  },
  PRINT: {
    PENDING: 'Submitted',
    ACCEPTED: 'Accepted',
    PREPARING: 'Printing',
    READY: 'Ready for pickup',
    SERVED: 'Collected',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  },
};

export const PAYMENT_METHODS = ['PAY_AT_COUNTER', 'CASH_AT_TABLE'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_LABELS: Readonly<Record<PaymentMethod, string>> = {
  PAY_AT_COUNTER: 'Pay at counter',
  CASH_AT_TABLE: 'Pay at table (cash)',
};

/** Whether the order is paid: separate from its status (completed does not mean paid). */
export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  UNPAID: 'Unpaid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

/** How an order was actually paid. ONLINE is reserved for a payment gateway. */
export const PAYMENT_CHANNELS = ['CASH', 'UPI', 'CARD', 'ONLINE'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];
export const paymentChannelSchema = z.enum(PAYMENT_CHANNELS);
export const PAYMENT_CHANNEL_LABELS: Readonly<Record<PaymentChannel, string>> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  ONLINE: 'Online',
};

/** `POST /business/orders/:id/payment`: the business records how the order was paid. */
export const recordPaymentSchema = z.strictObject({
  via: z.enum(['CASH', 'UPI', 'CARD']),
});
export type RecordPaymentRequest = z.output<typeof recordPaymentSchema>;

export const MAX_ORDER_LINES = 30;
export const MAX_ITEM_QUANTITY = 20;

/**
 * `POST /orders` (food). Only item ids, quantities and add-on names are sent; the server prices
 * everything. `qrToken` (from a table code) seats the order at that table. `idempotencyKey` makes a
 * retried tap safe: the same key returns the first order.
 */
export const createFoodOrderSchema = z.strictObject({
  placeId: uuidSchema,
  qrToken: qrTokenSchema.optional(),
  items: z
    .array(
      z.strictObject({
        itemId: uuidSchema,
        quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
        options: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
      }),
    )
    .min(1, 'Add something to your order')
    .max(MAX_ORDER_LINES),
  note: singleLineField('Note', 300).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('PAY_AT_COUNTER'),
  offerId: uuidSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type CreateFoodOrderRequest = z.output<typeof createFoodOrderSchema>;

export const orderLineSchema = z.object({
  name: z.string(),
  unitPrice: z.number().int(),
  quantity: z.number().int(),
  options: z.array(itemOptionSchema),
  lineTotal: z.number().int(),
});
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderHistoryEntrySchema = z.object({
  status: orderStatusSchema,
  at: z.string(),
});

export const printDetailsSchema = z.object({
  fileName: z.string(),
  pageCount: z.number().int(),
  copies: z.number().int(),
  color: z.boolean(),
  doubleSided: z.boolean(),
  paperSize: z.string(),
  binding: z.boolean(),
  lamination: z.boolean(),
  pickupAt: z.string().nullable(),
});
export type PrintDetails = z.infer<typeof printDetailsSchema>;

export const orderSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: orderKindSchema,
  status: orderStatusSchema,
  statusLabel: z.string(),
  place: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  table: z.string().nullable(),
  items: z.array(orderLineSchema),
  subtotal: z.number().int(),
  discount: z.number().int(),
  total: z.number().int(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: paymentStatusSchema,
  paidAt: z.string().nullable(),
  paidVia: paymentChannelSchema.nullable(),
  completedAt: z.string().nullable(),
  /** The order's invoice, once it has one (issued when a business with invoicing completes it). */
  invoice: z
    .object({
      id: z.string(),
      number: z.string(),
      status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'CANCELLED']),
    })
    .nullable(),
  note: z.string().nullable(),
  statusReason: z.string().nullable(),
  print: printDetailsSchema.nullable(),
  /** The student may still cancel (only while the business has not accepted). */
  cancellable: z.boolean(),
  history: z.array(orderHistoryEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

/** The business sees who ordered (name only) and which moves it can make next. */
export const businessOrderSchema = orderSchema.extend({
  student: z.object({ name: z.string() }),
  nextStatuses: z.array(orderStatusSchema),
});
export type BusinessOrder = z.infer<typeof businessOrderSchema>;

export const listMyOrdersQuerySchema = paginationQuerySchema.extend({
  kind: orderKindSchema.optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListMyOrdersQuery = z.output<typeof listMyOrdersQuerySchema>;

export const ORDER_SCOPES = ['active', 'today', 'all'] as const;
export const listBusinessOrdersQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(ORDER_SCOPES).default('active'),
  kind: orderKindSchema.optional(),
  status: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  placeId: uuidSchema.optional(),
});
export type ListBusinessOrdersQuery = z.output<typeof listBusinessOrdersQuerySchema>;

export const updateOrderStatusSchema = z.strictObject({
  status: orderStatusSchema,
  reason: singleLineField('Reason', 255).optional(),
});
export type UpdateOrderStatusRequest = z.output<typeof updateOrderStatusSchema>;

// ── Business insights ────────────────────────────────────────────────────────────────────────────

export const INSIGHT_RANGES = ['today', '7d', '30d'] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

export const insightsQuerySchema = z.object({
  range: z.enum(INSIGHT_RANGES).default('today'),
  placeId: uuidSchema.optional(),
});
export type InsightsQuery = z.output<typeof insightsQuerySchema>;

/** Real counts only, over the chosen range (India days). Nothing is estimated. */
export const businessInsightsSchema = z.object({
  range: z.enum(INSIGHT_RANGES),
  orders: z.number().int(),
  activeOrders: z.number().int(),
  pendingRequests: z.number().int(),
  requests: z.number().int(),
  bookings: z.number().int(),
  upcomingBookings: z.number().int(),
  offerRedemptions: z.number().int(),
  activeOffers: z.number().int(),
  profileViews: z.number().int(),
  qrScans: z.number().int(),
  reviews: z.number().int(),
  savedBy: z.number().int(),
  todaysMenu: z.enum(['NONE', 'DRAFT', 'PUBLISHED', 'REMOVED']),
});
export type BusinessInsights = z.infer<typeof businessInsightsSchema>;

/** Staff view of a QR code: which place it belongs to. */
export const adminQrCodeSchema = ownerQrCodeSchema.extend({
  place: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
});
export type AdminQrCode = z.infer<typeof adminQrCodeSchema>;

export const adminListQrQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});
export type AdminListQrQuery = z.output<typeof adminListQrQuerySchema>;

// ── Print orders ─────────────────────────────────────────────────────────────────────────────────

/** Largest PDF accepted for printing, and the most pages / copies one job may have. */
export const PRINT_MAX_BYTES = 20 * 1024 * 1024;
export const PRINT_MAX_PAGES = 500;
export const PRINT_MAX_COPIES = 50;

/** A private upload: a PDF to print or a photo for a request. Never served publicly. */
export const privateDocumentSchema = z.object({
  id: z.string(),
  kind: z.enum(['PRINT', 'REQUEST_PHOTO']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  pageCount: z.number().int().nullable(),
});
export type PrivateDocument = z.infer<typeof privateDocumentSchema>;

export const printOptionsSchema = z.strictObject({
  copies: z.number().int().min(1).max(PRINT_MAX_COPIES),
  color: z.boolean(),
  doubleSided: z.boolean(),
  paperSize: z.enum(['A4', 'A3', 'LEGAL', 'LETTER']),
  binding: z.boolean(),
  lamination: z.boolean(),
});
export type PrintOptions = z.output<typeof printOptionsSchema>;

/** `POST /orders/print`. Only the choices are sent; the server counts pages and prices it. */
export const createPrintOrderSchema = printOptionsSchema.extend({
  placeId: uuidSchema,
  documentId: uuidSchema,
  pickupAt: z.iso.datetime().optional(),
  note: singleLineField('Note', 300).optional(),
  offerId: uuidSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type CreatePrintOrderRequest = z.output<typeof createPrintOrderSchema>;

export interface PrintPriceList {
  bwPricePerPage: number;
  colorPricePerPage: number | null;
  doubleSided: boolean;
  paperSizes: readonly string[];
  bindingPrice: number | null;
  laminationPricePerPage: number | null;
}

/**
 * The lines and total of a print job. Used by the server to price the order and by the apps to show
 * the same number before ordering. Returns the reason instead when a choice is not offered.
 */
export function pricePrintJob(
  prices: PrintPriceList,
  pageCount: number,
  options: PrintOptions,
):
  | { lines: Array<{ name: string; unitPrice: number; quantity: number }>; subtotal: number }
  | { problem: string } {
  if (options.color && prices.colorPricePerPage === null)
    return { problem: 'This shop does not print in colour.' };
  if (options.doubleSided && !prices.doubleSided)
    return { problem: 'This shop does not print double-sided.' };
  if (!prices.paperSizes.includes(options.paperSize))
    return { problem: `This shop does not print on ${options.paperSize}.` };
  if (options.binding && prices.bindingPrice === null)
    return { problem: 'This shop does not bind.' };
  if (options.lamination && prices.laminationPricePerPage === null)
    return { problem: 'This shop does not laminate.' };
  const perPage = options.color ? (prices.colorPricePerPage ?? 0) : prices.bwPricePerPage;
  const lines = [
    {
      name: `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${options.color ? 'colour' : 'B/W'} · ${options.paperSize}${options.doubleSided ? ' · double-sided' : ''}`,
      unitPrice: perPage * pageCount,
      quantity: options.copies,
    },
  ];
  if (options.binding)
    lines.push({ name: 'Binding', unitPrice: prices.bindingPrice ?? 0, quantity: options.copies });
  if (options.lamination) {
    lines.push({
      name: 'Lamination',
      unitPrice: (prices.laminationPricePerPage ?? 0) * pageCount,
      quantity: options.copies,
    });
  }
  return { lines, subtotal: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) };
}
