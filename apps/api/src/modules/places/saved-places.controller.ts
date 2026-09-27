import { Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  placeCardSchema,
  placeIdOrSlugSchema,
  savedPlaceIdsSchema,
  savedPlaceStateSchema,
  type PlaceCard,
  type SavedPlaceState,
} from '@platform/contracts';
import { z } from 'zod';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { SavedPlacesService } from './saved-places.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Place not found' } as const;
const placeParam = { schema: placeIdOrSlugSchema } as const;

/** My bookmarked places. */
@ApiTags('Saved places')
@ApiBearerAuth()
@Controller('me/saved-places')
export class SavedPlacesController {
  constructor(private readonly saved: SavedPlacesService) {}

  @Get()
  @ResponseMessage('Saved places retrieved')
  @ApiOperation({
    summary: 'My saved places',
    description: 'Live places only, most recently saved first.',
  })
  @ApiEnvelopeResponse(z.array(placeCardSchema), { description: 'The places.' })
  @ApiErrorResponses(UNAUTHORIZED)
  list(@CurrentUser() actor: AuthenticatedUser): Promise<PlaceCard[]> {
    return this.saved.list(actor.id);
  }

  @Get('ids')
  @ResponseMessage('Saved place ids retrieved')
  @ApiOperation({ summary: 'Ids of my saved places', description: 'For bookmark icons in lists.' })
  @ApiEnvelopeResponse(savedPlaceIdsSchema, { description: 'Place ids.' })
  @ApiErrorResponses(UNAUTHORIZED)
  ids(@CurrentUser() actor: AuthenticatedUser): Promise<string[]> {
    return this.saved.ids(actor.id);
  }

  @Put(':placeIdOrSlug')
  @ResponseMessage('Place saved')
  @ApiOperation({ summary: 'Save a place', description: 'Saving it again is a no-op.' })
  @ApiEnvelopeResponse(savedPlaceStateSchema, { description: 'Now saved.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  save(
    @Param('placeIdOrSlug', placeParam) placeIdOrSlug: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SavedPlaceState> {
    return this.saved.save(actor.id, placeIdOrSlug);
  }

  @Delete(':placeIdOrSlug')
  @ResponseMessage('Place removed from saved')
  @ApiOperation({ summary: 'Remove a saved place' })
  @ApiEnvelopeResponse(savedPlaceStateSchema, { description: 'No longer saved.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  unsave(
    @Param('placeIdOrSlug', placeParam) placeIdOrSlug: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SavedPlaceState> {
    return this.saved.unsave(actor.id, placeIdOrSlug);
  }
}
