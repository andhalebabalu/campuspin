import type { ErrorCode } from '@platform/contracts';

/** Codes produced by the client itself (the request never produced a valid API error). */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE';

export interface ApiClientErrorInit {
  message: string;
  status: number;
  code: ClientErrorCode;
  details?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
  cause?: unknown;
}

/** The single error type thrown by the client. UI code branches on `code`, never on `message`. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(init: ApiClientErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiClientError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** Per-field messages when the API rejected the request body (`VALIDATION_ERROR`). */
  get fieldErrors(): Record<string, string[]> | undefined {
    if (this.code !== 'VALIDATION_ERROR') return undefined;
    const fields = this.details?.fields;
    return fields && typeof fields === 'object' ? (fields as Record<string, string[]>) : undefined;
  }

  /** True when retrying the same request has a reasonable chance of succeeding. */
  get isRetryable(): boolean {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'TIMEOUT' ||
      this.code === 'RATE_LIMITED' ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }
}
