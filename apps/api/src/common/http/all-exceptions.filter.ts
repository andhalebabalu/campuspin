import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorCode } from '@platform/contracts';
import type { Request, Response } from 'express';
import { AppException } from './app-exception.js';

interface ErrorResponseParts {
  status: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown> | undefined;
}

const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

const GENERIC_INTERNAL_MESSAGE = 'Something went wrong';

function codeForStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
}

/** Errors raised by Express body parsing carry an HTTP status and a `type`, but are not HttpExceptions. */
function isBodyParserError(error: unknown): error is { status: number; type: string } {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { status?: unknown; type?: unknown };
  return (
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500 &&
    typeof candidate.type === 'string' &&
    candidate.type.startsWith('entity.')
  );
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const inner = (response as { message?: unknown }).message;
  if (typeof inner === 'string') return inner;
  if (Array.isArray(inner)) return inner.map(String).join('; ');
  return exception.message;
}

/**
 * The one place that turns any thrown value into the standard error envelope:
 * `{ success: false, message, error: { code, details? }, requestId }`.
 * Unexpected errors are logged in full but never leak internals to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string | number }>();
    if (response.headersSent) return;

    const parts = this.describe(exception);
    if (parts.status >= 500) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `${request.method} ${request.originalUrl} failed: ${error.message}`,
        error.stack,
      );
    }

    // An error must never be kept by a browser or a CDN, even on a route whose successful answers
    // are cacheable: Nest applies a route's Cache-Control before the handler runs, so it would otherwise
    // be attached to a 400, or to a 503 while the database is down.
    response.setHeader('Cache-Control', 'no-store');
    response.status(parts.status).json({
      success: false,
      message: parts.message,
      error: {
        code: parts.code,
        ...(parts.details ? { details: parts.details } : {}),
      },
      ...(request.id === undefined ? {} : { requestId: String(request.id) }),
    });
  }

  private describe(exception: unknown): ErrorResponseParts {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: codeForStatus(status),
        message:
          status === 429 ? 'Too many requests. Please try again shortly.' : messageOf(exception),
      };
    }
    if (isBodyParserError(exception)) {
      return {
        status: exception.status,
        code: codeForStatus(exception.status),
        message:
          exception.status === 413
            ? 'The request body is too large.'
            : 'The request body is malformed.',
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: GENERIC_INTERNAL_MESSAGE,
    };
  }
}
