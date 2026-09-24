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

/** Anyone, no account. [method, path, success status] */
const PUBLIC = [
  ['get', '/api/v1/places/{idOrSlug}/reviews', '200'],
  ['get', '/api/v1/places/{idOrSlug}/reviews/summary', '200'],
] as const;

/**
 * Signed-in users (posting is further limited to the STUDENT role, and editing to the author).
 * [method, path, request-body property count (or none), success status]
 */
const AUTHENTICATED = [
  ['post', '/api/v1/places/{idOrSlug}/reviews', 3, '201'],
  ['get', '/api/v1/me/reviews', undefined, '200'],
  ['patch', '/api/v1/reviews/{id}', 3, '200'],
  ['delete', '/api/v1/reviews/{id}', undefined, '200'],
] as const;

/** Staff-only (`reviews.moderate`): 401 AND 403 documented. */
const ADMIN = [
  ['get', '/api/v1/admin/reviews', undefined, '200'],
  ['get', '/api/v1/admin/reviews/{id}', undefined, '200'],
  ['post', '/api/v1/admin/reviews/{id}/hide', 1, '200'],
  ['post', '/api/v1/admin/reviews/{id}/restore', 1, '200'],
  ['post', '/api/v1/admin/reviews/{id}/remove', 1, '200'],
] as const;

describe('Swagger documentation of reviews (e2e)', () => {
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

  it('documents exactly the 2 public, 4 authenticated and 5 admin review routes', () => {
    const documented = Object.entries(doc.paths)
      .filter(([path]) => path.includes('review'))
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method} ${path}`),
      );
    const expected = [...PUBLIC, ...AUTHENTICATED, ...ADMIN].map(
      ([method, path]) => `${method} ${path}`,
    );
    expect(documented.sort()).toEqual(expected.sort());
  });

  it.each(PUBLIC)('%s %s: public, with a success example and a 404', (method, path, success) => {
    const op = operation(path, method);
    expect(op?.tags?.[0]).toBe('Reviews');
    expect(op?.security ?? []).toEqual([]);
    expect(op?.responses[success]?.content?.['application/json']?.schema.example).toMatchObject({
      success: true,
    });
    expect(op?.responses).toHaveProperty('404');
  });

  it.each(AUTHENTICATED)(
    '%s %s: Bearer security, strict body, a success example and a 401',
    (method, path, bodyProps, success) => {
      const op = operation(path, method);
      expect(op?.tags?.[0]).toBe('Reviews');
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
    },
  );

  it('documents the 403 and 409 ALREADY_REVIEWED on posting a review', () => {
    const op = operation('/api/v1/places/{idOrSlug}/reviews', 'post');
    expect(op?.responses).toHaveProperty('403');
    expect(JSON.stringify(op?.responses['409'])).toContain('ALREADY_REVIEWED');
  });

  it.each(ADMIN)(
    '%s %s: Bearer security, strict body, a success example and 401/403',
    (method, path, bodyProps, success) => {
      const op = operation(path, method);
      expect(op?.tags?.[0]).toBe('Admin: Reviews');
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
      expect(op?.responses).toHaveProperty('401');
      expect(op?.responses).toHaveProperty('403');
    },
  );
});
