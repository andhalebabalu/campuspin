import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import {
  AdminBookingsController,
  BookingsController,
  BusinessBookingsController,
} from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

/** Bookings for any bookable service. Owns `bookings` and `booking_schedules`. */
@Module({
  imports: [BusinessModule],
  controllers: [BookingsController, BusinessBookingsController, AdminBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
