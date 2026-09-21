import { Controller, Get, Header } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppException } from '../src/common/http/app-exception.js';
import { Public } from '../src/modules/auth/decorators/public.decorator.js';
import { createTestApp } from './support/create-test-app.js';

const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

/**
 * Routes whose SUCCESSFUL answers are cacheable, but which fail in different ways. (Nest applies a
 * route's Cache-Control before the handler runs, so without a guard an error would inherit it.)
 */
@Public()
@Controller('cache-probe')
class CacheProbeController {
  @Get('ok')
  @Header('Cache-Control', PUBLIC_CACHE)
  ok() {
    return { fine: true };
  }

  @Get('bad-request')
  @Header('Cache-Control', PUBLIC_CACHE)
  badRequest() {
    throw AppException.badRequest('BAD_REQUEST', 'nope');
  }

  @Get('not-found')
  @Header('Cache-Control', PUBLIC_CACHE)
  notFound() {
    throw AppException.notFound('gone');
  }

  @Get('conflict')
  @Header('Cache-Control', PUBLIC_CACHE)
  conflict() {
    throw AppException.conflict('CONFLICT', 'clash');
  }

  @Get('boom')
  @Header('Cache-Control', PUBLIC_CACHE)
  boom() {
    throw new Error('database password is hunter2');
  }
}

describe('HTTP caching (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [CacheProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);

  it('leaves a successful public answer as the route declared it', async () => {
    expect((await get('/cache-probe/ok').expect(200)).headers['cache-control']).toBe(PUBLIC_CACHE);
  });

  it.each([
    ['a 400', '/cache-probe/bad-request', 400],
    ['a 404', '/cache-probe/not-found', 404],
    ['a 409', '/cache-probe/conflict', 409],
    ['a 500 (the unexpected kind, e.g. the database is down)', '/cache-probe/boom', 500],
    ['an unknown route', '/no-such-route', 404],
  ])(
    'never lets %s be cached, even on a route that caches its successes',
    async (_label, path, status) => {
      const response = await get(path);
      expect(response.status).toBe(status);
      expect(response.headers['cache-control']).toBe('no-store');
    },
  );

  it('does not leak internals through the 500 either', async () => {
    const response = await get('/cache-probe/boom').expect(500);
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  describe('private route groups are no-store, even for an unauthenticated 401', () => {
    it.each([
      '/auth/me',
      '/admin/colleges',
      '/admin/colleges/00000000-0000-7000-8000-000000000000',
    ])('GET %s', async (path) => {
      const response = await get(path).expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('and a POST to auth, where the real tokens travel', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  it('does not add a cache policy to routes that never asked for one (health)', async () => {
    const response = await get('/health').expect(200);
    expect(response.headers['cache-control']).toBeUndefined();
  });

  it('a look-alike of a private prefix is not mistaken for it (the middleware matches whole segments)', async () => {
    // /api/v1/authors is not the auth group. It does not exist, so it is a 404 whose no-store comes
    // from the error filter; the middleware's own whole-segment rule is unit-tested separately.
    const response = await get('/authors').expect(404);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
