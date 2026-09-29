import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { ServicesModule } from '../services/services.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import {
  AdminRequestsController,
  BusinessRequestsController,
  RequestsController,
} from './requests.controller.js';
import { RequestsService } from './requests.service.js';

/**
 * Service requests: table requests and jobs (repair, laundry). Owns `service_requests` and
 * `table_request_types`. Imports `ServicesModule` to read the table behind a scanned code.
 */
@Module({
  imports: [BusinessModule, ServicesModule, UploadsModule],
  controllers: [RequestsController, BusinessRequestsController, AdminRequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
