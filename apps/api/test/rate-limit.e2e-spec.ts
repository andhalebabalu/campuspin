import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema } from '@platform/contracts';
import request from 'supertest';
import { Public } from '../src/modules/auth/decorators/public.decorator.js';
import { createTestApp } from './support/create-test-app.js';

// Configuration is read when the app boots, so lower the limit before creating it.
process.env.THROTTLE_LIMIT = '3';
process.env.THROTTLE_TTL_SECONDS = '60';

/**
 * A real, throttled route. (Global guards only run for matched routes, never for 404s.)
 * @Public() because this test is about throttling, not authentication.
 */
@Public()
@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }
}

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [PingController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 RATE_LIMITED in the standard envelope once the limit is exceeded', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i += 1) {
      await request(server).get('/api/v1/ping').expect(200);
    }

    const limited = await request(server).get('/api/v1/ping').expect(429);

    expect(apiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('never throttles the liveness probe, even for a client that is already limited', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i += 1) {
      await request(server).get('/api/v1/health').expect(200);
    }
  });
});
