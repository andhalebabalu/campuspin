import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AddPlaceImageRequest,
  type BusinessAnalytics,
  type BusinessAnalyticsQuery,
  type OwnedPlace,
  type PublicBusiness,
  type TrackBusinessEventRequest,
  type UpdateOwnedPlaceRequest,
  type UpdatePlaceImageRequest,
  addPlaceImageRequestSchema,
  businessAnalyticsQuerySchema,
  businessAnalyticsSchema,
  ownedPlaceSchema,
  publicBusinessSchema,
  trackBusinessEventSchema,
  updateOwnedPlaceRequestSchema,
  updatePlaceImageRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BusinessPagesService } from './business-pages.service.js';
import { BusinessPlacesService } from './business-places.service.js';

const slugParam = { schema: z.string().trim().min(1).max(200) };
const idParam = { schema: uuidSchema };

const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Business not found' } as const;
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
const PLACE_NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Place not found' } as const;
const EXAMPLE_COUNTS = {
  PAGE_VIEW: 42,
  PHONE_CLICK: 5,
  WHATSAPP_CLICK: 9,
  DIRECTION_CLICK: 7,
  SHARE_CLICK: 2,
};

/** The public business page (`/business/<slug>` on the web) and its anonymous visit counter. */
@ApiTags('Businesses')
@Controller('businesses')
export class BusinessPagesController {
  constructor(private readonly pages: BusinessPagesService) {}

  @Public()
  @Get(':slug')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  @ResponseMessage('Business retrieved')
  @ApiOperation({
    summary: 'A business page',
    description:
      'Only businesses whose page is live: active, not rejected by staff and with at least one ' +
      'approved listing. Anything else (pending, suspended, rejected, unknown) is a 404.',
  })
  @ApiEnvelopeResponse(publicBusinessSchema, { description: 'The business and its live places.' })
  @ApiErrorResponses(NOT_FOUND)
  get(@Param('slug', slugParam) slug: string): Promise<PublicBusiness> {
    return this.pages.getPublic(slug);
  }

  @Public()
  @Post(':slug/events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 10 * 60_000 } })
  @ApiOperation({
    summary: 'Count a visit or a tap on a business page',
    description:
      'Anonymous: stores the business, the place (optional) and the time, never who or from where.',
  })
  @ApiErrorResponses(NOT_FOUND)
  async track(
    @Param('slug', slugParam) slug: string,
    @Body({ schema: trackBusinessEventSchema }) body: TrackBusinessEventRequest,
  ): Promise<void> {
    await this.pages.track(slug, body);
  }
}

/** The owner editing their own listings, and their page analytics. `BUSINESS_OWNER` only. */
@ApiTags('Business')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessPlacesController {
  constructor(
    private readonly places: BusinessPlacesService,
    private readonly pages: BusinessPagesService,
  ) {}

  @Get('analytics')
  @ResponseMessage('Analytics retrieved')
  @ApiOperation({
    summary: 'My business page analytics',
    description: 'Visits and taps for the last `days` days (7, 30 or 90), counted from real events.',
  })
  @ApiEnvelopeResponse(businessAnalyticsSchema, {
    description: 'Totals and a daily series.',
    example: {
      message: 'Analytics retrieved',
      data: {
        days: 7,
        totals: EXAMPLE_COUNTS,
        previousTotals: { ...EXAMPLE_COUNTS, PAGE_VIEW: 31 },
        daily: [{ day: '2026-09-29', ...EXAMPLE_COUNTS }],
        reviews: { count: 12, inPeriod: 2 },
        enquiries: { inPeriod: 3 },
      },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  analytics(
    @Query({ schema: businessAnalyticsQuerySchema }) query: BusinessAnalyticsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BusinessAnalytics> {
    return this.pages.analytics(query, actor);
  }

  @Get('places/:placeId')
  @ResponseMessage('Place retrieved')
  @ApiOperation({ summary: 'One of my places, with everything I can edit' })
  @ApiEnvelopeResponse(ownedPlaceSchema, { description: 'The place.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, PLACE_NOT_FOUND)
  get(
    @Param('placeId', idParam) placeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OwnedPlace> {
    return this.places.get(placeId, actor);
  }

  @Patch('places/:placeId')
  @ResponseMessage('Place updated')
  @ApiOperation({
    summary: 'Edit my place',
    description:
      'Details, location, categories, amenities, hours and prices. Lists (`hours`, `categoryIds`...) ' +
      'replace the whole list. Goes live at once and is recorded in the audit log.',
  })
  @ApiEnvelopeResponse(ownedPlaceSchema, { description: 'The updated place.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, PLACE_NOT_FOUND)
  update(
    @Param('placeId', idParam) placeId: string,
    @Body({ schema: updateOwnedPlaceRequestSchema }) body: UpdateOwnedPlaceRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnedPlace> {
    return this.places.update(placeId, body, actor, client);
  }

  @Post('places/:placeId/images')
  @ResponseMessage('Photo added')
  @ApiOperation({
    summary: 'Add a photo to my place',
    description: 'Upload the file first (`POST /uploads/images`), then add its URL here.',
  })
  @ApiEnvelopeResponse(ownedPlaceSchema, { status: 201, description: 'The place with the photo.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, PLACE_NOT_FOUND)
  addImage(
    @Param('placeId', idParam) placeId: string,
    @Body({ schema: addPlaceImageRequestSchema }) body: AddPlaceImageRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnedPlace> {
    return this.places.addImage(placeId, body, actor, client);
  }

  @Patch('places/:placeId/images/:imageId')
  @ResponseMessage('Photo updated')
  @ApiOperation({ summary: 'Set a photo as the cover, reorder it or change its caption' })
  @ApiEnvelopeResponse(ownedPlaceSchema, { description: 'The place.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, PLACE_NOT_FOUND)
  updateImage(
    @Param('placeId', idParam) placeId: string,
    @Param('imageId', idParam) imageId: string,
    @Body({ schema: updatePlaceImageRequestSchema }) body: UpdatePlaceImageRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnedPlace> {
    return this.places.updateImage(placeId, imageId, body, actor, client);
  }

  @Delete('places/:placeId/images/:imageId')
  @ResponseMessage('Photo removed')
  @ApiOperation({ summary: 'Remove a photo from my place' })
  @ApiEnvelopeResponse(ownedPlaceSchema, { description: 'The place.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, PLACE_NOT_FOUND)
  removeImage(
    @Param('placeId', idParam) placeId: string,
    @Param('imageId', idParam) imageId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnedPlace> {
    return this.places.removeImage(placeId, imageId, actor, client);
  }
}
