import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@platform/contracts';

/**
 * The exception to throw for expected, client-visible failures. The global filter renders it into
 * the standard error envelope with its `code`, so every module reports errors the same way.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super(message, status);
  }

  /** 400 with per-field messages (`details.fields`). */
  static validation(fields: Record<string, string[]>): AppException {
    return new AppException('VALIDATION_ERROR', 'Validation failed', HttpStatus.BAD_REQUEST, {
      fields,
    });
  }

  /** 503 when the database cannot be reached. */
  static databaseUnavailable(message: string, details?: Record<string, unknown>): AppException {
    return new AppException(
      'DATABASE_UNAVAILABLE',
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      details,
    );
  }
}
