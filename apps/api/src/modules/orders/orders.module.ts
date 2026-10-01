import { InvoicesModule } from '../invoices/invoices.module.js';
import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { OffersModule } from '../offers/offers.module.js';
import { ServicesModule } from '../services/services.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { InsightsService } from './insights.service.js';
import {
  AdminOrdersController,
  BusinessOrdersController,
  OrdersController,
} from './orders.controller.js';
import { OrdersService } from './orders.service.js';

/**
 * Orders students place with businesses (food now, print next) and the business dashboard numbers.
 * Owns `service_orders` and `service_order_items`. Imports `ServicesModule` for table QR tokens.
 */
@Module({
  imports: [BusinessModule, ServicesModule, OffersModule, UploadsModule, InvoicesModule],
  controllers: [OrdersController, BusinessOrdersController, AdminOrdersController],
  providers: [OrdersService, InsightsService],
  exports: [OrdersService],
})
export class OrdersModule {}
