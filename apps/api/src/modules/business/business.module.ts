import { Module } from '@nestjs/common';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { BusinessController } from './business.controller.js';
import { BusinessService } from './business.service.js';
import { EnquiriesController } from './enquiries.controller.js';
import { LeadsService } from './leads.service.js';

/**
 * Business owners: the owner dashboard (`/business/*`) and student enquiries to a business
 * (`POST /places/:idOrSlug/enquiries`). Imports `SubmissionsModule` so owner listings go through the
 * same moderated pipeline as a student's suggestion.
 */
@Module({
  imports: [SubmissionsModule],
  controllers: [BusinessController, EnquiriesController],
  providers: [BusinessService, LeadsService],
})
export class BusinessModule {}
