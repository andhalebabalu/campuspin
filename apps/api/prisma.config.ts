import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env automatically. Values already present in the environment win.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Optional so that `prisma generate` works before .env exists; migrate/db commands need it.
    url: process.env.DATABASE_URL ?? '',
  },
});
