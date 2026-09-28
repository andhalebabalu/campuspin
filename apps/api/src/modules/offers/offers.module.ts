import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import {
  AdminOffersController,
  BusinessOffersController,
  OffersController,
} from './offers.controller.js';
import { OffersService } from './offers.service.js';

/**
 * Student offers and their redemption. Owns `student_offers` and `offer_redemptions`. Exported so
 * orders can apply an offer and the home screen can show nearby ones.
 */
@Module({
  imports: [BusinessModule],
  controllers: [OffersController, BusinessOffersController, AdminOffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
