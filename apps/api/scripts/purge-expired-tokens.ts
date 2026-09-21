/**
 * Deletes expired refresh, email-verification and password-reset tokens
 * (`npm run auth:purge-tokens`). Safe to run any time and as often as you like; schedule it daily
 * (cron, Windows Task Scheduler, a hosting "cron job"). Unexpired tokens are never touched.
 */
import { AppConfig, ConfigError } from '../src/infra/config/app-config.js';
import { loadEnvFile } from '../src/infra/config/load-env.js';
import { PrismaService } from '../src/infra/database/prisma.service.js';
import { TokenCleanupService } from '../src/modules/auth/services/token-cleanup.service.js';

loadEnvFile();

let config: AppConfig;
try {
  config = AppConfig.fromEnv();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const prisma = new PrismaService(config);
try {
  const result = await new TokenCleanupService(prisma).purgeExpired();
  console.log(`✔ Purged expired tokens from ${config.databaseTarget}:`);
  console.log(
    `  ${result.refreshTokens} refresh, ${result.emailVerificationTokens} email-verification, ` +
      `${result.passwordResetTokens} password-reset`,
  );
} finally {
  await prisma.$disconnect();
}
