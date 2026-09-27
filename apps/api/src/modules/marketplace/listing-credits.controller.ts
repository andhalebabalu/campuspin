import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adjustCreditsSchema,
  adminMemberCreditsSchema,
  listingLimitSettingsSchema,
  listingQuotaSchema,
  updateListingLimitSettingsSchema,
  uuidSchema,
  type AdjustCreditsRequest,
  type AdminMemberCredits,
  type ListingLimitSettings,
  type ListingQuota,
  type UpdateListingLimitSettings,
} from '@platform/contracts';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { ListingCreditsService } from './listing-credits.service.js';

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
const idParam = { schema: uuidSchema } as const;

const EXAMPLE_SETTINGS: ListingLimitSettings = {
  enabled: true,
  mode: 'ACTIVE',
  freeListings: 3,
  startingCredits: 2,
  creditsPerListing: 1,
};

/** What a student's next listing costs. */
@ApiTags('Marketplace')
@ApiBearerAuth()
@Controller()
export class ListingQuotaController {
  constructor(private readonly credits: ListingCreditsService) {}

  @Get('me/listing-quota')
  @ResponseMessage('Listing quota retrieved')
  @ApiOperation({
    summary: 'My free listings and credits',
    description:
      'With limits off (the default) `next` is always FREE. Otherwise free listings are used first, then `creditsPerListing` credits; BLOCKED means neither is left (creating a listing then fails with 402 LISTING_LIMIT_REACHED).',
  })
  @ApiEnvelopeResponse(listingQuotaSchema, {
    description: 'The quota.',
    example: {
      message: 'Listing quota retrieved',
      data: {
        enabled: true,
        mode: 'ACTIVE',
        freeListings: 3,
        freeUsed: 3,
        credits: 2,
        creditsPerListing: 1,
        next: 'CREDITS',
        resetsAt: null,
      },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  quota(@CurrentUser() actor: AuthenticatedUser): Promise<ListingQuota> {
    return this.credits.quota(actor.id);
  }
}

/** Super admin: marketplace listing limits and each student's credits (`settings.manage`). */
@ApiTags('Admin: Marketplace limits')
@ApiBearerAuth()
@Permissions('settings.manage')
@Controller('admin')
export class AdminListingCreditsController {
  constructor(private readonly credits: ListingCreditsService) {}

  @Get('settings/listing-limits')
  @ResponseMessage('Listing limits retrieved')
  @ApiOperation({ summary: 'Marketplace listing limits' })
  @ApiEnvelopeResponse(listingLimitSettingsSchema, {
    description: 'The current settings (defaults if never set).',
    example: { message: 'Listing limits retrieved', data: EXAMPLE_SETTINGS },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  settings(): Promise<ListingLimitSettings> {
    return this.credits.settings();
  }

  @Patch('settings/listing-limits')
  @ResponseMessage('Listing limits updated')
  @ApiOperation({
    summary: 'Change marketplace listing limits',
    description:
      'Send only what changes. `startingCredits` applies to every student at once (balance = starting credits + their adjustments and spending).',
  })
  @ApiEnvelopeResponse(listingLimitSettingsSchema, {
    description: 'The new settings.',
    example: { message: 'Listing limits updated', data: EXAMPLE_SETTINGS },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  updateSettings(
    @Body({ schema: updateListingLimitSettingsSchema }) body: UpdateListingLimitSettings,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ListingLimitSettings> {
    return this.credits.updateSettings(body, actor, client);
  }

  @Get('users/:id/listing-credits')
  @ResponseMessage('Credits retrieved')
  @ApiOperation({ summary: "A member's listing credits and their history" })
  @ApiEnvelopeResponse(adminMemberCreditsSchema, {
    description: 'Balance and the last 50 changes.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'User not found',
  })
  memberCredits(@Param('id', idParam) id: string): Promise<AdminMemberCredits> {
    return this.credits.memberCredits(id);
  }

  @Post('users/:id/listing-credits')
  @ResponseMessage('Credits updated')
  @ApiOperation({
    summary: "Give or take a member's listing credits",
    description: 'A positive `amount` gives credits, a negative one takes them away. Audited.',
  })
  @ApiEnvelopeResponse(adminMemberCreditsSchema, { status: 201, description: 'The new balance.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'User not found',
  })
  adjust(
    @Param('id', idParam) id: string,
    @Body({ schema: adjustCreditsSchema }) body: AdjustCreditsRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminMemberCredits> {
    return this.credits.adjust(id, body, actor, client);
  }
}
