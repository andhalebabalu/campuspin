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
import { StorageModule } from './infra/storage/storage.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BusinessModule } from './modules/business/business.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CollegesModule } from './modules/colleges/colleges.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PlacesModule } from './modules/places/places.module.js';
import { PromotionsModule } from './modules/promotions/promotions.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { HomeModule } from './modules/home/home.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { CommunityModule } from './modules/community/community.module.js';
import { MarketplaceModule } from './modules/marketplace/marketplace.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { SubmissionsModule } from './modules/submissions/submissions.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';

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
    StorageModule,
    AuditModule,
    HttpModule,
    AuthModule,
    CollegesModule,
    CategoriesModule,
    PlacesModule,
    SubmissionsModule,
    ReviewsModule,
    NotificationsModule,
    StudentsModule,
    SafetyModule,
    CommunityModule,
    MarketplaceModule,
    ModerationModule,
    BusinessModule,
    ServicesModule,
    OrdersModule,
    HomeModule,
    UploadsModule,
    PromotionsModule,
    AnalyticsModule,
    AdminModule,
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
