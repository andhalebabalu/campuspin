import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseDatabaseUrl } from './database-url.js';

/**
 * Builds the Prisma driver adapter for MySQL/MariaDB (XAMPP). Shared by PrismaService (the API),
 * the seed and the maintenance scripts, so every process connects with identical settings.
 */
export function createMariaDbAdapter(databaseUrl: string): PrismaMariaDb {
  const { host, port, user, password, database } = parseDatabaseUrl(databaseUrl);
  return new PrismaMariaDb({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 10,
    // Fail fast when the server is down (e.g. XAMPP MySQL not started) instead of hanging
    // requests: bound opening a connection, waiting for a pooled one, and pool start-up.
    connectTimeout: 3_000,
    acquireTimeout: 3_000,
    initializationTimeout: 3_000,
  });
}
