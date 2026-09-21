import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { type ErrorCode, apiErrorSchema, apiSuccessSchema } from '@platform/contracts';
import type { z } from 'zod';

/** A sample of what a successful response looks like, shown in Swagger UI. */
export interface EnvelopeExample {
  message: string;
  data: unknown;
  /** Page details, for list endpoints. */
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

/** Documents a successful response wrapped in the standard envelope. */
export function ApiEnvelopeResponse(
  data: z.ZodType,
  options: { status?: number; description?: string; example?: EnvelopeExample } = {},
) {
  const envelope = apiSuccessSchema(data);
  return ApiResponse({
    status: options.status ?? 200,
    description: options.description ?? 'Success',
    standardSchema: options.example
      ? envelope.meta({
          example: {
            success: true,
            data: options.example.data,
            message: options.example.message,
            ...(options.example.meta ? { meta: options.example.meta } : {}),
          },
        })
      : envelope,
  });
}

const STATUS_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'Validation failed or malformed request',
  401: 'Missing or invalid credentials',
  403: 'Authenticated but not allowed',
  404: 'Resource not found',
  409: 'Conflict with the current state',
  429: 'Too many requests',
  503: 'A dependency (e.g. the database) is unavailable',
};

/** An error response with a sample body (one representative code per status). */
export interface ErrorExample {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

const EXAMPLE_REQUEST_ID = '3f2c9a4e-8b1d-4c7a-9e55-2f6d0b7a1c33';

/**
 * Documents error responses; every one uses the standard error envelope. Pass a bare status for the
 * generic description, or an `ErrorExample` to also show a representative body.
 */
export function ApiErrorResponses(...items: Array<number | ErrorExample>) {
  return applyDecorators(
    ...items.map((item) => {
      const example = typeof item === 'number' ? undefined : item;
      const status = typeof item === 'number' ? item : item.status;
      return ApiResponse({
        status,
        description: STATUS_DESCRIPTIONS[status] ?? 'Error',
        standardSchema: example
          ? apiErrorSchema.meta({
              example: {
                success: false,
                message: example.message,
                error: {
                  code: example.code,
                  ...(example.details ? { details: example.details } : {}),
                },
                requestId: EXAMPLE_REQUEST_ID,
              },
            })
          : apiErrorSchema,
      });
    }),
  );
}
