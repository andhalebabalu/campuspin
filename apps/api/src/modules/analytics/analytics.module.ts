import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './activity.interceptor.js';
import { ActivityService } from './activity.service.js';
import { AdminAnalyticsController, AnalyticsController } from './analytics.controller.js';

/** Visits, "last active" times and the staff activity overview. */
@Module({
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [ActivityService, { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor }],
  exports: [ActivityService],
})
export class AnalyticsModule {}
