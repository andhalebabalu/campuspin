import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema } from '@platform/contracts';
import request from 'supertest';
import { createTestApp } from './support/create-test-app.js';

describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns exactly the documented envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok' },
      message: 'API is running',
    });
  });

  it('is served under /api/v1 only (no unversioned or unprefixed alias)', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
    await request(app.getHttpServer()).get('/api/health').expect(404);
  });

  it('GET /api/v1/health/database reports 503 in the standard error envelope when MySQL is unreachable', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/database').expect(503);

    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(body.message).toMatch(/XAMPP/);
    // The reason is specific (nothing listens on the port), not a generic timeout.
    expect(body.error.details).toMatchObject({ reason: 'SERVER_UNREACHABLE' });
    // The target is shown outside production, credentials never are.
    expect(JSON.stringify(response.body)).not.toMatch(/password/i);
  });
});
