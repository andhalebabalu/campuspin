import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { AppConfig } from '../../src/infra/config/app-config.js';

/**
 * Boots the real application exactly like main.ts does (same modules, same configureApp),
 * optionally with extra test-only controllers.
 */
export async function createTestApp(
  extras: { controllers?: Type<unknown>[] } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extras.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, app.get(AppConfig));
  await app.init();
  return app;
}
