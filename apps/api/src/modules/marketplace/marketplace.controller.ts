import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Conversation,
  type CreateListingRequest,
  type ListListingsQuery,
  type ListMyListingsQuery,
  type Listing,
  type ListingActionRequest,
  type ListingCard,
  type MarketplaceReportRequest,
  type ReportReceipt,
  type StartConversationRequest,
  type UpdateListingRequest,
  conversationSchema,
  createListingSchema,
  listListingsQuerySchema,
  listMyListingsQuerySchema,
  listingActionSchema,
  listingCardSchema,
  listingSchema,
  marketplaceReportRequestSchema,
  reportReceiptSchema,
  startConversationSchema,
  updateListingSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ConversationsService } from './conversations.service.js';
import { MarketplaceService } from './marketplace.service.js';
import { EXAMPLE_CARD, EXAMPLE_CONVERSATION, EXAMPLE_LISTING } from './marketplace-examples.js';

const idParam = { schema: uuidSchema } as const;
const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const NOT_VERIFIED = {
  status: 403,
  code: 'STUDENT_VERIFICATION_REQUIRED',
  message: 'Only verified students can do this. Verify your college to continue.',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Listing not found' } as const;
const PAGE = { page: 1, limit: 20, total: 1, totalPages: 1 };

/**
 * The student marketplace. Every route needs a verified student: buyers and sellers are always real
 * students of a known college, and a listing reaches only the colleges its seller chose.
 */
@ApiTags('Marketplace')
@ApiBearerAuth()
@Controller()
export class MarketplaceController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly conversations: ConversationsService,
  ) {}

  @Get('marketplace/listings')
  @ResponseMessage('Listings retrieved')
  @ApiOperation({
    summary: 'Browse listings',
    description:
      '`scope`: `my_college`, `nearby` (default: colleges within the configured radius) or `city`. Only listings whose seller chose to reach my college appear.',
  })
  @ApiEnvelopeResponse(z.array(listingCardSchema), {
    description: 'A page of listings.',
    example: { message: 'Listings retrieved', data: [EXAMPLE_CARD], meta: PAGE },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_VERIFIED)
  browse(
    @Query({ schema: listListingsQuerySchema }) query: ListListingsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<ListingCard>> {
    return this.marketplace.browse(actor.id, query);
  }

  @Get('marketplace/listings/:id')
  @ResponseMessage('Listing retrieved')
  @ApiOperation({ summary: 'One listing', description: 'Outside its audience it is a 404.' })
  @ApiEnvelopeResponse(listingSchema, {
    description: 'The listing.',
    example: { message: 'Listing retrieved', data: EXAMPLE_LISTING },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_VERIFIED, NOT_FOUND)
  get(@Param('id', idParam) id: string, @CurrentUser() actor: AuthenticatedUser): Promise<Listing> {
    return this.marketplace.get(actor.id, id);
  }

  @Post('marketplace/listings')
  @ResponseMessage('Listing published')
  @ApiOperation({
    summary: 'Sell something',
    description:
      'The college is the seller’s verified college. Photos must be URLs from `POST /uploads/images`. Listings expire after 30 days unless renewed.',
  })
  @ApiEnvelopeResponse(listingSchema, {
    status: 201,
    description: 'The new listing.',
    example: { message: 'Listing published', data: { ...EXAMPLE_LISTING, mine: true } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_VERIFIED, 429)
  create(
    @Body({ schema: createListingSchema }) body: CreateListingRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Listing> {
    return this.marketplace.create(actor.id, body);
  }

  @Patch('marketplace/listings/:id')
  @ResponseMessage('Listing updated')
  @ApiOperation({ summary: 'Edit my listing' })
  @ApiEnvelopeResponse(listingSchema, {
    description: 'The listing afterwards.',
    example: { message: 'Listing updated', data: { ...EXAMPLE_LISTING, mine: true } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_FOUND, 409)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateListingSchema }) body: UpdateListingRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Listing> {
    return this.marketplace.update(actor.id, id, body);
  }

  @Post('marketplace/listings/:id/actions')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Listing updated')
  @ApiOperation({
    summary: 'Reserve, unreserve, mark sold or renew my listing',
    description: '`renew` moves the end date 30 days out and brings an expired listing back.',
  })
  @ApiEnvelopeResponse(listingSchema, {
    description: 'The listing afterwards.',
    example: {
      message: 'Listing updated',
      data: { ...EXAMPLE_LISTING, mine: true, status: 'RESERVED' },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_FOUND, 409)
  act(
    @Param('id', idParam) id: string,
    @Body({ schema: listingActionSchema }) body: ListingActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Listing> {
    return this.marketplace.act(actor.id, id, body.action);
  }

  @Delete('marketplace/listings/:id')
  @ResponseMessage('Listing deleted')
  @ApiOperation({ summary: 'Delete my listing' })
  @ApiEnvelopeResponse(z.null(), {
    description: 'Deleted.',
    example: { message: 'Listing deleted', data: null },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  async remove(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<null> {
    await this.marketplace.remove(actor.id, id);
    return null;
  }

  @Post('marketplace/listings/:id/report')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Report received')
  @ApiOperation({
    summary: 'Report a listing',
    description: 'Reporting twice returns the open report.',
  })
  @ApiEnvelopeResponse(reportReceiptSchema, {
    description: 'The report.',
    example: {
      message: 'Report received',
      data: { id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f997', status: 'PENDING' },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_FOUND)
  report(
    @Param('id', idParam) id: string,
    @Body({ schema: marketplaceReportRequestSchema }) body: MarketplaceReportRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ReportReceipt> {
    return this.marketplace.report(actor.id, id, body, client);
  }

  @Post('marketplace/listings/:id/conversations')
  @ResponseMessage('Message sent')
  @ApiOperation({
    summary: 'Message the seller',
    description:
      'Starts (or continues) my conversation about this listing. Phone numbers are never shared by the platform.',
  })
  @ApiEnvelopeResponse(conversationSchema, {
    status: 201,
    description: 'The conversation.',
    example: { message: 'Message sent', data: EXAMPLE_CONVERSATION },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_VERIFIED, NOT_FOUND)
  start(
    @Param('id', idParam) id: string,
    @Body({ schema: startConversationSchema }) body: StartConversationRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Conversation> {
    return this.conversations.start(actor.id, id, body);
  }

  @Get('me/listings')
  @ResponseMessage('Listings retrieved')
  @ApiOperation({ summary: 'My listings', description: 'Every status except deleted.' })
  @ApiEnvelopeResponse(z.array(listingCardSchema), {
    description: 'A page of my listings.',
    example: { message: 'Listings retrieved', data: [EXAMPLE_CARD], meta: PAGE },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  mine(
    @Query({ schema: listMyListingsQuerySchema }) query: ListMyListingsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<ListingCard>> {
    return this.marketplace.mine(actor.id, query);
  }
}
