import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { NextFunction, Request, Response } from 'express';
import { noStoreFor } from './common/http/no-store.middleware.js';
import type { AppConfig } from './infra/config/app-config.js';
import { UPLOADS_ROUTE } from './infra/storage/image-storage.js';
import { SWAGGER_PATH, setupSwagger } from './swagger.js';

/**
 * Route groups whose responses are private to the caller and must never be cached: credentials and
 * tokens (`auth`) and staff views (`admin`). Public, user-agnostic routes set their own caching.
 */
const PRIVATE_ROUTE_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/admin',
  '/api/v1/business',
  '/api/v1/me',
  '/api/v1/orders',
  '/api/v1/qr',
] as const;

/**
 * Security headers. Swagger UI needs inline scripts/styles, so /api/docs gets a relaxed CSP;
 * every other route (the JSON API) keeps Helmet's strict defaults.
 */
function securityHeaders(config: AppConfig) {
  const common = {
    // Public assets (e.g. uploaded place photos) are loaded cross-origin by the web app.
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
    // HSTS only makes sense over HTTPS; keep it off for http://localhost.
    strictTransportSecurity: config.isProduction,
  };
  const api = helmet(common);
  const docs = helmet({
    ...common,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });
  return (req: Request, res: Response, next: NextFunction): void =>
    (req.path.startsWith(`/${SWAGGER_PATH}`) ? docs : api)(req, res, next);
}

/**
 * Applies everything that is not a module: logging, security headers, CORS, /api/v1 versioning,
 * body limits, Swagger. Shared by main.ts and the e2e tests so both run the identical app.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.use(securityHeaders(config));
  app.use(noStoreFor(PRIVATE_ROUTE_PREFIXES));
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client', 'X-App-Version', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
  // Uploaded images (local-disk storage). File names are random and immutable, so they can be
  // cached for good; Helmet's `nosniff` (applied above) stops a browser second-guessing the type.
  app.useStaticAssets(config.uploadDir, {
    prefix: `${UPLOADS_ROUTE}/`,
    index: false,
    dotfiles: 'deny',
    immutable: true,
    maxAge: '365d',
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  if (config.swaggerEnabled) {
    setupSwagger(app, config);
  }
}
