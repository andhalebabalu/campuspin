import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminBusinessesService } from './admin-businesses.service.js';
import {
  AdminBusinessesController,
  AdminDashboardController,
  AdminUsersController,
} from './admin.controllers.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { AdminUsersService } from './admin-users.service.js';

/**
 * Staff administration that belongs to no single resource module: the admin home's counts, user
 * management and business verification. Imports `AuthModule` for `SessionService` (a suspension
 * or a lost role ends the user's sessions).
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminDashboardController, AdminUsersController, AdminBusinessesController],
  providers: [AdminDashboardService, AdminUsersService, AdminBusinessesService],
})
export class AdminModule {}
