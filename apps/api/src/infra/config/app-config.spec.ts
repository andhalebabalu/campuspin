import { AppConfig, ConfigError } from './app-config.js';

const VALID = { DATABASE_URL: 'mysql://root:@localhost:3306/link_platform' };

describe('AppConfig.fromEnv', () => {
  it('applies safe development defaults', () => {
    const config = AppConfig.fromEnv(VALID);

    expect(config.nodeEnv).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.port).toBe(3001);
    expect(config.corsOrigins).toEqual(['http://localhost:3000']);
    expect(config.swaggerEnabled).toBe(true);
    expect(config.trustProxy).toBe(false);
    expect(config.throttle).toEqual({ limit: 120, ttlMs: 60_000 });
  });

  it('accepts an XAMPP root user with an empty password', () => {
    expect(AppConfig.fromEnv(VALID).databaseTarget).toBe('localhost:3306/link_platform');
  });

  it('never exposes credentials through databaseTarget', () => {
    const config = AppConfig.fromEnv({
      DATABASE_URL: 'mysql://app:s3cret%40pw@db.internal:3307/link_platform',
    });
    expect(config.databaseTarget).toBe('db.internal:3307/link_platform');
    expect(config.databaseTarget).not.toContain('s3cret');
  });

  it('parses and normalises CORS origins', () => {
    const config = AppConfig.fromEnv({
      ...VALID,
      CORS_ORIGINS: 'http://localhost:3000/, https://app.example.com ,',
    });
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });

  it('disables Swagger by default in production but honours an explicit value', () => {
    expect(AppConfig.fromEnv({ ...VALID, NODE_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(
      AppConfig.fromEnv({ ...VALID, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })
        .swaggerEnabled,
    ).toBe(true);
    expect(AppConfig.fromEnv({ ...VALID, SWAGGER_ENABLED: 'false' }).swaggerEnabled).toBe(false);
  });

  it('fails fast with a readable message when DATABASE_URL is missing', () => {
    const attempt = () => AppConfig.fromEnv({});
    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/DATABASE_URL/);
    expect(attempt).toThrow(/\.env\.example/);
  });

  it('rejects a non-mysql database URL', () => {
    expect(() => AppConfig.fromEnv({ DATABASE_URL: 'postgres://u:p@localhost/db' })).toThrow(
      /mysql:\/\//,
    );
  });

  it('rejects an invalid port and invalid origins', () => {
    expect(() => AppConfig.fromEnv({ ...VALID, PORT: '99999' })).toThrow(ConfigError);
    expect(() => AppConfig.fromEnv({ ...VALID, CORS_ORIGINS: 'not-a-url' })).toThrow(ConfigError);
  });
});
