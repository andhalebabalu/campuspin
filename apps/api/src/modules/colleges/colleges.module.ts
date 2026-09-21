import { Module } from '@nestjs/common';
import { AdminCollegesController } from './admin-colleges.controller.js';
import { AdminCollegesService } from './admin-colleges.service.js';
import { CollegeProximityService } from './college-proximity.service.js';
import { CollegesController } from './colleges.controller.js';
import { CollegesService } from './colleges.service.js';

/**
 * The college directory: a public, cacheable read API and the staff API behind `colleges.manage`.
 * `CollegeProximityService` is exported because places (a later phase) must refresh college links
 * when a place is created or moved.
 */
@Module({
  controllers: [CollegesController, AdminCollegesController],
  providers: [CollegesService, AdminCollegesService, CollegeProximityService],
  exports: [CollegeProximityService],
})
export class CollegesModule {}
