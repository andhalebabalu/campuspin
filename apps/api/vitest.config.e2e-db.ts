import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// HTTP end-to-end tests that need the REAL database (authentication creates users, sessions and
// audit rows). They boot the real Nest app and call it with supertest, against `link_platform` from
// apps/api/.env; there is no second database. Every test user has an email under the reserved
// domain `@auth-e2e.localhost.test` and every request carries an `e2eauth-` request id, so the
// suite can remove exactly what it created (before and after) and nothing else.
// Requires XAMPP MySQL running, `npm run db:migrate:deploy` and `npm run db:seed:reference` applied.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-db-spec.ts'],
    setupFiles: ['test/support/db-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: 'http://localhost:3000',
      // Emails are captured in memory so tests can read the one-time links. Nothing is ever sent.
      EMAIL_PROVIDER: 'memory',
      // Generous, so the flow tests are never throttled. The rate-limit spec lowers it for itself.
      AUTH_RATE_LIMIT: '10000',
      THROTTLE_LIMIT: '10000',
      // Uploaded test images go to a throwaway folder, never the real apps/api/uploads.
      UPLOAD_DIR: path.join(os.tmpdir(), 'campuspin-e2e-uploads'),
    },
  },
});
