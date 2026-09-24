import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CollegesModule } from '../colleges/colleges.module.js';
import { AdminSubmissionsController } from './admin-submissions.controller.js';
import { AdminSubmissionsService } from './admin-submissions.service.js';
import { DuplicateDetectionService } from './duplicate-detection.service.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsService } from './submissions.service.js';

/**
 * Student submissions: duplicate-check and create (public-facing) plus staff review (behind
 * `submissions.review`). Imports `CollegesModule` for `CollegeProximityService` (a submission's
 * resulting place needs its college links computed, exactly like a staff-created place) and
 * `AuthModule` for `RbacService` (the ownership-or-permission check on `GET /place-submissions/:id`).
 */
@Module({
  imports: [CollegesModule, AuthModule],
  controllers: [SubmissionsController, AdminSubmissionsController],
  providers: [SubmissionsService, AdminSubmissionsService, DuplicateDetectionService],
  // The business dashboard creates owners' listings through the same moderated pipeline.
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
