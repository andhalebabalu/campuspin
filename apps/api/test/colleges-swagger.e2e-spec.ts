import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERROR_CODES } from '@platform/contracts';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

interface Parameter {
  in: string;
  name: string;
  required?: boolean;
  schema?: {
    type?: string;
    enum?: string[];
    maximum?: number;
    minimum?: number;
    default?: unknown;
  };
}
interface Schema {
  example?: {
    success?: boolean;
    message?: string;
    data?: unknown;
    meta?: unknown;
    error?: { code?: string };
  };
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
}
interface Operation {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Parameter[];
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
}
interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
}

const PUBLIC = [
  ['get', '/api/v1/colleges', 'Colleges'],
  ['get', '/api/v1/colleges/{idOrSlug}', 'Colleges'],
] as const;

/** [method, path, request-body properties, success status] */
const ADMIN = [
  ['get', '/api/v1/admin/colleges', [], '200'],
  ['post', '/api/v1/admin/colleges', 15, '201'],
  ['get', '/api/v1/admin/colleges/{id}', [], '200'],
  ['patch', '/api/v1/admin/colleges/{id}', 14, '200'],
  ['post', '/api/v1/admin/colleges/{id}/activate', 1, '200'],
  ['post', '/api/v1/admin/colleges/{id}/deactivate', 1, '200'],
  ['post', '/api/v1/admin/colleges/{id}/verify', 1, '200'],
  ['post', '/api/v1/admin/colleges/{id}/unverify', 1, '200'],
  ['post', '/api/v1/admin/colleges/{id}/images', 3, '201'],
  ['patch', '/api/v1/admin/colleges/{id}/images/{imageId}', 2, '200'],
  ['delete', '/api/v1/admin/colleges/{id}/images/{imageId}', [], '200'],
] as const;

