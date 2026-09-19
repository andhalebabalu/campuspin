/**
 * Removes all demo data and demo accounts (`npm run db:purge-demo`). Run before a real deployment.
 * Reference data (roles, permissions, categories, amenities) is kept.
 */
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppConfig, ConfigError } from '../src/infra/config/app-config.js';
import { loadEnvFile } from '../src/infra/config/load-env.js';
import { createMariaDbAdapter } from '../src/infra/database/mariadb-adapter.js';
import { purgeDemoData } from '../prisma/seed/purge.js';

loadEnvFile();

let config: AppConfig;
try {
  config = AppConfig.fromEnv();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const db = new PrismaClient({ adapter: createMariaDbAdapter(config.databaseUrl) });
try {
  const result = await purgeDemoData(db);
  console.log(`✔ Purged demo data from ${config.databaseTarget}:`);
  console.log(
    `  ${result.places} place(s), ${result.colleges} college(s), ${result.businesses} business(es), ${result.users} demo account(s)`,
  );
} finally {
  await db.$disconnect();
}
