import { z } from 'zod';
import { qrTokenSchema } from './orders.js';
import { paginationQuerySchema } from './pagination.js';
import { multiLineField, singleLineField, uuidSchema } from './text.js';

/**
 * Requests from a student to a business: quick table requests ("Water", "Request bill") and jobs
 * (repair, laundry) that may go through an estimate the student approves before work starts.
 */

export const REQUEST_KINDS = ['TABLE', 'GENERAL'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = [
  'NEW',
  'ACKNOWLEDGED',
  'ACCEPTED',
  'DIAGNOSING',
  'ESTIMATE_AVAILABLE',
  'APPROVED',
  'IN_PROGRESS',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const requestStatusSchema = z.enum(REQUEST_STATUSES);

export const FINAL_REQUEST_STATUSES: readonly RequestStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
];

export const REQUEST_STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  NEW: 'Requested',
  ACKNOWLEDGED: 'On the way',
  ACCEPTED: 'Accepted',
  DIAGNOSING: 'Checking',
  ESTIMATE_AVAILABLE: 'Estimate ready',
  APPROVED: 'Estimate approved',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
  REJECTED: 'Declined',
};

/** Suggested table requests, created when a place switches Table Service on. */
export const DEFAULT_TABLE_REQUESTS: ReadonlyArray<{ label: string; icon: string }> = [
  { label: 'Water', icon: 'water' },
  { label: 'Call staff', icon: 'person' },
  { label: 'Extra cutlery', icon: 'cutlery' },
  { label: 'Tissue', icon: 'tissue' },
  { label: 'Request bill', icon: 'bill' },
];

// ── Table request types (owner) ─────────────────────────────────────────────────────────────────

export const ownerTableRequestTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type OwnerTableRequestType = z.infer<typeof ownerTableRequestTypeSchema>;

export const saveTableRequestTypeSchema = z.strictObject({
  label: singleLineField('Request', 40),
  icon: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/)
    .nullable()
    .optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type SaveTableRequestTypeRequest = z.output<typeof saveTableRequestTypeSchema>;

export const updateTableRequestTypeSchema = saveTableRequestTypeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Send at least one field' });
export type UpdateTableRequestTypeRequest = z.output<typeof updateTableRequestTypeSchema>;

// ── Requests ─────────────────────────────────────────────────────────────────────────────────────

/** `POST /service-requests` from a table: the table comes from the scanned code. */
export const createTableRequestSchema = z.strictObject({
  kind: z.literal('TABLE'),
  qrToken: qrTokenSchema,
  requestTypeId: uuidSchema,
  idempotencyKey: z.string().trim().min(8).max(64),
});

/** `POST /service-requests` for a job (repair, laundry). `imageId` is a private upload of the student's. */
export const createGeneralRequestSchema = z.strictObject({
  kind: z.literal('GENERAL'),
  placeId: uuidSchema,
  serviceKey: z.string().trim().min(2).max(40),
  itemId: uuidSchema.optional(),
  description: multiLineField('Description', 2000).refine((value) => value.length >= 10, {
    message: 'Describe the problem in at least 10 characters',
  }),
  imageId: uuidSchema.optional(),
  preferredAt: z.iso.datetime().optional(),
  idempotencyKey: z.string().trim().min(8).max(64),
});

export const createServiceRequestSchema = z.discriminatedUnion('kind', [
  createTableRequestSchema,
  createGeneralRequestSchema,
]);
export type CreateServiceRequest = z.output<typeof createServiceRequestSchema>;

export const serviceRequestSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(REQUEST_KINDS),
  status: requestStatusSchema,
  statusLabel: z.string(),
  service: z.object({ key: z.string(), name: z.string() }),
  place: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  table: z.string().nullable(),
  label: z.string(),
  description: z.string().nullable(),
  hasImage: z.boolean(),
  preferredAt: z.string().nullable(),
  estimateAmount: z.number().int().nullable(),
  estimateNote: z.string().nullable(),
  statusReason: z.string().nullable(),
  /** What the student can do now. */
  canCancel: z.boolean(),
  canApprove: z.boolean(),
  history: z.array(z.object({ status: requestStatusSchema, at: z.string() })),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

export const businessServiceRequestSchema = serviceRequestSchema.extend({
  student: z.object({ name: z.string() }),
  nextStatuses: z.array(requestStatusSchema),
});
export type BusinessServiceRequest = z.infer<typeof businessServiceRequestSchema>;

export const listMyRequestsQuerySchema = paginationQuerySchema.extend({
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type ListMyRequestsQuery = z.output<typeof listMyRequestsQuerySchema>;

export const listBusinessRequestsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['active', 'today', 'all']).default('active'),
  kind: z.enum(REQUEST_KINDS).optional(),
  placeId: uuidSchema.optional(),
});
export type ListBusinessRequestsQuery = z.output<typeof listBusinessRequestsQuerySchema>;

/** Moving a request on. `ESTIMATE_AVAILABLE` needs `estimateAmount`. */
export const updateRequestStatusSchema = z
  .strictObject({
    status: requestStatusSchema,
    reason: singleLineField('Reason', 255).optional(),
    estimateAmount: z.number().int().min(0).max(1_000_000).optional(),
    estimateNote: singleLineField('Estimate note', 300).optional(),
  })
  .refine((value) => value.status !== 'ESTIMATE_AVAILABLE' || value.estimateAmount !== undefined, {
    message: 'Give the estimate in rupees',
    path: ['estimateAmount'],
  });
export type UpdateRequestStatusRequest = z.output<typeof updateRequestStatusSchema>;
