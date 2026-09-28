import {
  Body,
  Controller,
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
  adminListOffersQuerySchema,
  adminOfferSchema,
  businessRedemptionSchema,
  createOfferSchema,
  listRedemptionsQuerySchema,
  moderationRemoveSchema,
  nearbyOffersQuerySchema,
  ownerOfferSchema,
  redemptionSchema,
  studentOfferSchema,
  updateOfferSchema,
  uuidSchema,
  verifyRedemptionSchema,
  type AdminListOffersQuery,
  type AdminOffer,
  type BusinessRedemption,
  type CreateOfferRequest,
  type ModerationRemoveRequest,
  type NearbyOffersQuery,
  type OwnerOffer,
  type PaginationQuery,
  type Redemption,
  type StudentOffer,
  type UpdateOfferRequest,
  type VerifyRedemptionRequest,
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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { OffersService } from './offers.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Offer not found' } as const;
const idParam = { schema: uuidSchema } as const;

/** Student offers: browsing, and a counter code to redeem one. */
@ApiTags('Offers')
@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Public()
  @Get('offers/nearby')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  @ResponseMessage('Offers retrieved')
  @ApiOperation({
    summary: 'Student offers near me',
    description: 'Live and usable today; nearest first with `lat`/`lng`.',
  })
  @ApiEnvelopeResponse(z.array(studentOfferSchema), { description: 'The offers.' })
  nearby(
    @Query({ schema: nearbyOffersQuerySchema }) query: NearbyOffersQuery,
  ): Promise<StudentOffer[]> {
    return this.offers.nearby(query);
  }

  @ApiBearerAuth()
  @Roles('STUDENT')
  @Post('offers/:id/redeem')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  @ResponseMessage('Show this code at the counter')
  @ApiOperation({
    summary: 'Get a code for an offer',
    description:
      'A 6-character code valid for 30 minutes, shown at the counter where staff enter it. Asking again ' +
      'returns the same live code. 409 `OFFER_LIMIT_REACHED` once used as often as allowed.',
  })
  @ApiEnvelopeResponse(redemptionSchema, { description: 'The code.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 409, 429)
  redeem(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Redemption> {
    return this.offers.redeem(actor, id, client);
  }

  @ApiBearerAuth()
  @Get('me/redemptions')
  @ResponseMessage('Offer codes retrieved')
  @ApiOperation({ summary: 'My offer codes and uses', description: 'Newest first.' })
  @ApiEnvelopeResponse(z.array(redemptionSchema), { description: 'A page of codes.' })
  @ApiErrorResponses(UNAUTHORIZED)
  mine(
    @Query({ schema: listRedemptionsQuerySchema }) query: PaginationQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<Redemption>> {
    return this.offers.myRedemptions(actor, query);
  }
}

/** A business's offers and the codes students show at the counter. */
@ApiTags('Business: Offers')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('offers')
  @ResponseMessage('Offers retrieved')
  @ApiOperation({
    summary: 'My offers',
    description: 'Every offer of every listing, newest first.',
  })
  @ApiEnvelopeResponse(z.array(ownerOfferSchema), { description: 'The offers.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(@CurrentUser() actor: AuthenticatedUser): Promise<OwnerOffer[]> {
    return this.offers.ownerList(actor);
  }

  @Post('offers')
  @ResponseMessage('Offer created')
  @ApiOperation({
    summary: 'Create a student offer',
    description: 'Students who saved the place hear about it.',
  })
  @ApiEnvelopeResponse(ownerOfferSchema, { status: 201, description: 'The offer.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 400, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Place not found',
  })
  create(
    @Body({ schema: createOfferSchema }) body: CreateOfferRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerOffer> {
    return this.offers.create(actor, body, client);
  }

  @Patch('offers/:id')
  @ResponseMessage('Offer updated')
  @ApiOperation({ summary: 'Edit, pause or resume an offer' })
  @ApiEnvelopeResponse(ownerOfferSchema, { description: 'The offer.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400, 409)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateOfferSchema }) body: UpdateOfferRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerOffer> {
    return this.offers.update(actor, id, body, client);
  }

  @Get('redemptions')
  @ResponseMessage('Redemptions retrieved')
  @ApiOperation({ summary: 'Offers used at my business', description: 'Newest first.' })
  @ApiEnvelopeResponse(z.array(businessRedemptionSchema), { description: 'A page of uses.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  redemptions(
    @Query({ schema: listRedemptionsQuerySchema }) query: PaginationQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessRedemption>> {
    return this.offers.businessRedemptions(actor, query);
  }

  @Post('redemptions/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 10 * 60_000 } })
  @ResponseMessage('Offer applied')
  @ApiOperation({
    summary: 'Use a student’s offer code',
    description: 'Each code works once, within 30 minutes, at the business that runs the offer.',
  })
  @ApiEnvelopeResponse(businessRedemptionSchema, { description: 'The use.' })
  @ApiErrorResponses(
    UNAUTHORIZED,
    FORBIDDEN,
    { status: 404, code: 'NOT_FOUND', message: 'No offer code like that' },
    409,
    429,
  )
  verify(
    @Body({ schema: verifyRedemptionSchema }) body: VerifyRedemptionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessRedemption> {
    return this.offers.verify(actor, body.code, client);
  }
}

/** Staff: take down inappropriate offers. */
@ApiTags('Admin: Services')
@ApiBearerAuth()
@Permissions('services.moderate')
@Controller('admin/offers')
export class AdminOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  @ResponseMessage('Offers retrieved')
  @ApiOperation({ summary: 'All student offers', description: 'Search by title or place name.' })
  @ApiEnvelopeResponse(z.array(adminOfferSchema), { description: 'A page of offers.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListOffersQuerySchema }) query: AdminListOffersQuery,
  ): Promise<Paginated<AdminOffer>> {
    return this.offers.adminList(query);
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Offer removed')
  @ApiOperation({ summary: 'Take an offer down', description: 'The business sees the reason.' })
  @ApiEnvelopeResponse(adminOfferSchema, { description: 'The offer.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  remove(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationRemoveSchema }) body: ModerationRemoveRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminOffer> {
    return this.offers.adminRemove(id, body, actor, client);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Offer restored as paused')
  @ApiOperation({
    summary: 'Put a removed offer back (paused)',
    description: 'The business resumes it when ready.',
  })
  @ApiEnvelopeResponse(adminOfferSchema, { description: 'The offer.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  restore(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminOffer> {
    return this.offers.adminRestore(id, actor, client);
  }
}
