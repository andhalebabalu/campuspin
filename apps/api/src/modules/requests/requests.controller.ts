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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  businessServiceRequestSchema,
  createServiceRequestSchema,
  listBusinessRequestsQuerySchema,
  listMyRequestsQuerySchema,
  ownerTableRequestTypeSchema,
  paginationQuerySchema,
  saveTableRequestTypeSchema,
  serviceRequestSchema,
  updateRequestStatusSchema,
  updateTableRequestTypeSchema,
  uuidSchema,
  type BusinessServiceRequest,
  type CreateServiceRequest,
  type ListBusinessRequestsQuery,
  type ListMyRequestsQuery,
  type OwnerTableRequestType,
  type PaginationQuery,
  type SaveTableRequestTypeRequest,
  type ServiceRequest,
  type UpdateRequestStatusRequest,
  type UpdateTableRequestTypeRequest,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { sendPrivateFile } from '../uploads/send-private-file.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RequestsService } from './requests.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Request not found' } as const;
const CHANGED = {
  status: 409,
  code: 'STATUS_CHANGED',
  message: 'This request changed meanwhile.',
} as const;
const idParam = { schema: uuidSchema } as const;

/** Students asking a business for something: from a table, or a job such as a repair. */
@ApiTags('Service requests')
@ApiBearerAuth()
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Roles('STUDENT')
  @Post('service-requests')
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @ResponseMessage('Request sent')
  @ApiOperation({
    summary: 'Send a request',
    description:
      '`TABLE`: from a scanned table code ("Water"); asking again while it is open returns the same ' +
      'request. `GENERAL`: a job (repair, laundry) with a description.',
  })
  @ApiEnvelopeResponse(serviceRequestSchema, { status: 201, description: 'The request.' })
  @ApiErrorResponses(
    UNAUTHORIZED,
    FORBIDDEN,
    400,
    404,
    { status: 409, code: 'SERVICE_UNAVAILABLE_NOW', message: 'Not taking requests.' },
    410,
    429,
  )
  create(
    @Body({ schema: createServiceRequestSchema }) body: CreateServiceRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ServiceRequest> {
    return this.requests.create(actor, body, client);
  }

  @Get('me/service-requests')
  @ResponseMessage('Requests retrieved')
  @ApiOperation({
    summary: 'My requests',
    description: 'Newest first; `active=true` leaves out finished ones.',
  })
  @ApiEnvelopeResponse(z.array(serviceRequestSchema), { description: 'A page of requests.' })
  @ApiErrorResponses(UNAUTHORIZED)
  mine(
    @Query({ schema: listMyRequestsQuerySchema }) query: ListMyRequestsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<ServiceRequest>> {
    return this.requests.mine(actor, query);
  }

  @Get('me/service-requests/:id')
  @ResponseMessage('Request retrieved')
  @ApiOperation({
    summary: 'One of my requests',
    description: 'With its timeline and any estimate.',
  })
  @ApiEnvelopeResponse(serviceRequestSchema, { description: 'The request.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  one(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ServiceRequest> {
    return this.requests.myRequest(actor, id);
  }

  @Get('me/service-requests/:id/photo')
  @ApiOperation({
    summary: 'The photo of my request',
    description:
      'The file itself (not JSON), never cached. Only for the student who asked. Deleted once the job is finished; each opening is audited.',
  })
  @ApiOkResponse({
    description: 'The file.',
    content: { 'application/pdf': {}, 'image/jpeg': {}, 'image/png': {}, 'image/webp': {} },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  async photo(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
    @Res() res: Response,
  ): Promise<void> {
    sendPrivateFile(res, await this.requests.myPhoto(actor, id, client));
  }

  @Post('me/service-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Request cancelled')
  @ApiOperation({ summary: 'Cancel my request', description: 'Until work has started.' })
  @ApiEnvelopeResponse(serviceRequestSchema, { description: 'The request.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND, CHANGED)
  cancel(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ServiceRequest> {
    return this.requests.cancelMine(actor, id, client);
  }

  @Post('me/service-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Estimate approved')
  @ApiOperation({
    summary: 'Approve the estimate',
    description: 'The business can then start the work.',
  })
  @ApiEnvelopeResponse(serviceRequestSchema, { description: 'The request.' })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND, CHANGED)
  approve(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ServiceRequest> {
    return this.requests.approveEstimate(actor, id, client);
  }
}

/** The business's request inbox and its table request menu. */
@ApiTags('Business: Requests')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('requests')
  @ResponseMessage('Requests retrieved')
  @ApiOperation({
    summary: 'My requests',
    description: '`scope=active` (default, oldest first), `today` or `all`. Poll it.',
  })
  @ApiEnvelopeResponse(z.array(businessServiceRequestSchema), {
    description: 'A page of requests.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: listBusinessRequestsQuerySchema }) query: ListBusinessRequestsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessServiceRequest>> {
    return this.requests.businessList(actor, query);
  }

  @Get('requests/:id/photo')
  @ApiOperation({
    summary: 'A request’s photo',
    description:
      'The file itself (not JSON), never cached. Only for the business the request was sent to. Deleted once the job is finished; each opening is audited.',
  })
  @ApiOkResponse({
    description: 'The file.',
    content: { 'application/pdf': {}, 'image/jpeg': {}, 'image/png': {}, 'image/webp': {} },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  async photo(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
    @Res() res: Response,
  ): Promise<void> {
    sendPrivateFile(res, await this.requests.businessPhoto(actor, id, client));
  }

  @Patch('requests/:id/status')
  @ResponseMessage('Request updated')
  @ApiOperation({
    summary: 'Move a request on',
    description:
      'Acknowledge or complete a table request; accept, estimate, start, finish a job. Only allowed moves.',
  })
  @ApiEnvelopeResponse(businessServiceRequestSchema, { description: 'The request.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, 400, CHANGED)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateRequestStatusSchema }) body: UpdateRequestStatusRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessServiceRequest> {
    return this.requests.updateStatus(actor, id, body, client);
  }

  @Get('places/:placeId/request-types')
  @ResponseMessage('Table requests retrieved')
  @ApiOperation({
    summary: 'What students can ask for from a table',
    description: 'The usual ones are added the first time.',
  })
  @ApiEnvelopeResponse(z.array(ownerTableRequestTypeSchema), { description: 'The requests.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Place not found',
  })
  types(
    @Param('placeId', idParam) placeId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OwnerTableRequestType[]> {
    return this.requests.requestTypes(actor, placeId);
  }

  @Post('places/:placeId/request-types')
  @ResponseMessage('Table request added')
  @ApiOperation({ summary: 'Add a table request' })
  @ApiEnvelopeResponse(z.array(ownerTableRequestTypeSchema), {
    status: 201,
    description: 'All table requests now.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 400, 404)
  addType(
    @Param('placeId', idParam) placeId: string,
    @Body({ schema: saveTableRequestTypeSchema }) body: SaveTableRequestTypeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerTableRequestType[]> {
    return this.requests.addRequestType(actor, placeId, body, client);
  }

  @Patch('places/:placeId/request-types/:typeId')
  @ResponseMessage('Table request updated')
  @ApiOperation({ summary: 'Rename, reorder or switch off a table request' })
  @ApiEnvelopeResponse(z.array(ownerTableRequestTypeSchema), {
    description: 'All table requests now.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  updateType(
    @Param('placeId', idParam) placeId: string,
    @Param('typeId', idParam) typeId: string,
    @Body({ schema: updateTableRequestTypeSchema }) body: UpdateTableRequestTypeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerTableRequestType[]> {
    return this.requests.updateRequestType(actor, placeId, typeId, body, client);
  }

  @Delete('places/:placeId/request-types/:typeId')
  @ResponseMessage('Table request deleted')
  @ApiOperation({ summary: 'Delete a table request' })
  @ApiEnvelopeResponse(z.array(ownerTableRequestTypeSchema), {
    description: 'All table requests now.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, 404)
  deleteType(
    @Param('placeId', idParam) placeId: string,
    @Param('typeId', idParam) typeId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<OwnerTableRequestType[]> {
    return this.requests.deleteRequestType(actor, placeId, typeId, client);
  }
}

const adminQuery = paginationQuerySchema.extend({ q: z.string().trim().max(100).optional() });

/** Staff: the request log across businesses. */
@ApiTags('Admin: Services')
@ApiBearerAuth()
@Permissions('services.manage')
@Controller('admin/service-requests')
export class AdminRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ResponseMessage('Requests retrieved')
  @ApiOperation({ summary: 'All service requests', description: 'Search by code or place name.' })
  @ApiEnvelopeResponse(z.array(businessServiceRequestSchema), {
    description: 'A page of requests.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminQuery }) query: PaginationQuery & { q?: string },
  ): Promise<Paginated<BusinessServiceRequest>> {
    return this.requests.adminList(query);
  }
}
