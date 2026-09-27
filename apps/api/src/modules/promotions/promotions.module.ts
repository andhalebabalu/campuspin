import { Module } from '@nestjs/common';
import { AdminPromotionsController, PromotionsController } from './promotions.controller.js';
import { PromotionsService } from './promotions.service.js';

/** In-app ads and announcements: the splash ad and the Featured section, and their admin. */
@Module({
  controllers: [PromotionsController, AdminPromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
