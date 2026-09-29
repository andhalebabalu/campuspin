import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module.js';
import { SubmissionsModule } from '../submissions/submissions.module.js';
import { BusinessAccessService } from './business-access.service.js';
import { BusinessPagesController, BusinessPlacesController } from './business-pages.controller.js';
import { BusinessPagesService } from './business-pages.service.js';
import { BusinessPlacesService } from './business-places.service.js';
import { SubscriptionsService } from './subscriptions.service.js';
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
  imports: [SubmissionsModule, PlacesModule],
  controllers: [
    BusinessController,
    EnquiriesController,
    BusinessPagesController,
    BusinessPlacesController,
  ],
  providers: [
    BusinessService,
    LeadsService,
    BusinessAccessService,
    BusinessPagesService,
    BusinessPlacesService,
    SubscriptionsService,
  ],
  exports: [BusinessAccessService, SubscriptionsService],
})
export class BusinessModule {}
