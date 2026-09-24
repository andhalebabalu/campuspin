import { z } from 'zod';
import { parseDurationSeconds } from '../../common/utils/duration.js';

/** `15m`, `12h`, `30d` (or seconds as `900s`), converted to seconds. */
const duration = (fallback: string) =>
  z
    .string()
    .trim()
    .default(fallback)
    .refine((value) => parseDurationSeconds(value) !== undefined, {
      message: 'must be a whole number followed by s, m, h or d (for example 15m, 12h, 30d)',
    })
    .transform((value) => parseDurationSeconds(value) as number);

/** A signing secret. Blank counts as "not set" so `KEY=` in a .env file behaves like a missing key. */
const signingSecret = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .min(32, 'must be at least 32 characters (use a random 48+ character value)')
    .optional(),
);

const csvOrigins = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.url()).min(1))
    // Browsers send the bare origin, so `http://localhost:3000/` must become `http://localhost:3000`.
    .transform((origins) => origins.map((origin) => new URL(origin).origin));

/** Every environment variable the API reads. Validated once at startup (fail fast). */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    API_BASE_URL: z.url().default('http://localhost:3001'),
    WEB_BASE_URL: z.url().default('http://localhost:3000'),
    CORS_ORIGINS: csvOrigins('http://localhost:3000'),
    TRUST_PROXY: z.stringbool().default(false),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SWAGGER_ENABLED: z.stringbool().optional(),
    DATABASE_URL: z
      .string({ error: 'is required' })
      .min(1, 'is required')
      .refine((value) => value.startsWith('mysql://'), {
        message: 'must start with mysql:// (format: mysql://USER:PASSWORD@HOST:PORT/DATABASE)',
      }),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(120),
    THROTTLE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),

    // ── Authentication (Phase 3) ────────────────────────────────────────────────────────────────
    // Optional outside production (a clearly-insecure development fallback is used, with a startup
    // warning); required, distinct and non-placeholder in production (see AppConfig.productionProblems).
    JWT_ACCESS_SECRET: signingSecret,
    JWT_ACCESS_EXPIRES_IN: duration('15m'),
    JWT_REFRESH_SECRET: signingSecret,
    JWT_REFRESH_EXPIRES_IN: duration('30d'),
    EMAIL_VERIFICATION_EXPIRES_IN: duration('24h'),
    PASSWORD_RESET_EXPIRES_IN: duration('1h'),
    // Stricter per-IP limit for the sensitive auth routes (login, register, resend, forgot, reset, refresh).
    AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
    AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),

    // ── Email ───────────────────────────────────────────────────────────────────────────────────
    // `console` prints emails (including their links) to the API log: development only.
    // `memory` keeps them in an in-process outbox: automated tests only.
    EMAIL_PROVIDER: z.enum(['console', 'memory']).default('console'),
    EMAIL_FROM: z.string().trim().min(3).max(200).default('CampusPin <no-reply@localhost.test>'),
    APP_NAME: z.string().trim().min(1).max(60).default('CampusPin'),

    // ── Uploads (Phase 10) ──────────────────────────────────────────────────────────────────────
    // Uploaded images are written here (a relative path is resolved from the API's working
    // directory) and served at `${API_BASE_URL}/uploads/<file>`.
    UPLOAD_DIR: z.string().trim().min(1).default('uploads'),
  })
  .check((ctx) => {
    const { JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh } = ctx.value;
    if (access !== undefined && access === refresh) {
      ctx.issues.push({
        code: 'custom',
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
        input: refresh,
        path: ['JWT_REFRESH_SECRET'],
      });
    }
  });

export type Env = z.output<typeof envSchema>;
