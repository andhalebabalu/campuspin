import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

interface Operation {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    content: Record<
      string,
      { schema: { properties?: Record<string, unknown>; additionalProperties?: boolean } }
    >;
  };
  responses: Record<
    string,
    { content?: Record<string, { schema: { example?: { success?: boolean; message?: string } } }> }
  >;
}
interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
}

const PUBLIC = [
  ['get', '/api/v1/places'],
  ['get', '/api/v1/places/{idOrSlug}'],
] as const;

/** [method, path, request-body property count (or none), success status] */
const ADMIN = [
  ['get', '/api/v1/admin/places', undefined, '200'],
  ['post', '/api/v1/admin/places', 18, '201'],
  ['get', '/api/v1/admin/places/{id}', undefined, '200'],
  ['patch', '/api/v1/admin/places/{id}', 17, '200'],
  ['post', '/api/v1/admin/places/{id}/activate', 1, '200'],
  ['post', '/api/v1/admin/places/{id}/deactivate', 1, '200'],
  ['post', '/api/v1/admin/places/{id}/verify', 1, '200'],
  ['post', '/api/v1/admin/places/{id}/unverify', 1, '200'],
  ['post', '/api/v1/admin/places/{id}/images', 4, '201'],
  ['patch', '/api/v1/admin/places/{id}/images/{imageId}', 3, '200'],
  ['delete', '/api/v1/admin/places/{id}/images/{imageId}', undefined, '200'],
] as const;

describe('Swagger documentation of places (e2e)', () => {
  let app: NestExpressApplication;
  let doc: OpenApiDocument;
  const operation = (path: string, method: string) => doc.paths[path]?.[method];

  beforeAll(async () => {
    app = await createTestApp();
    doc = (await request(app.getHttpServer()).get('/api/docs-json').expect(200))
      .body as OpenApiDocument;
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents exactly the 2 public and 11 admin place routes', () => {
    const documented = Object.entries(doc.paths)
      // `/places/duplicate-check` is declared here for a tidy public URL, but it belongs to the
      // submissions feature (tagged "Submissions", documented in submissions-swagger.e2e-spec.ts).
      // Likewise `/places/{idOrSlug}/reviews[/summary]` belong to reviews (reviews-swagger.e2e-spec.ts).
      .filter(
        ([path]) =>
          path.includes('/places') &&
          path !== '/api/v1/places/duplicate-check' &&
          !path.includes('/reviews'),
      )
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method} ${path}`),
      );
    const expected = [...PUBLIC, ...ADMIN].map(([method, path]) => `${method} ${path}`);
    expect(documented.sort()).toEqual(expected.sort());
  });

  it.each(PUBLIC)('%s %s is open (no Bearer) and has no request body', (method, path) => {
    const op = operation(path, method);
    expect(op?.summary).toBeTruthy();
    expect(op?.security ?? []).toEqual([]);
    expect(op?.requestBody).toBeUndefined();
  });

  it.each(ADMIN)(
    '%s %s: Bearer security, strict body, a success example and 401/403',
    (method, path, bodyProps, success) => {
      const op = operation(path, method);
      expect(op?.tags?.[0]).toMatch(/^Admin:/);
      expect(op?.summary).toBeTruthy();
      expect(op?.security).toEqual([{ bearer: [] }]);

      const schema = op?.requestBody?.content['application/json']?.schema;
      if (typeof bodyProps === 'number') {
        expect(Object.keys(schema?.properties ?? {})).toHaveLength(bodyProps);
        expect(schema?.additionalProperties).toBe(false);
      } else {
        expect(schema).toBeUndefined();
      }

      const ok = op?.responses[success]?.content?.['application/json']?.schema.example;
      expect(ok).toMatchObject({ success: true });
      expect(ok?.message).toEqual(expect.any(String));
      expect(op?.responses).toHaveProperty('401');
      expect(op?.responses).toHaveProperty('403');
    },
  );
});
