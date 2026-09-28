import {
  Body,
  Controller,
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
  adminDailyMenuSchema,
  adminListMenusQuerySchema,
  adminListPlaceServicesQuerySchema,
  adminPlaceServiceSchema,
  adminServiceTypeSchema,
  adminUpdatePlaceServiceSchema,
  createServiceTypeSchema,
  moderationRemoveSchema,
  updateServiceTypeSchema,
  uuidSchema,
  type AdminDailyMenu,
  type AdminListMenusQuery,
  type AdminListPlaceServicesQuery,
  type AdminPlaceService,
  type AdminServiceType,
  type AdminUpdatePlaceServiceRequest,
  type CreateServiceTypeRequest,
  type ModerationRemoveRequest,
  type UpdateServiceTypeRequest,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { MenusService } from './menus.service.js';
import { PlaceServicesService } from './place-services.service.js';
import { ServiceTypesService } from './service-types.service.js';

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

/**
 * Staff management of services: the service catalogue and per-place overrides (`services.manage`),
 * and taking down inappropriate menus (`services.moderate`, moderators too).
 */
@ApiTags('Admin: Services')
@ApiBearerAuth()
@Controller('admin')
export class AdminServicesController {
  constructor(
    private readonly types: ServiceTypesService,
    private readonly services: PlaceServicesService,
    private readonly menus: MenusService,
  ) {}

  @Permissions('services.manage')
  @Get('service-types')
  @ResponseMessage('Service types retrieved')
  @ApiOperation({
    summary: 'All service types',
    description: 'Active and hidden, with how many places use each.',
  })
  @ApiEnvelopeResponse(z.array(adminServiceTypeSchema), { description: 'The service types.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  listTypes(): Promise<AdminServiceType[]> {
    return this.types.adminList();
  }

  @Permissions('services.manage')
  @Post('service-types')
  @ResponseMessage('Service type created')
  @ApiOperation({
    summary: 'Create a service type',
    description: 'The key and kind cannot change later. The kind decides how the service works.',
  })
  @ApiEnvelopeResponse(adminServiceTypeSchema, {
    status: 201,
    description: 'The new service type.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 400, 409)
  createType(
    @Body({ schema: createServiceTypeSchema }) body: CreateServiceTypeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminServiceType> {
    return this.types.create(body, actor, client);
  }

  @Permissions('services.manage')
  @Patch('service-types/:id')
  @ResponseMessage('Service type updated')
  @ApiOperation({ summary: 'Edit, hide or reorder a service type' })
  @ApiEnvelopeResponse(adminServiceTypeSchema, { description: 'The service type.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  updateType(
    @Param('id', idParam) id: string,
    @Body({ schema: updateServiceTypeSchema }) body: UpdateServiceTypeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminServiceType> {
    return this.types.update(id, body, actor, client);
  }

  @Permissions('services.manage')
  @Get('place-services')
  @ResponseMessage('Business services retrieved')
  @ApiOperation({
    summary: 'Services businesses have set up',
    description: 'Filter by service type key or place name.',
  })
  @ApiEnvelopeResponse(z.array(adminPlaceServiceSchema), { description: 'A page of services.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  listPlaceServices(
    @Query({ schema: adminListPlaceServicesQuerySchema }) query: AdminListPlaceServicesQuery,
  ): Promise<Paginated<AdminPlaceService>> {
    return this.services.adminList(query);
  }

  @Permissions('services.manage')
  @Patch('place-services/:id')
  @ResponseMessage('Business service updated')
  @ApiOperation({
    summary: 'Switch a business service off (or back on)',
    description: 'A service switched off by staff stays off whatever the business chooses.',
  })
  @ApiEnvelopeResponse(adminPlaceServiceSchema, { description: 'The service.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  updatePlaceService(
    @Param('id', idParam) id: string,
    @Body({ schema: adminUpdatePlaceServiceSchema }) body: AdminUpdatePlaceServiceRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlaceService> {
    return this.services.adminUpdate(id, body, actor, client);
  }

  @Permissions('services.moderate')
  @Get('menus')
  @ResponseMessage('Menus retrieved')
  @ApiOperation({ summary: 'Mess menus', description: 'Filter by date and status; newest first.' })
  @ApiEnvelopeResponse(z.array(adminDailyMenuSchema), { description: 'A page of menus.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  listMenus(
    @Query({ schema: adminListMenusQuerySchema }) query: AdminListMenusQuery,
  ): Promise<Paginated<AdminDailyMenu>> {
    return this.menus.adminList(query);
  }

  @Permissions('services.moderate')
  @Post('menus/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Menu removed')
  @ApiOperation({ summary: 'Take a menu down', description: 'The business sees the reason.' })
  @ApiEnvelopeResponse(adminDailyMenuSchema, { description: 'The menu.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  removeMenu(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationRemoveSchema }) body: ModerationRemoveRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminDailyMenu> {
    return this.menus.adminRemove(id, body, actor, client);
  }

  @Permissions('services.moderate')
  @Post('menus/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Menu restored')
  @ApiOperation({ summary: 'Put a removed menu back' })
  @ApiEnvelopeResponse(adminDailyMenuSchema, { description: 'The menu.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  restoreMenu(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminDailyMenu> {
    return this.menus.adminRestore(id, actor, client);
  }
}
