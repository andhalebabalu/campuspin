import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';

/** The student marketplace: listings across nearby colleges and buyer–seller chat. */
@Module({
  controllers: [MarketplaceController, ConversationsController],
  providers: [MarketplaceService, ConversationsService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
