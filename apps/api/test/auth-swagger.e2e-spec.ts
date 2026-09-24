import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERROR_CODES } from '@platform/contracts';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

interface Operation {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    content: Record<
      string,
      { schema: { properties?: Record<string, unknown>; required?: string[] } }
    >;
  };
  responses: Record<string, { content?: Record<string, { schema: SchemaWithExample }> }>;
}
interface SchemaWithExample {
  example?: { success?: boolean; message?: string; data?: unknown; error?: { code?: string } };
}
interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes: Record<string, { type: string; scheme: string; bearerFormat: string }>;
  };
}

/** [method, path, request body fields (or none), success status, needs a Bearer token] */
const AUTH_ENDPOINTS = [
  [
    'post',
    '/api/v1/auth/register',
    ['name', 'email', 'password', 'accountType', 'businessName'],
    '201',
    false,
  ],
  ['post', '/api/v1/auth/verify-email', ['token'], '200', false],
  ['post', '/api/v1/auth/resend-verification', ['email'], '200', false],
  ['post', '/api/v1/auth/login', ['email', 'password'], '200', false],
  ['post', '/api/v1/auth/refresh', ['refreshToken'], '200', false],
  ['post', '/api/v1/auth/logout', [], '200', true],
  ['post', '/api/v1/auth/logout-all', [], '200', true],
  ['get', '/api/v1/auth/me', [], '200', true],
  ['post', '/api/v1/auth/forgot-password', ['email'], '200', false],
  ['post', '/api/v1/auth/reset-password', ['token', 'newPassword'], '200', false],
] as const;

describe('Swagger documentation of authentication (e2e)', () => {
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

  it('documents all 10 authentication endpoints under the Auth tag', () => {
    const documented = Object.entries(doc.paths)
      .filter(([path]) => path.startsWith('/api/v1/auth/'))
      .flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method} ${path}`),
      );

    expect(documented.sort()).toEqual(
      AUTH_ENDPOINTS.map(([method, path]) => `${method} ${path}`).sort(),
    );
    for (const [method, path] of AUTH_ENDPOINTS) {
      expect(doc.paths[path]?.[method]?.tags).toEqual(['Auth']);
      expect(doc.paths[path]?.[method]?.summary).toBeTruthy();
    }
  });

  it('declares the Bearer JWT security scheme', () => {
    expect(doc.components.securitySchemes.bearer).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it.each(AUTH_ENDPOINTS)(
    '%s %s: request body, security and responses',
    (method, path, fields, success, needsBearer) => {
      const operation = doc.paths[path]?.[method];
      expect(operation).toBeDefined();

      // Request body comes from the shared zod schema.
      const body = operation?.requestBody?.content['application/json']?.schema;
      if (fields.length === 0) expect(body).toBeUndefined();
      else expect(Object.keys(body?.properties ?? {}).sort()).toEqual([...fields].sort());

      // Only the three protected routes advertise a Bearer requirement.
      expect(operation?.security ?? []).toEqual(needsBearer ? [{ bearer: [] }] : []);

      // A success response with an example in the standard envelope.
      const ok = operation?.responses[success]?.content?.['application/json']?.schema;
      expect(ok?.example).toMatchObject({ success: true });
      expect(ok?.example?.message).toEqual(expect.any(String));
      expect(ok?.example).toHaveProperty('data');
    },
  );

  it('documents error responses with examples that use real error codes', () => {
    const codes = new Set<string>();
    for (const [method, path] of AUTH_ENDPOINTS) {
      const responses = doc.paths[path]?.[method]?.responses ?? {};
      const errorStatuses = Object.keys(responses).filter((status) => Number(status) >= 400);
      expect(errorStatuses.length).toBeGreaterThan(0);
      for (const status of errorStatuses) {
        const example = responses[status]?.content?.['application/json']?.schema.example;
        if (example?.error?.code) codes.add(example.error.code);
      }
    }

    // The interesting auth outcomes are all shown somewhere.
    expect([...codes].sort()).toEqual(
      expect.arrayContaining([
        'ACCOUNT_SUSPENDED',
        'EMAIL_ALREADY_REGISTERED',
        'EMAIL_NOT_VERIFIED',
        'INVALID_CREDENTIALS',
        'TOKEN_EXPIRED',
        'TOKEN_INVALID',
        'UNAUTHORIZED',
        'VALIDATION_ERROR',
      ]),
    );
    for (const code of codes) expect(ERROR_CODES).toContain(code);
  });

  it('documents 429 on every route that is rate limited', () => {
    for (const [method, path, , , needsBearer] of AUTH_ENDPOINTS) {
      if (needsBearer) continue;
      expect(doc.paths[path]?.[method]?.responses).toHaveProperty('429');
    }
  });

  it('shows the login response example without any secret material, and never a hash', () => {
    const login =
      doc.paths['/api/v1/auth/login']?.post?.responses['200']?.content?.['application/json']?.schema
        .example;
    const text = JSON.stringify(login);
    expect(text).toContain('accessToken');
    expect(text).not.toMatch(/passwordHash|argon2/i);
  });
});
