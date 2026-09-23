import type { z } from 'zod';

/** First message per field from a zod failure, keyed by dot-path (root issues use `_root`). */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/** First message per field from the API's `VALIDATION_ERROR` details, in the same shape. */
export function firstFieldErrors(
  fields: Record<string, string[]> | undefined,
): Record<string, string> {
  if (!fields) return {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, messages]) => [key, messages[0] ?? '']),
  );
}
