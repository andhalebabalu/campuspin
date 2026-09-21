import { HttpStatus } from '@nestjs/common';
import { apiErrorSchema } from '@platform/contracts';
import {
  type AuthTestContext,
  STRONG_PASSWORD,
  createAuthTestContext,
  testEmail,
} from './support/auth-e2e.js';

// Configuration is read when the app boots, so set the limits BEFORE creating it.
process.env.AUTH_RATE_LIMIT = '3';
process.env.AUTH_RATE_LIMIT_TTL_SECONDS = '60';
process.env.THROTTLE_LIMIT = '50'; // the general limit stays far above the auth limit

describe('Auth rate limiting (e2e, real database)', () => {
  let ctx: AuthTestContext;

  beforeAll(async () => {
    ctx = await createAuthTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('answers 429 RATE_LIMITED (standard envelope, Retry-After) after AUTH_RATE_LIMIT login attempts', async () => {
    const attempt = () =>
      ctx.post('/api/v1/auth/login').send({ email: testEmail('brute'), password: 'Wrong-Guess-1' });

    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(HttpStatus.UNAUTHORIZED);
    }

    const limited = await attempt();
    expect(limited.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(apiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts each auth route separately, so one limited route does not lock out the others', async () => {
    // Login is exhausted by the previous test; registering is a different route with its own budget.
    const response = await ctx
      .post('/api/v1/auth/register')
      .send({ name: 'Rate Limit', email: testEmail('ratelimit'), password: STRONG_PASSWORD });
    expect(response.status).toBe(HttpStatus.CREATED);
  });

  it('applies the limit to the other sensitive routes too (forgot-password)', async () => {
    const attempt = () =>
      ctx.post('/api/v1/auth/forgot-password').send({ email: testEmail('spam') });
    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(HttpStatus.OK);
    }
    expect((await attempt()).status).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('never throttles the health probe', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await ctx.get('/api/v1/health')).status).toBe(HttpStatus.OK);
    }
  });

  it('runs the rate limit before authentication, so anonymous floods are throttled too', async () => {
    // /auth/me is not an @AuthRateLimit() route, so it uses the general limit (50): a flood of
    // unauthenticated requests reaches 429 without ever being answered 401 forever.
    const statuses: number[] = [];
    for (let i = 0; i < 55; i += 1) {
      statuses.push((await ctx.get('/api/v1/auth/me')).status);
    }
    expect(statuses.slice(0, 50).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(50).every((status) => status === 429)).toBe(true);
  });
});
