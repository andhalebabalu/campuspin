import { defineConfig } from 'vitest/config';

// End-to-end tests: boot the real Nest application and call it over HTTP with supertest.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: 'http://localhost:3000',
      // Deliberately unreachable (port 1): Phase 1 tests must not depend on the XAMPP server, and
      // this makes the "database down" path deterministic. Later phases use a real test database.
      DATABASE_URL: 'mysql://root:@127.0.0.1:1/link_platform_test',
    },
  },
});
