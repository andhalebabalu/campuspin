import { z } from 'zod';
import { errorCodeSchema } from './errors.js';

/** Pagination block returned with list responses (`meta`). */
export const pageMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type PageMeta = z.infer<typeof pageMetaSchema>;

/** Builds the schema of a successful response: `{ success, message, data, meta? }`. */
export const apiSuccessSchema = <TData extends z.ZodType>(data: TData) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data,
    meta: pageMetaSchema.optional(),
  });

export interface ApiSuccess<TData> {
  success: true;
  message: string;
  data: TData;
  meta?: PageMeta;
}

/**
 * `error.details` for `VALIDATION_ERROR`: field path (dot notation) -> messages.
 * Root-level problems use the key `_root`.
 */
export const validationDetailsSchema = z.object({
  fields: z.record(z.string(), z.array(z.string())),
});
export type ValidationDetails = z.infer<typeof validationDetailsSchema>;

/** Schema of every error response, regardless of which module produced it. */
export const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.object({
    code: errorCodeSchema,
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  requestId: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
