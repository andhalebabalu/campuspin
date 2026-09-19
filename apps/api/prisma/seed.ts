/**
 * Database seed (`npm run db:seed`, via `prisma db seed`).
 *
 *   npm run db:seed             reference data + DEMO data + a DEMO admin (development only)
 *   npm run db:seed:reference   reference data only (roles, permissions, categories, amenities)
 *
 * Safe to run repeatedly: existing rows are never duplicated.
 */
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppConfig, ConfigError } from '../src/infra/config/app-config.js';
import { loadEnvFile } from '../src/infra/config/load-env.js';
import { createMariaDbAdapter } from '../src/infra/database/mariadb-adapter.js';
import { formatSeedResult, runSeed } from './seed/index.js';

// DEVELOPMENT ONLY. This account and password exist so a fresh dev database is usable right away.
// They must NEVER exist in a real deployment: the seed refuses to create them in production, and
// `npm run db:purge-demo` removes them. Override with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
const DEV_ADMIN_EMAIL = 'admin@localhost.test';
const DEV_ADMIN_PASSWORD = 'ChangeMe123!';

loadEnvFile();

let config: AppConfig;
try {
  config = AppConfig.fromEnv();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const referenceOnly = process.argv.includes('--reference-only');
if (!referenceOnly && config.isProduction) {
  console.error(
    '\n✖ Refusing to seed demo data or the demo admin account when NODE_ENV=production.\n' +
      '  Use `npm run db:seed:reference` to seed only roles, permissions, categories and amenities.\n',
  );
  process.exit(1);
}

const db = new PrismaClient({ adapter: createMariaDbAdapter(config.databaseUrl) });
try {
  console.log(
    `Seeding ${config.databaseTarget} (${referenceOnly ? 'reference data only' : 'reference + demo data'}) ...\n`,
  );
  const result = await runSeed(db, {
    demo: !referenceOnly,
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? DEV_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? DEV_ADMIN_PASSWORD,
  });
  console.log(formatSeedResult(result));

  if (!referenceOnly) {
    console.log(
      `\n⚠ DEVELOPMENT ADMIN  ${process.env.SEED_ADMIN_EMAIL ?? DEV_ADMIN_EMAIL}` +
        `  /  ${process.env.SEED_ADMIN_PASSWORD ? '(password from SEED_ADMIN_PASSWORD)' : DEV_ADMIN_PASSWORD}\n` +
        '  Development only. Change or remove this account before any real deployment.\n',
    );
  }
} finally {
  await db.$disconnect();
}
