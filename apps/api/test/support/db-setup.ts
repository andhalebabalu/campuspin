import { loadEnvFile } from '../../src/infra/config/load-env.js';

// Quiet logs in test output. Set BEFORE loading .env, because variables already in the
// environment win over the file.
process.env.LOG_LEVEL ??= 'silent';
// Use the developer's real .env (DATABASE_URL for XAMPP).
loadEnvFile();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Database tests must never run with NODE_ENV=production.');
}
process.env.NODE_ENV = 'test';