describe('Swagger documentation of the college API (e2e)', () => {
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

  it('documents exactly the 2 public and 11 admin college routes', () => {
    const documented = Object.entries(doc.paths)
      .filter(([path]) => path.includes('/colleges'))
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method} ${path}`),
      );
    const expected = [...PUBLIC, ...ADMIN].map(([method, path]) => `${method} ${path}`);
    expect(documented.sort()).toEqual(expected.sort());
  });

  describe('public routes', () => {
    it.each(PUBLIC)(
      '%s %s is tagged, open (no Bearer), and has no request body',
      (method, path, tag) => {
        const op = operation(path, method);
        expect(op?.tags).toEqual([tag]);
        expect(op?.summary).toBeTruthy();
        expect(op?.security ?? []).toEqual([]);
        expect(op?.requestBody).toBeUndefined();
      },
    );

    it('documents every list query parameter, with its limits, straight from the shared schema', () => {
      const parameters = Object.fromEntries(
        (operation('/api/v1/colleges', 'get')?.parameters ?? []).map((parameter) => [
          parameter.name,
          parameter,
        ]),
      );
      expect(Object.keys(parameters).sort()).toEqual([
        'city',
        'lat',
        'limit',
        'lng',
        'page',
        'q',
        'sort',
      ]);
      expect(parameters.limit?.schema).toMatchObject({
        type: 'integer',
        maximum: 50,
        minimum: 1,
        default: 20,
      });
      expect(parameters.page?.schema).toMatchObject({ type: 'integer', minimum: 1, default: 1 });
      expect(parameters.lat?.schema).toMatchObject({ type: 'number', minimum: -90, maximum: 90 });
      expect(parameters.lng?.schema).toMatchObject({ type: 'number', minimum: -180, maximum: 180 });
      expect(parameters.sort?.schema).toMatchObject({
        enum: ['name', 'nearest', 'popular', 'newest'],
        default: 'name',
      });
    });

    it('documents the :idOrSlug path parameter as required', () => {
      const [parameter] = operation('/api/v1/colleges/{idOrSlug}', 'get')?.parameters ?? [];
      expect(parameter).toMatchObject({ in: 'path', name: 'idOrSlug', required: true });
    });

    it('shows a list example with `meta`, and a detail example', () => {
      const list = operation('/api/v1/colleges', 'get')?.responses['200']?.content?.[
        'application/json'
      ]?.schema.example;
      expect(list).toMatchObject({ success: true, message: 'Colleges retrieved' });
      expect(list?.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(Array.isArray(list?.data)).toBe(true);

      const detail = operation('/api/v1/colleges/{idOrSlug}', 'get')?.responses['200']?.content?.[
        'application/json'
      ]?.schema.example;
      expect(detail?.data).toMatchObject({
        slug: 'sample-arts-science-college',
        images: expect.any(Array) as unknown[],
      });
      expect(JSON.stringify(detail)).not.toMatch(/"status"|isDemo|createdById|verificationStatus/);
    });
  });

  describe('admin routes', () => {
    it.each(ADMIN)(
      '%s %s: Bearer security, body, success and error responses',
      (method, path, body, success) => {
        const op = operation(path, method);
        expect(op?.tags).toEqual(['Admin: Colleges']);
        expect(op?.summary).toBeTruthy();
        expect(op?.security).toEqual([{ bearer: [] }]);

        const schema = op?.requestBody?.content['application/json']?.schema;
        if (typeof body === 'number') {
          expect(Object.keys(schema?.properties ?? {})).toHaveLength(body);
          // Strict: an unknown field is refused, and the docs say so.
          expect(schema?.additionalProperties).toBe(false);
        } else {
          expect(schema).toBeUndefined();
        }

        const ok = op?.responses[success]?.content?.['application/json']?.schema.example;
        expect(ok).toMatchObject({ success: true });
        expect(ok?.message).toEqual(expect.any(String));
        // Every admin route documents the two access failures.
        expect(op?.responses).toHaveProperty('401');
        if (path !== '/api/v1/admin/colleges' || method !== 'get')
          expect(op?.responses['401']).toBeDefined();
        expect(op?.responses).toHaveProperty('403');
      },
    );

    it('documents the admin list with its filters and a paged example', () => {
      const op = operation('/api/v1/admin/colleges', 'get');
      expect((op?.parameters ?? []).map((parameter) => parameter.name).sort()).toEqual([
        'city',
        'limit',
        'page',
        'q',
        'sort',
        'status',
        'verification',
      ]);
      const example = op?.responses['200']?.content?.['application/json']?.schema.example;
      expect(example?.meta).toBeDefined();
    });

    it('documents the path ids as required', () => {
      const names = (
        operation('/api/v1/admin/colleges/{id}/images/{imageId}', 'patch')?.parameters ?? []
      ).map((parameter) => `${parameter.in}:${parameter.name}:${parameter.required}`);
      expect(names.sort()).toEqual(['path:id:true', 'path:imageId:true']);
    });
  });

  it('every error example uses a real error code', () => {
    const codes = new Set<string>();
    for (const [method, path] of [...PUBLIC, ...ADMIN]) {
      for (const [status, response] of Object.entries(operation(path, method)?.responses ?? {})) {
        if (Number(status) < 400) continue;
        const code = response.content?.['application/json']?.schema.example?.error?.code;
        if (code) codes.add(code);
      }
    }
    expect([...codes].sort()).toEqual(
      expect.arrayContaining([
        'CONFLICT',
        'FORBIDDEN',
        'NOT_FOUND',
        'UNAUTHORIZED',
        'VALIDATION_ERROR',
      ]),
    );
    for (const code of codes) expect(ERROR_CODES).toContain(code);
  });

  it('documents the 404 where a college or image can be missing, and 409 where a conflict is possible', () => {
    expect(operation('/api/v1/colleges/{idOrSlug}', 'get')?.responses).toHaveProperty('404');
    expect(operation('/api/v1/admin/colleges/{id}', 'get')?.responses).toHaveProperty('404');
    expect(
      operation('/api/v1/admin/colleges/{id}/images/{imageId}', 'delete')?.responses,
    ).toHaveProperty('404');
    for (const [method, path] of [
      ['post', '/api/v1/admin/colleges'],
      ['patch', '/api/v1/admin/colleges/{id}'],
      ['post', '/api/v1/admin/colleges/{id}/deactivate'],
      ['post', '/api/v1/admin/colleges/{id}/images'],
    ] as const) {
      expect(operation(path, method)?.responses, `${method} ${path}`).toHaveProperty('409');
    }
  });
});
