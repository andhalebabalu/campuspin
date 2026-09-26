import path from 'node:path';
import { type Env, envSchema } from './env.schema.js';
import { parseDatabaseUrl } from '../database/database-url.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Used ONLY when JWT secrets are not configured outside production, so a fresh clone runs. They are
 * public (they are in the repository), so anyone can forge tokens with them: never valid in
 * production (see `productionProblems`), and a warning is logged at startup whenever they are used.
 */
const DEV_ACCESS_SECRET = 'dev-only-insecure-access-secret-never-use-in-production';
const DEV_REFRESH_SECRET = 'dev-only-insecure-refresh-secret-never-use-in-production';
/** Values containing these are copied-from-example placeholders, never real secrets. */
const PLACEHOLDER_MARKERS = ['dev-only', 'change-me', 'changeme'];

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
  /** The product name used in emails. Branding is configuration, never architecture. */
  readonly appName: string;
  readonly auth: {
    /** Contain key material. Never log them. */
    readonly accessSecret: string;
    readonly refreshSecret: string;
    readonly accessTtlSeconds: number;
    readonly refreshTtlSeconds: number;
    readonly emailVerificationTtlSeconds: number;
    readonly passwordResetTtlSeconds: number;
    /** The stricter per-IP limit for login, register, resend, forgot, reset and refresh. */
    readonly rateLimit: { readonly limit: number; readonly ttlMs: number };
    /** True when the built-in (public!) development secrets are in use. */
    readonly usesDevelopmentSecrets: boolean;
  };
  readonly email: { readonly provider: Env['EMAIL_PROVIDER']; readonly from: string };
  /** Absolute directory uploaded files are stored in (local-disk storage). */
  readonly uploadDir: string;
  /** Absolute directory for private files (student ID photos). Never served statically. */
  readonly privateUploadDir: string;
  readonly students: {
    readonly verificationValidDays: number;
    readonly marketplaceNearbyKm: number;
  };
  private readonly suppliedSecrets: { readonly access?: string; readonly refresh?: string };

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
    this.appName = env.APP_NAME;
    this.suppliedSecrets = {
      ...(env.JWT_ACCESS_SECRET === undefined ? {} : { access: env.JWT_ACCESS_SECRET }),
      ...(env.JWT_REFRESH_SECRET === undefined ? {} : { refresh: env.JWT_REFRESH_SECRET }),
    };
    this.auth = {
      accessSecret: env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_EXPIRES_IN,
      refreshTtlSeconds: env.JWT_REFRESH_EXPIRES_IN,
      emailVerificationTtlSeconds: env.EMAIL_VERIFICATION_EXPIRES_IN,
      passwordResetTtlSeconds: env.PASSWORD_RESET_EXPIRES_IN,
      rateLimit: { limit: env.AUTH_RATE_LIMIT, ttlMs: env.AUTH_RATE_LIMIT_TTL_SECONDS * 1000 },
      usesDevelopmentSecrets:
        env.JWT_ACCESS_SECRET === undefined || env.JWT_REFRESH_SECRET === undefined,
    };
    this.email = { provider: env.EMAIL_PROVIDER, from: env.EMAIL_FROM };
    this.uploadDir = path.resolve(env.UPLOAD_DIR);
    this.privateUploadDir = path.resolve(env.PRIVATE_UPLOAD_DIR);
    // Everything under UPLOAD_DIR is served publicly: a private directory inside it would publish
    // student ID photos. Refuse to start rather than risk it.
    const inside = path.relative(this.uploadDir, this.privateUploadDir);
    if (!inside.startsWith('..') && !path.isAbsolute(inside)) {
      throw new ConfigError(
        'PRIVATE_UPLOAD_DIR must not be UPLOAD_DIR or inside it (that directory is public).',
      );
    }
    this.students = {
      verificationValidDays: env.STUDENT_VERIFICATION_VALID_DAYS,
      marketplaceNearbyKm: env.MARKETPLACE_NEARBY_KM,
    };
  }

  /**
   * Things that are acceptable on a laptop but must stop a PRODUCTION start: missing or placeholder
   * JWT secrets, and an email provider that prints one-time links to the log. Empty outside
   * production. `main.ts` refuses to boot when this is not empty.
   */
  productionProblems(): string[] {
    if (!this.isProduction) return [];
    const problems: string[] = [];
    const secrets = [
      ['JWT_ACCESS_SECRET', this.suppliedSecrets.access],
      ['JWT_REFRESH_SECRET', this.suppliedSecrets.refresh],
    ] as const;
    for (const [name, value] of secrets) {
      if (value === undefined) {
        problems.push(`${name} is required in production (a random value of 48+ characters).`);
      } else if (PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker))) {
        problems.push(`${name} still looks like a development placeholder; generate a random one.`);
      }
    }
    problems.push(
      `EMAIL_PROVIDER=${this.email.provider} is for development/tests only (it exposes one-time ` +
        'links in the log). No production email provider is implemented yet.',
    );
    return problems;
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
