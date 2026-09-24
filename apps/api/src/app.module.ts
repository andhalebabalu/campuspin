import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/http/app-throttler.guard.js';
import { HttpModule } from './common/http/http.module.js';
import { AppConfig } from './infra/config/app-config.js';
import { ConfigModule } from './infra/config/config.module.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { EmailModule } from './infra/email/email.module.js';
import { LoggingModule } from './infra/logging/logging.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CollegesModule } from './modules/colleges/colleges.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PlacesModule } from './modules/places/places.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.throttle.ttlMs, limit: config.throttle.limit }],
      }),
    }),
    DatabaseModule,
    EmailModule,
    AuditModule,
    HttpModule,
    AuthModule,
    CollegesModule,
    CategoriesModule,
    PlacesModule,
    SubmissionsModule,
    ReviewsModule,
    HealthModule,
  ],
  providers: [
    // Global guards run in the order listed, on every route:
    //   1. rate limit  - first, so brute force is slowed even for unauthenticated callers
    //   2. authenticate - SECURE BY DEFAULT: 401 unless the route says @Public()
    //   3. roles        - enforces @Roles(...)        (403)
    //   4. permissions  - enforces @Permissions(...)  (403)
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
