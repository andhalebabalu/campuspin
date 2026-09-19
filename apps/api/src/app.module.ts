import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from './common/http/http.module.js';
import { AppConfig } from './infra/config/app-config.js';
import { ConfigModule } from './infra/config/config.module.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { LoggingModule } from './infra/logging/logging.module.js';
import { HealthModule } from './modules/health/health.module.js';

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
    HttpModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
