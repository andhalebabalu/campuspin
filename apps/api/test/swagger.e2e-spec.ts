import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

describe('Swagger (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves Swagger UI at /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs').expect(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('swagger-ui');
  });

  it('documents the health endpoints from their zod schemas', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const doc = response.body;

    expect(doc.info.title).toBe('Student Ecosystem Platform API');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/v1/health', '/api/v1/health/database']),
    );

    const ok = doc.paths['/api/v1/health'].get.responses['200'].content['application/json'].schema;
    expect(ok.properties.success.enum).toEqual([true]);
    expect(ok.properties.data.properties.status.enum).toEqual(['ok']);

    const unavailable =
      doc.paths['/api/v1/health/database'].get.responses['503'].content['application/json'].schema;
    expect(unavailable.properties.error.properties.code.enum).toContain('DATABASE_UNAVAILABLE');
  });
});
