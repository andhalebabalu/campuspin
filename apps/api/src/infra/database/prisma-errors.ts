/** Prisma's error code for "a unique index would be violated" (for example a duplicate email). */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * True when a write lost a race against a unique index. Checking "does it exist?" first is not
 * enough on its own: two requests can pass that check together, so callers also handle this.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
