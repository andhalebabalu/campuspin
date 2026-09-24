import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

interface Operation {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  responses: Record<string, { content?: Record<string, { schema: { example?: unknown } }> }>;
}
interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
}

/** [method, path, tag, success status] */
const ROUTES = [
  ['get', '/api/v1/admin/dashboard', 'Admin: Dashboard', '200'],
  ['get', '/api/v1/admin/users', 'Admin: Users', '200'],
  ['get', '/api/v1/admin/users/{id}', 'Admin: Users', '200'],
  ['post', '/api/v1/admin/users/{id}/suspend', 'Admin: Users', '200'],
  ['post', '/api/v1/admin/users/{id}/reactivate', 'Admin: Users', '200'],
  ['put', '/api/v1/admin/users/{id}/roles', 'Admin: Users', '200'],
  ['get', '/api/v1/admin/businesses', 'Admin: Businesses', '200'],
  ['post', '/api/v1/admin/businesses/{id}/verify', 'Admin: Businesses', '200'],
  ['post', '/api/v1/admin/businesses/{id}/unverify', 'Admin: Businesses', '200'],
] as const;

describe('Swagger documentation of staff administration (e2e)', () => {
  let app: NestExpressApplication;
  let doc: OpenApiDocument;

  beforeAll(async () => {
    app = await createTestApp();
    doc = (await request(app.getHttpServer()).get('/api/docs-json').expect(200))
      .body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ROUTES)('%s %s: tagged, Bearer, success example, 401 and 403', (method, path, tag, ok) => {
    const op = doc.paths[path]?.[method];
    expect(op?.tags?.[0]).toBe(tag);
    expect(op?.summary).toBeTruthy();
    expect(op?.security).toEqual([{ bearer: [] }]);
    expect(op?.responses[ok]?.content?.['application/json']?.schema.example).toMatchObject({
      success: true,
    });
    expect(op?.responses).toHaveProperty('401');
    expect(op?.responses).toHaveProperty('403');
  });
});
