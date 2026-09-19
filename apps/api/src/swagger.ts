import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppConfig } from './infra/config/app-config.js';
import { zodStandardSchemaConverter } from './common/swagger/standard-schema-converter.js';

export const SWAGGER_PATH = 'api/docs';

/** Serves Swagger UI at /api/docs and the raw OpenAPI document at /api/docs-json. */
export function setupSwagger(app: INestApplication, config: AppConfig): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Student Ecosystem Platform API')
      .setDescription(
        "REST API for discovering everything around a student's college. " +
          'All responses use a consistent envelope: `{ success, message, data }` on success and ' +
          '`{ success, message, error: { code, details } }` on failure.',
      )
      .setVersion('1.0')
      .addServer(config.apiBaseUrl)
      .addBearerAuth()
      .build(),
    { standardSchemaConverter: zodStandardSchemaConverter },
  );

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    customSiteTitle: 'Platform API docs',
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
  });
}
