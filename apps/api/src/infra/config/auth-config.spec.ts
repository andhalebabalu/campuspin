import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { AppConfig, ConfigError } from './app-config.js';

const DB = { DATABASE_URL: 'mysql://root:@localhost:3306/link_platform' };
const ACCESS = 'a'.repeat(48);
const REFRESH = 'b'.repeat(48);
const STRONG_SECRETS = { JWT_ACCESS_SECRET: ACCESS, JWT_REFRESH_SECRET: REFRESH };

describe('AppConfig: authentication settings', () => {
  it('has safe defaults: 15 minute access, 30 day refresh, 24 hour verification, 1 hour reset', () => {
    const { auth, email, appName } = AppConfig.fromEnv(DB);

    expect(auth.accessTtlSeconds).toBe(900);
    expect(auth.refreshTtlSeconds).toBe(30 * 86_400);
    expect(auth.emailVerificationTtlSeconds).toBe(86_400);
    expect(auth.passwordResetTtlSeconds).toBe(3600);
    expect(auth.rateLimit).toEqual({ limit: 20, ttlMs: 60_000 });
    expect(email).toEqual({ provider: 'console', from: 'LINK <no-reply@localhost.test>' });
    expect(appName).toBe('LINK');
  });

  it('reads every setting from the environment', () => {
    const { auth, email, appName } = AppConfig.fromEnv({
      ...DB,
      ...STRONG_SECRETS,
      JWT_ACCESS_EXPIRES_IN: '5m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      EMAIL_VERIFICATION_EXPIRES_IN: '12h',
      PASSWORD_RESET_EXPIRES_IN: '20m',
      AUTH_RATE_LIMIT: '5',
      AUTH_RATE_LIMIT_TTL_SECONDS: '30',
      EMAIL_PROVIDER: 'memory',
      EMAIL_FROM: 'Campus <no-reply@campus.test>',
      APP_NAME: 'Campus',
    });

    expect(auth).toMatchObject({
      accessSecret: ACCESS,
      refreshSecret: REFRESH,
      accessTtlSeconds: 300,
      refreshTtlSeconds: 7 * 86_400,
      emailVerificationTtlSeconds: 43_200,
      passwordResetTtlSeconds: 1200,
      rateLimit: { limit: 5, ttlMs: 30_000 },
      usesDevelopmentSecrets: false,
    });
    expect(email).toEqual({ provider: 'memory', from: 'Campus <no-reply@campus.test>' });
    expect(appName).toBe('Campus');
  });

  describe('signing secrets', () => {
    it('falls back to distinct built-in development secrets, and says so', () => {
      const { auth } = AppConfig.fromEnv(DB);

      expect(auth.usesDevelopmentSecrets).toBe(true);
      expect(auth.accessSecret.length).toBeGreaterThanOrEqual(32);
      expect(auth.refreshSecret.length).toBeGreaterThanOrEqual(32);
      expect(auth.accessSecret).not.toBe(auth.refreshSecret);
    });

    it('treats a blank value (KEY= in a .env file) as not set', () => {
      const { auth } = AppConfig.fromEnv({
        ...DB,
        JWT_ACCESS_SECRET: '   ',
        JWT_REFRESH_SECRET: '',
      });
      expect(auth.usesDevelopmentSecrets).toBe(true);
    });

    it('is still "development" if only one of the two is provided', () => {
      const { auth } = AppConfig.fromEnv({ ...DB, JWT_ACCESS_SECRET: ACCESS });
      expect(auth.usesDevelopmentSecrets).toBe(true);
      expect(auth.accessSecret).toBe(ACCESS);
    });

    it('rejects a secret shorter than 32 characters', () => {
      expect(() => AppConfig.fromEnv({ ...DB, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
        /JWT_ACCESS_SECRET/,
      );
    });

    it('rejects using the same secret for both token types', () => {
      const attempt = () =>
        AppConfig.fromEnv({ ...DB, JWT_ACCESS_SECRET: ACCESS, JWT_REFRESH_SECRET: ACCESS });
      expect(attempt).toThrow(ConfigError);
      expect(attempt).toThrow(/JWT_REFRESH_SECRET must differ/);
    });
  });

  describe('validation', () => {
    it.each(['15', '15 minutes', '0m', '1.5h', '-5m', 'abc'])(
      'rejects the duration %j with a helpful message',
      (value) => {
        expect(() => AppConfig.fromEnv({ ...DB, JWT_ACCESS_EXPIRES_IN: value })).toThrow(
          /JWT_ACCESS_EXPIRES_IN.*s, m, h or d/,
        );
      },
    );

    it('rejects an invalid rate limit and an unknown email provider', () => {
      expect(() => AppConfig.fromEnv({ ...DB, AUTH_RATE_LIMIT: '0' })).toThrow(/AUTH_RATE_LIMIT/);
      expect(() => AppConfig.fromEnv({ ...DB, AUTH_RATE_LIMIT: 'lots' })).toThrow(
        /AUTH_RATE_LIMIT/,
      );
      expect(() => AppConfig.fromEnv({ ...DB, EMAIL_PROVIDER: 'smtp' })).toThrow(/EMAIL_PROVIDER/);
    });
  });

  describe('productionProblems (checked by main.ts before the API starts)', () => {
    const production = (extra: Record<string, string> = {}) =>
      AppConfig.fromEnv({ ...DB, NODE_ENV: 'production', ...extra }).productionProblems();

    it('reports nothing outside production, even with the public development secrets', () => {
      expect(AppConfig.fromEnv(DB).productionProblems()).toEqual([]);
      expect(AppConfig.fromEnv({ ...DB, NODE_ENV: 'test' }).productionProblems()).toEqual([]);
    });

    it('requires both JWT secrets in production', () => {
      const problems = production();
      expect(problems).toEqual(
        expect.arrayContaining([
          expect.stringContaining('JWT_ACCESS_SECRET is required') as string,
          expect.stringContaining('JWT_REFRESH_SECRET is required') as string,
        ]),
      );
    });

    it('refuses copied-from-example placeholder secrets', () => {
      const problems = production({
        JWT_ACCESS_SECRET: 'dev-only-change-me-access-secret-generate-your-own-48-chars',
        JWT_REFRESH_SECRET: 'please-CHANGE-ME-refresh-secret-with-enough-characters-here',
      });
      expect(problems.filter((problem) => problem.includes('placeholder'))).toHaveLength(2);
    });

    it('refuses an email provider that prints one-time links to the log', () => {
      const problems = production(STRONG_SECRETS);
      expect(problems).toEqual([expect.stringContaining('EMAIL_PROVIDER=console') as string]);
      expect(production({ ...STRONG_SECRETS, EMAIL_PROVIDER: 'memory' })).toEqual([
        expect.stringContaining('EMAIL_PROVIDER=memory') as string,
      ]);
    });
  });

  describe('the shipped .env.example', () => {
    const example = parseEnv(
      readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8'),
    );

    it('is a valid development configuration as it stands', () => {
      const config = AppConfig.fromEnv(example);
      expect(config.auth.accessSecret).toBe(example.JWT_ACCESS_SECRET);
      expect(config.auth.usesDevelopmentSecrets).toBe(false);
    });

    it('cannot be run in production unchanged: its placeholder secrets are refused', () => {
      const problems = AppConfig.fromEnv({
        ...example,
        NODE_ENV: 'production',
      }).productionProblems();
      expect(problems.filter((problem) => problem.includes('placeholder'))).toHaveLength(2);
    });

    it('documents every authentication variable', () => {
      for (const name of [
        'JWT_ACCESS_SECRET',
        'JWT_ACCESS_EXPIRES_IN',
        'JWT_REFRESH_SECRET',
        'JWT_REFRESH_EXPIRES_IN',
        'EMAIL_FROM',
        'EMAIL_VERIFICATION_EXPIRES_IN',
        'PASSWORD_RESET_EXPIRES_IN',
        'AUTH_RATE_LIMIT',
        'EMAIL_PROVIDER',
      ]) {
        expect(example).toHaveProperty(name);
      }
    });
  });
});
