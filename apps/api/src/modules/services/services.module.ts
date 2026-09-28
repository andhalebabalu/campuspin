import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { AdminServicesController } from './admin-services.controller.js';
import { BusinessServicesController } from './business-services.controller.js';
import { MenusService } from './menus.service.js';
import { PlaceServicesService } from './place-services.service.js';
import { ServiceTypesService } from './service-types.service.js';
import {
  PlaceServicesController,
  ServiceTypesController,
  StudentHomeController,
} from './services.controller.js';
import { StudentHomeService } from './student-home.service.js';

/**
 * Daily-use services: the service catalogue (quick actions), which services each place offers, and
 * mess daily menus. Owns `service_types`, `place_services`, `daily_menus`, `daily_menu_items`.
 * Imports `BusinessModule` for `BusinessAccessService` (ownership checks on business routes).
 */
@Module({
  imports: [BusinessModule],
  controllers: [
    ServiceTypesController,
    PlaceServicesController,
    StudentHomeController,
    BusinessServicesController,
    AdminServicesController,
  ],
  providers: [ServiceTypesService, PlaceServicesService, MenusService, StudentHomeService],
  exports: [ServiceTypesService, PlaceServicesService, MenusService],
})
export class ServicesModule {}
