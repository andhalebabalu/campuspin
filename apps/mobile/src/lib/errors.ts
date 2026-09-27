import { ApiClientError } from '@platform/api-client';
import type { z } from 'zod';

/** One message per field from a zod error, keyed by the field path (`_root` for the form). */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/** The first server-side validation message per field, if the error carries any. */
export function serverFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {};
  const fields = error.fieldErrors ?? {};
  return Object.fromEntries(Object.entries(fields).map(([key, list]) => [key, list[0] ?? '']));
}

/** A sentence to show the user for any thrown error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'NETWORK_ERROR') {
      return 'Could not reach the server. Check your internet connection (and that the API is running).';
    }
    if (error.code === 'TIMEOUT') return 'The server took too long to answer. Please try again.';
    return error.message || fallback;
  }
  return fallback;
}

export function isApiError(error: unknown, status: number): boolean {
  return error instanceof ApiClientError && error.status === status;
}
