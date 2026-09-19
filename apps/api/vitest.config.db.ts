import { defineConfig } from 'vitest/config';

// Database tests: run against the REAL MySQL database from apps/api/.env (XAMPP, `link_platform`).
// Every test works inside a transaction that is always rolled back, so nothing is left behind and
// no second database is needed. Requires XAMPP MySQL running and `npm run db:migrate` applied.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.db-spec.ts'],
    setupFiles: ['test/support/db-setup.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
