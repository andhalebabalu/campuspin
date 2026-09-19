import { type Env, envSchema } from './env.schema.js';
import { parseDatabaseUrl } from '../database/database-url.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Typed, validated application configuration. Built once from the environment. */
export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly port: number;
  readonly apiBaseUrl: string;
  readonly webBaseUrl: string;
  readonly corsOrigins: readonly string[];
  readonly trustProxy: boolean;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly swaggerEnabled: boolean;
  readonly throttle: { readonly limit: number; readonly ttlMs: number };
  /** Contains credentials. Never log it; use `databaseTarget` instead. */
  readonly databaseUrl: string;

  private constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.isProduction = env.NODE_ENV === 'production';
    this.port = env.PORT;
    this.apiBaseUrl = env.API_BASE_URL.replace(/\/+$/, '');
    this.webBaseUrl = env.WEB_BASE_URL.replace(/\/+$/, '');
    this.corsOrigins = env.CORS_ORIGINS;
    this.trustProxy = env.TRUST_PROXY;
    this.logLevel = env.LOG_LEVEL;
    // Swagger is on by default outside production; an explicit value always wins.
    this.swaggerEnabled = env.SWAGGER_ENABLED ?? !this.isProduction;
    this.throttle = { limit: env.THROTTLE_LIMIT, ttlMs: env.THROTTLE_TTL_SECONDS * 1000 };
    this.databaseUrl = env.DATABASE_URL;
  }

  /** `host:port/database`, safe to print (no credentials). */
  get databaseTarget(): string {
    const { host, port, database } = parseDatabaseUrl(this.databaseUrl);
    return `${host}:${port}/${database}`;
  }

  static fromEnv(source: Record<string, string | undefined> = process.env): AppConfig {
    const result = envSchema.safeParse(source);
    if (!result.success) {
      const problems = result.error.issues
        .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
      throw new ConfigError(
        `Invalid environment configuration:\n${problems}\n\n` +
          'Copy apps/api/.env.example to apps/api/.env and adjust the values.',
      );
    }
    return new AppConfig(result.data);
  }
}
