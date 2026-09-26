import { Global, Module } from '@nestjs/common';
import {
  AdminStudentVerificationsController,
  CollegeEmailDomainsController,
} from './admin-student-verifications.controller.js';
import { AdminStudentVerificationsService } from './admin-student-verifications.service.js';
import { ProfileService } from './profile.service.js';
import { StudentAccessService } from './student-access.service.js';
import { StudentVerificationService } from './student-verification.service.js';
import { StudentsController } from './students.controller.js';

/**
 * Student verification, member profile and settings. Global so community and marketplace can ask
 * `StudentAccessService` who is a verified student of which college.
 */
@Global()
@Module({
  controllers: [
    StudentsController,
    AdminStudentVerificationsController,
    CollegeEmailDomainsController,
  ],
  providers: [
    StudentVerificationService,
    AdminStudentVerificationsService,
    ProfileService,
    StudentAccessService,
  ],
  exports: [StudentAccessService],
})
export class StudentsModule {}
