import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  copyDailyMenuSchema,
  dateOnlySchema,
  listOwnerMenusQuerySchema,
  ownerDailyMenuSchema,
  placeServiceSchema,
  saveDailyMenuSchema,
  serviceTypeKeySchema,
  updatePlaceServiceSchema,
  uuidSchema,
  type CopyDailyMenuRequest,
  type ListOwnerMenusQuery,
  type OwnerDailyMenu,
  type PlaceService,
  type SaveDailyMenuRequest,
  type UpdatePlaceServiceRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MenusService } from './menus.service.js';
import { PlaceServicesService } from './place-services.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Place not found' } as const;
const placeParam = { schema: uuidSchema } as const;
const dateParam = { schema: dateOnlySchema } as const;

/**
 * A business owner's services and daily menus, per place. Every route resolves the place among the
 * caller's own businesses first: another business's place answers 404.
 */
@ApiTags('Business: Services')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business/places/:placeId')
export class BusinessServicesController {
  constructor(
    private readonly services: PlaceServicesService,
    private readonly menus: MenusService,
  ) {}

  @Get('services')
  @ResponseMessage('Services retrieved')
  @ApiOperation({
    summary: 'My place’s services',
    description: 'Every service the place can offer, switched on or not, with its settings.',
  })
  @ApiEnvelopeResponse(z.array(placeServiceSchema), { description: 'The services.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  list(
    @Param('placeId', placeParam) placeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlaceService[]> {
    return this.services.ownerList(actor, placeId);
  }

  @Put('services/:key')
  @ResponseMessage('Service updated')
  @ApiOperation({
    summary: 'Switch a service on or off, or change its settings',
    description:
      '`config` may be partial; it is merged over the current settings and checked as a whole.',
  })
  @ApiEnvelopeResponse(placeServiceSchema, { description: 'The service now.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400)
  update(
    @Param('placeId', placeParam) placeId: string,
    @Param('key', { schema: serviceTypeKeySchema }) key: string,
    @Body({ schema: updatePlaceServiceSchema }) body: UpdatePlaceServiceRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceService> {
    return this.services.ownerUpdate(actor, placeId, key, body, client);
  }

  @Get('menus')
  @ResponseMessage('Menus retrieved')
  @ApiOperation({
    summary: 'My menus',
    description:
      'Menus between `from` and `to` (default: a week back to a week ahead), newest first.',
  })
  @ApiEnvelopeResponse(z.array(ownerDailyMenuSchema), { description: 'The menus.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  listMenus(
    @Param('placeId', placeParam) placeId: string,
    @Query({ schema: listOwnerMenusQuerySchema }) query: ListOwnerMenusQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OwnerDailyMenu[]> {
    return this.menus.ownerList(actor, placeId, query);
  }

  @Put('menus/:date')
  @ResponseMessage('Menu saved')
  @ApiOperation({
    summary: 'Save a day’s menu',
    description:
      'Replaces the dishes of that day. New menus are drafts unless `publish` is true; a published menu ' +
      'stays published. Publishing notifies students who saved the mess (today and tomorrow only).',
  })
  @ApiEnvelopeResponse(ownerDailyMenuSchema, { description: 'The menu.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400)
  saveMenu(
    @Param('placeId', placeParam) placeId: string,
    @Param('date', dateParam) date: string,
    @Body({ schema: saveDailyMenuSchema }) body: SaveDailyMenuRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    return this.menus.save(actor, placeId, date, body, client);
  }

  @Post('menus/:date/publish')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Menu published')
  @ApiOperation({ summary: 'Publish a day’s menu' })
  @ApiEnvelopeResponse(ownerDailyMenuSchema, { description: 'The published menu.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  publish(
    @Param('placeId', placeParam) placeId: string,
    @Param('date', dateParam) date: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    return this.menus.publish(actor, placeId, date, client);
  }

  @Post('menus/:date/unpublish')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Menu unpublished')
  @ApiOperation({ summary: 'Turn a published menu back into a draft' })
  @ApiEnvelopeResponse(ownerDailyMenuSchema, { description: 'The draft.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  unpublish(
    @Param('placeId', placeParam) placeId: string,
    @Param('date', dateParam) date: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    return this.menus.unpublish(actor, placeId, date, client);
  }

  @Post('menus/:date/copy')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Menu copied')
  @ApiOperation({
    summary: 'Copy another day’s menu onto this day',
    description: '"Copy yesterday’s menu" or "copy today’s to tomorrow".',
  })
  @ApiEnvelopeResponse(ownerDailyMenuSchema, { description: 'This day’s menu now.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400)
  copy(
    @Param('placeId', placeParam) placeId: string,
    @Param('date', dateParam) date: string,
    @Body({ schema: copyDailyMenuSchema }) body: CopyDailyMenuRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    return this.menus.copy(actor, placeId, date, body.fromDate, client);
  }

  @Delete('menus/:date')
  @ResponseMessage('Menu deleted')
  @ApiOperation({ summary: 'Delete a day’s menu' })
  @ApiEnvelopeResponse(z.null(), { description: 'Deleted.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  async removeMenu(
    @Param('placeId', placeParam) placeId: string,
    @Param('date', dateParam) date: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<null> {
    await this.menus.remove(actor, placeId, date, client);
    return null;
  }
}
