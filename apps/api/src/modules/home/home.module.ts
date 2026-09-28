import { Module } from '@nestjs/common';
import { OffersModule } from '../offers/offers.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StudentHomeController } from './student-home.controller.js';
import { StudentHomeService } from './student-home.service.js';

/**
 * The student home screen: reads from the services and orders modules (and later offers and
 * bookings) so the app gets its daily dashboard in one request. Owns no tables.
 */
@Module({
  imports: [ServicesModule, OrdersModule, OffersModule, RequestsModule],
  controllers: [StudentHomeController],
  providers: [StudentHomeService],
})
export class HomeModule {}
