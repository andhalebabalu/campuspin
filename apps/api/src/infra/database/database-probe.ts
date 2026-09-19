import * as mariadb from 'mariadb';
import type { DatabaseConnection } from './database-url.js';

/** Why a database check failed, in terms a developer can act on. */
export type DatabaseFailureReason =
  'SERVER_UNREACHABLE' | 'ACCESS_DENIED' | 'DATABASE_NOT_FOUND' | 'TIMEOUT' | 'UNKNOWN';

export interface DatabaseServerInfo {
  database: string;
  serverVersion: string;
}

interface DriverErrorShape {
  code?: unknown;
  errno?: unknown;
  errors?: unknown;
}

function codeAndErrno(error: unknown): { code?: string; errno?: number } {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as DriverErrorShape;
  // With several resolved addresses (localhost -> ::1 and 127.0.0.1) Node reports an AggregateError.
  const nested = Array.isArray(candidate.errors) ? (candidate.errors[0] as DriverErrorShape) : {};
  const code = candidate.code ?? nested.code;
  const errno = candidate.errno ?? nested.errno;
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof errno === 'number' ? { errno } : {}),
  };
}

/** Maps a MariaDB/MySQL driver or network error to an actionable reason. */
export function classifyDatabaseError(error: unknown): DatabaseFailureReason {
  const { code, errno } = codeAndErrno(error);
  if (errno === 1049 || code === 'ER_BAD_DB_ERROR') return 'DATABASE_NOT_FOUND';
  if (errno === 1045 || code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
    return 'ACCESS_DENIED';
  }
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'ECONNRESET'
  ) {
    return 'SERVER_UNREACHABLE';
  }
  if (code === 'ETIMEDOUT' || code === 'ER_CONNECTION_TIMEOUT' || errno === 45012) return 'TIMEOUT';
  return 'UNKNOWN';
}

/**
 * Opens ONE direct connection (no pool) and asks the server for its version.
 * The pool retries and hides the underlying error behind a generic timeout, whereas a direct
 * connection reports the real reason immediately (unknown database, refused, ...).
 */
export async function probeDatabase(
  connection: DatabaseConnection,
  timeoutMs: number,
): Promise<DatabaseServerInfo> {
  let conn: mariadb.Connection | undefined;
  try {
    conn = await mariadb.createConnection({ ...connection, connectTimeout: timeoutMs });
    const rows = await conn.query<Array<{ version: string; db: string | null }>>(
      'SELECT VERSION() AS version, DATABASE() AS db',
    );
    return { database: rows[0]?.db ?? '', serverVersion: rows[0]?.version ?? 'unknown' };
  } finally {
    await conn?.end().catch(() => undefined);
  }
}
