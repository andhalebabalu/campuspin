export interface DatabaseConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Splits a `mysql://user:password@host:port/database` URL into connection parts.
 * XAMPP's default root user has an EMPTY password (`mysql://root:@localhost:3306/db`), which is valid.
 * User and password are percent-decoded, so `p%40ss` means `p@ss`.
 */
export function parseDatabaseUrl(databaseUrl: string): DatabaseConnection {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL (expected mysql://USER:PASSWORD@HOST:PORT/DATABASE).',
    );
  }
  if (url.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the mysql:// protocol.');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error(
      'DATABASE_URL must name a database, e.g. mysql://root:@localhost:3306/link_platform.',
    );
  }
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}
