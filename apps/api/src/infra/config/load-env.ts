import { existsSync } from 'node:fs';

/**
 * Loads `.env` from the current working directory (apps/api when started through npm workspaces).
 * Variables that are already set in the real environment take precedence over the file.
 */
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
