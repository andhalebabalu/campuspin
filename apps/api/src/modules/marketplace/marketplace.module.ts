import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import {
  AdminListingCreditsController,
  ListingQuotaController,
} from './listing-credits.controller.js';
import { ListingCreditsService } from './listing-credits.service.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';

/** The student marketplace: listings across nearby colleges and buyer–seller chat. */
@Module({
  controllers: [
    MarketplaceController,
    ConversationsController,
    ListingQuotaController,
    AdminListingCreditsController,
  ],
  providers: [MarketplaceService, ConversationsService, ListingCreditsService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
