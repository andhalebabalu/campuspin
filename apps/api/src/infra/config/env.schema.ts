import { z } from 'zod';

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
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_BASE_URL: z.url().default('http://localhost:3001'),
  WEB_BASE_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: csvOrigins('http://localhost:3000'),
  TRUST_PROXY: z.stringbool().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SWAGGER_ENABLED: z.stringbool().optional(),
  DATABASE_URL: z
    .string({ error: 'is required' })
    .min(1, 'is required')
    .refine((value) => value.startsWith('mysql://'), {
      message: 'must start with mysql:// (format: mysql://USER:PASSWORD@HOST:PORT/DATABASE)',
    }),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(120),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
});

export type Env = z.output<typeof envSchema>;
