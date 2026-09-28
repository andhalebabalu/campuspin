import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { AdminServicesController } from './admin-services.controller.js';
import { BusinessCatalogController } from './business-catalog.controller.js';
import { BusinessServicesController } from './business-services.controller.js';
import { CatalogService } from './catalog.service.js';
import { QrController } from './qr.controller.js';
import { TablesQrService } from './tables-qr.service.js';
import { MenusService } from './menus.service.js';
import { PlaceServicesService } from './place-services.service.js';
import { ServiceTypesService } from './service-types.service.js';
import { PlaceServicesController, ServiceTypesController } from './services.controller.js';

/**
 * Daily-use services: the service catalogue (quick actions), which services each place offers, and
 * mess daily menus. Owns `service_types`, `place_services`, `daily_menus`, `daily_menu_items`,
 * `service_items`, `place_tables`, `place_qr_codes`, `place_daily_stats`.
 * Imports `BusinessModule` for `BusinessAccessService` (ownership checks on business routes).
 */
@Module({
  imports: [BusinessModule],
  controllers: [
    ServiceTypesController,
    PlaceServicesController,
    BusinessServicesController,
    BusinessCatalogController,
    QrController,
    AdminServicesController,
  ],
  providers: [
    ServiceTypesService,
    PlaceServicesService,
    MenusService,
    CatalogService,
    TablesQrService,
  ],
  exports: [
    ServiceTypesService,
    PlaceServicesService,
    MenusService,
    CatalogService,
    TablesQrService,
  ],
})
export class ServicesModule {}
