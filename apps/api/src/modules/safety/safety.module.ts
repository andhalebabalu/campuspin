import { Global, Module } from '@nestjs/common';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';
import { ReportsService } from './reports.service.js';

/** Blocks and member reports, shared by community and marketplace. */
@Global()
@Module({
  controllers: [BlocksController],
  providers: [BlocksService, ReportsService],
  exports: [BlocksService, ReportsService],
})
export class SafetyModule {}
