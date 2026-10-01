import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  availabilityQuerySchema,
  availabilitySchema,
  bookingSchema,
  businessBookingSchema,
  createBookingSchema,
  listBusinessBookingsQuerySchema,
  listMyBookingsQuerySchema,
  paginationQuerySchema,
  placeIdOrSlugSchema,
  saveScheduleSchema,
  scheduleWindowSchema,
  serviceTypeKeySchema,
  updateBookingStatusSchema,
  uuidSchema,
  type Availability,
  type AvailabilityQuery,
  type Booking,
  type BusinessBooking,
  type CreateBookingRequest,
  type ListBusinessBookingsQuery,
  type ListMyBookingsQuery,
  type PaginationQuery,
  type SaveScheduleRequest,
  type ScheduleWindow,
  type UpdateBookingStatusRequest,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { RequiresCapability } from '../capabilities/requires-capability.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BookingsService } from './bookings.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const FORBIDDEN = {
  status: 403,
  code: 'FORBIDDEN',
  message: 'You do not have permission to perform this action',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Booking not found' } as const;
const idParam = { schema: uuidSchema } as const;

/** Students: free times, booking and their own bookings. */
@ApiTags('Bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Public()
  @Get('places/:idOrSlug/availability')
  @ResponseMessage('Availability retrieved')
  @ApiOperation({
    summary: 'Free times of a bookable item',
    description: 'Slots of one India day with the seats still free.',
  })
  @ApiEnvelopeResponse(availabilitySchema, { description: 'The slots.' })
  @ApiErrorResponses(400, { status: 404, code: 'NOT_FOUND', message: 'This is not bookable here' })
  availability(
    @Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string,
    @Query({ schema: availabilityQuerySchema }) query: AvailabilityQuery,
  ): Promise<Availability> {
    return this.bookings.availability(idOrSlug, query);
  }

  @ApiBearerAuth()
  @Roles('STUDENT')
  @Post('bookings')
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  @ResponseMessage('Booked')
  @ApiOperation({
    summary: 'Book a slot',
    description:
      'One of the times from availability. Confirmed at once or after the business confirms, as it chose. ' +
      '409 `SLOT_FULL` when the last seat was just taken.',
  })
  @ApiEnvelopeResponse(bookingSchema, { status: 201, description: 'The booking.' })
  @ApiErrorResponses(
    UNAUTHORIZED,
    FORBIDDEN,
    400,
    404,
    { status: 409, code: 'SLOT_FULL', message: 'That time is fully booked.' },
    429,
  )
  create(
    @Body({ schema: createBookingSchema }) body: CreateBookingRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Booking> {
    return this.bookings.create(actor, body, client);
  }

  @ApiBearerAuth()
  @Get('me/bookings')
  @ResponseMessage('Bookings retrieved')
  @ApiOperation({
    summary: 'My bookings',
    description: '`upcoming=true`: live ones still ahead, soonest first.',
  })
  @ApiEnvelopeResponse(z.array(bookingSchema), { description: 'A page of bookings.' })
  @ApiErrorResponses(UNAUTHORIZED)
  mine(
    @Query({ schema: listMyBookingsQuerySchema }) query: ListMyBookingsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<Booking>> {
    return this.bookings.mine(actor, query);
  }

  @ApiBearerAuth()
  @Post('me/bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Booking cancelled')
  @ApiOperation({
    summary: 'Cancel my booking',
    description: 'Until it starts. The seat is freed.',
  })
  @ApiEnvelopeResponse(bookingSchema, { description: 'The booking.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND, 409)
  cancel(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Booking> {
    return this.bookings.cancelMine(actor, id, client);
  }
}

/** Business: opening windows and the booking list. */
@ApiTags('Business: Bookings')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@RequiresCapability('BOOKING', 'APPOINTMENT')
@Controller('business')
export class BusinessBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('places/:placeId/schedules/:key')
  @ResponseMessage('Opening hours retrieved')
  @ApiOperation({
    summary: 'When a bookable service is open',
    description: 'Weekly windows, India time.',
  })
  @ApiEnvelopeResponse(z.array(scheduleWindowSchema), { description: 'The windows.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  schedule(
    @Param('placeId', idParam) placeId: string,
    @Param('key', { schema: serviceTypeKeySchema }) key: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ScheduleWindow[]> {
    return this.bookings.schedule(actor, placeId, key);
  }

  @Put('places/:placeId/schedules/:key')
  @ResponseMessage('Opening hours saved')
  @ApiOperation({
    summary: 'Set when a bookable service is open',
    description: 'Replaces all windows. Windows on one day must not overlap.',
  })
  @ApiEnvelopeResponse(z.array(scheduleWindowSchema), { description: 'The windows now.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 400, 404)
  saveSchedule(
    @Param('placeId', idParam) placeId: string,
    @Param('key', { schema: serviceTypeKeySchema }) key: string,
    @Body({ schema: saveScheduleSchema }) body: SaveScheduleRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ScheduleWindow[]> {
    return this.bookings.saveSchedule(actor, placeId, key, body, client);
  }

  @Get('bookings')
  @ResponseMessage('Bookings retrieved')
  @ApiOperation({
    summary: 'My bookings',
    description: '`scope=upcoming` (default, soonest first), `today` or `all`.',
  })
  @ApiEnvelopeResponse(z.array(businessBookingSchema), { description: 'A page of bookings.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: listBusinessBookingsQuerySchema }) query: ListBusinessBookingsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessBooking>> {
    return this.bookings.businessList(actor, query);
  }

  @Patch('bookings/:id/status')
  @ResponseMessage('Booking updated')
  @ApiOperation({
    summary: 'Confirm, complete, cancel or mark a no-show',
    description: 'Only allowed moves; 409 otherwise.',
  })
  @ApiEnvelopeResponse(businessBookingSchema, { description: 'The booking.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 409)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateBookingStatusSchema }) body: UpdateBookingStatusRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessBooking> {
    return this.bookings.updateStatus(actor, id, body, client);
  }
}

const adminQuery = paginationQuerySchema.extend({ q: z.string().trim().max(100).optional() });

/** Staff: the booking log. */
@ApiTags('Admin: Services')
@ApiBearerAuth()
@Permissions('services.manage')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ResponseMessage('Bookings retrieved')
  @ApiOperation({ summary: 'All bookings', description: 'Search by code or place name.' })
  @ApiEnvelopeResponse(z.array(businessBookingSchema), { description: 'A page of bookings.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminQuery }) query: PaginationQuery & { q?: string },
  ): Promise<Paginated<BusinessBooking>> {
    return this.bookings.adminList(query);
  }
}
