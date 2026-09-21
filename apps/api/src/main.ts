import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { AppConfig, ConfigError } from './infra/config/app-config.js';
import { loadEnvFile } from './infra/config/load-env.js';
import { SWAGGER_PATH } from './swagger.js';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  // Validate configuration first so a mistake prints a readable message instead of a Nest crash.
  const config = AppConfig.fromEnv();

  // Some settings are fine on a laptop but dangerous in production (public dev JWT secrets, an email
  // provider that prints one-time links to the log). Refuse to start rather than run insecurely.
  const productionProblems = config.productionProblems();
  if (productionProblems.length > 0) {
    throw new ConfigError(
      `Unsafe production configuration:\n${productionProblems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app, config);
  await app.listen(config.port);

  const logger = app.get(Logger);
  logger.log(`API listening on ${config.apiBaseUrl}/api/v1 (${config.nodeEnv})`);
  logger.log(`Database target: ${config.databaseTarget} (connects on first query)`);
  if (config.auth.usesDevelopmentSecrets) {
    logger.warn(
      'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET are not set: using the built-in DEVELOPMENT secrets. ' +
        'Anyone can forge tokens with them. Set real secrets in apps/api/.env (see .env.example).',
    );
  }
  if (config.swaggerEnabled) {
    logger.log(`Swagger UI: ${config.apiBaseUrl}/${SWAGGER_PATH}`);
  }
}

try {
  await bootstrap();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
