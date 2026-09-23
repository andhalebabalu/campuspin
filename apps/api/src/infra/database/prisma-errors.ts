/** Prisma's error code for "a unique index would be violated" (for example a duplicate email). */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
/** Prisma's error code for "a foreign key with ON DELETE RESTRICT would be violated". */
const FOREIGN_KEY_RESTRICT_VIOLATION = 'P2003';

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/**
 * True when a write lost a race against a unique index. Checking "does it exist?" first is not
 * enough on its own: two requests can pass that check together, so callers also handle this.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return hasPrismaCode(error, UNIQUE_CONSTRAINT_VIOLATION);
}

/**
 * True when a delete was refused because another row still references it (e.g. a category
 * attribute that already has values on a place). The schema's default RESTRICT is what makes this
 * possible; callers turn it into a friendly 409 instead of letting the database error surface raw.
 */
export function isForeignKeyRestrictError(error: unknown): boolean {
  return hasPrismaCode(error, FOREIGN_KEY_RESTRICT_VIOLATION);
}
