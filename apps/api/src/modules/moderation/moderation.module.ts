import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContentModerationService } from './content-moderation.service.js';
import {
  AdminCommunityController,
  AdminMarketplaceController,
  AdminReportsController,
} from './moderation.controllers.js';
import { ReportsAdminService } from './reports-admin.service.js';

/** Staff moderation of reports, community posts and marketplace listings. */
@Module({
  imports: [AuthModule],
  controllers: [AdminReportsController, AdminCommunityController, AdminMarketplaceController],
  providers: [ContentModerationService, ReportsAdminService],
  exports: [ReportsAdminService],
})
export class ModerationModule {}
