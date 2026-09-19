/**
 * Creates the MySQL database named in DATABASE_URL if it does not exist yet (`npm run db:create`).
 * Safe to run repeatedly. Uses the credentials from apps/api/.env, so it works the same for a
 * passwordless XAMPP root and for a root user with a password.
 */
import * as mariadb from 'mariadb';
import { AppConfig, ConfigError } from '../src/infra/config/app-config.js';
import { loadEnvFile } from '../src/infra/config/load-env.js';
import { classifyDatabaseError } from '../src/infra/database/database-probe.js';
import { parseDatabaseUrl } from '../src/infra/database/database-url.js';

// The name is interpolated into SQL (identifiers cannot be bound), so it is strictly validated.
const SAFE_DATABASE_NAME = /^[A-Za-z0-9_]{1,64}$/;

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

loadEnvFile();

let config: AppConfig;
try {
  config = AppConfig.fromEnv();
} catch (error) {
  fail(error instanceof ConfigError ? error.message : String(error));
}

const { host, port, user, password, database } = parseDatabaseUrl(config.databaseUrl);
if (!SAFE_DATABASE_NAME.test(database)) {
  fail(`Database name "${database}" may only contain letters, digits and underscores.`);
}

// Connect to the SERVER (no database selected) because the database may not exist yet.
let connection: mariadb.Connection;
try {
  connection = await mariadb.createConnection({
    host,
    port,
    user,
    password,
    connectTimeout: 5_000,
  });
} catch (error) {
  const reason = classifyDatabaseError(error);
  fail(
    reason === 'SERVER_UNREACHABLE'
      ? `Cannot reach MySQL at ${host}:${port}. Start MySQL in the XAMPP Control Panel and try again.`
      : reason === 'ACCESS_DENIED'
        ? `MySQL rejected the user/password in DATABASE_URL (user "${user}").`
        : `Could not connect to MySQL: ${error instanceof Error ? error.message : String(error)}`,
  );
}

try {
  const existing = await connection.query<Array<{ SCHEMA_NAME: string }>>(
    'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [database],
  );
  if (existing.length > 0) {
    console.log(`✔ Database "${database}" already exists on ${host}:${port}. Nothing to do.`);
  } else {
    await connection.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(
      `✔ Created database "${database}" on ${host}:${port} (utf8mb4 / utf8mb4_unicode_ci).`,
    );
  }
} finally {
  await connection.end();
}
