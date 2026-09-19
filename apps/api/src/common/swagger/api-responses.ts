import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { apiErrorSchema, apiSuccessSchema } from '@platform/contracts';
import type { z } from 'zod';

/** Documents a successful response wrapped in the standard envelope. */
export function ApiEnvelopeResponse(
  data: z.ZodType,
  options: { status?: number; description?: string } = {},
) {
  return ApiResponse({
    status: options.status ?? 200,
    description: options.description ?? 'Success',
    standardSchema: apiSuccessSchema(data),
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

/** Documents error responses; every one uses the standard error envelope. */
export function ApiErrorResponses(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: STATUS_DESCRIPTIONS[status] ?? 'Error',
        standardSchema: apiErrorSchema,
      }),
    ),
  );
}
