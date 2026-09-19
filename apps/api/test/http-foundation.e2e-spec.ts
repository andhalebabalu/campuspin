import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, validationDetailsSchema } from '@platform/contracts';
import request from 'supertest';
import { z } from 'zod';
import { AppException } from '../src/common/http/app-exception.js';
import { createTestApp } from './support/create-test-app.js';

const echoBody = z.object({
  email: z.email(),
  year: z.coerce.number().int().min(1).max(6),
});
const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1) });

/** Test-only routes that exercise the shared HTTP behaviour (validation, error mapping). */
@Controller('test-support')
class TestSupportController {
  @Post('echo')
  echo(@Body({ schema: echoBody }) body: z.output<typeof echoBody>) {
    return body;
  }

  @Get('list')
  list(@Query({ schema: listQuery }) query: z.output<typeof listQuery>) {
    return query;
  }

  @Get('app-exception')
  appException() {
    throw new AppException('CONFLICT', 'Already exists', 409, { id: 'abc' });
  }

  @Get('boom')
  boom() {
    throw new Error('secret internal detail: db password is hunter2');
  }
}

describe('HTTP foundation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TestSupportController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('success envelope', () => {
    it('wraps handler data and applies zod coercion/defaults', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-support/echo')
        .send({ email: 'student@example.com', year: '2' })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: 'Success',
        data: { email: 'student@example.com', year: 2 },
      });

      const list = await request(app.getHttpServer()).get('/api/v1/test-support/list').expect(200);
      expect(list.body.data).toEqual({ page: 1 });
    });
  });

  describe('error envelope', () => {
    it('returns 404 in the standard shape with a request id', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

      const body = apiErrorSchema.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.requestId).toBeTruthy();
      expect(response.headers['x-request-id']).toBe(body.requestId);
    });

    it('returns 400 VALIDATION_ERROR with per-field details for a bad body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-support/echo')
        .send({ email: 'not-an-email', year: 99 })
        .expect(400);

      const body = apiErrorSchema.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      const details = validationDetailsSchema.parse(body.error.details);
      expect(Object.keys(details.fields).sort()).toEqual(['email', 'year']);
    });

    it('returns 400 VALIDATION_ERROR for a bad query string', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-support/list?page=abc')
        .expect(400);

      expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 BAD_REQUEST for malformed JSON', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-support/echo')
        .set('Content-Type', 'application/json')
        .send('{ "email": ')
        .expect(400);

      expect(apiErrorSchema.parse(response.body).error.code).toBe('BAD_REQUEST');
    });

    it('returns 413 PAYLOAD_TOO_LARGE above the 1 MB body limit', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/test-support/echo')
        .send({ email: 'a@example.com', filler: 'x'.repeat(1_100_000) })
        .expect(413);

      expect(apiErrorSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('renders AppException with its own code, status and details', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-support/app-exception')
        .expect(409);

      const body = apiErrorSchema.parse(response.body);
      expect(body.error).toEqual({ code: 'CONFLICT', details: { id: 'abc' } });
      expect(body.message).toBe('Already exists');
    });

    it('masks unexpected errors: 500 INTERNAL_ERROR with no internals leaked', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/test-support/boom')
        .expect(500);

      const body = apiErrorSchema.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('Something went wrong');
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
    });
  });

  describe('security', () => {
    it('sets security headers and hides the framework', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('allows the configured web origin (including preflight) and only that origin', async () => {
      const allowed = await request(app.getHttpServer())
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(allowed.status).toBe(204);
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const actual = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:3000');
      expect(actual.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(actual.headers['access-control-expose-headers']).toContain('X-Request-Id');

      const blocked = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'https://evil.example');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('reuses a well-formed caller request id and replaces a malformed one', async () => {
      const good = await request(app.getHttpServer())
        .get('/api/v1/nope')
        .set('X-Request-Id', 'client-req-12345');
      expect(good.body.requestId).toBe('client-req-12345');

      // Spaces and symbols are legal in a header value but not in an accepted request id.
      const bad = await request(app.getHttpServer())
        .get('/api/v1/nope')
        .set('X-Request-Id', 'not a valid id; {"injected": true}');
      expect(bad.body.requestId).not.toContain('injected');
      expect(bad.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(bad.headers['x-request-id']).toBe(bad.body.requestId);
    });
  });
});
