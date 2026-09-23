import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminAmenity,
  type AmenityActionRequest,
  type CreateAmenityRequest,
  type UpdateAmenityRequest,
  adminAmenitySchema,
  amenityActionRequestSchema,
  createAmenityRequestSchema,
  updateAmenityRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { AdminAmenitiesService } from './admin-amenities.service.js';

const EXAMPLE_ADMIN_AMENITY = {
  id: '01a0c700-1111-7000-8000-000000000001',
  key: 'wifi',
  name: 'WiFi',
  icon: 'wifi',
  sortOrder: 0,
  status: 'ACTIVE',
};

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Amenity not found' } as const;
const idParam = { schema: uuidSchema } as const;

/**
 * Staff management of the amenity list. Every route needs the `categories.manage` permission
 * (ADMIN, SUPER_ADMIN). Amenities are never deleted, only deactivated: a place may already use one.
 */
@ApiTags('Admin: Amenities')
@ApiBearerAuth()
@Permissions('categories.manage')
@Controller('admin/amenities')
export class AdminAmenitiesController {
  constructor(private readonly amenities: AdminAmenitiesService) {}

  @Get()
  @ResponseMessage('Amenities retrieved')
  @ApiOperation({ summary: 'List all amenities (any status)' })
  @ApiEnvelopeResponse(z.array(adminAmenitySchema), {
    description: 'Every amenity.',
    example: { message: 'Amenities retrieved', data: [EXAMPLE_ADMIN_AMENITY] },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(): Promise<AdminAmenity[]> {
    return this.amenities.list();
  }

  @Post()
  @ResponseMessage('Amenity created')
  @ApiOperation({
    summary: 'Create an amenity',
    description: '`key` is permanent: places reference it.',
  })
  @ApiEnvelopeResponse(adminAmenitySchema, {
    status: 201,
    description: 'The new amenity.',
    example: { message: 'Amenity created', data: EXAMPLE_ADMIN_AMENITY },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { name: ['Name is required'] } },
    },
    UNAUTHORIZED,
    FORBIDDEN,
    { status: 409, code: 'CONFLICT', message: 'This key is already used by another amenity.' },
  )
  create(
    @Body({ schema: createAmenityRequestSchema }) body: CreateAmenityRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminAmenity> {
    return this.amenities.create(body, actor, client);
  }

  @Patch(':id')
  @ResponseMessage('Amenity updated')
  @ApiOperation({
    summary: 'Edit an amenity',
    description: 'Send only the fields to change. `key` cannot change.',
  })
  @ApiEnvelopeResponse(adminAmenitySchema, {
    description: 'The updated amenity.',
    example: { message: 'Amenity updated', data: EXAMPLE_ADMIN_AMENITY },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { _root: ['Send at least one field to change'] } },
    },
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
  )
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateAmenityRequestSchema }) body: UpdateAmenityRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminAmenity> {
    return this.amenities.update(id, body, actor, client);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Amenity activated')
  @ApiOperation({ summary: 'Activate an amenity', description: 'Repeating it is a no-op.' })
  @ApiEnvelopeResponse(adminAmenitySchema, {
    description: 'The amenity, now ACTIVE.',
    example: { message: 'Amenity activated', data: EXAMPLE_ADMIN_AMENITY },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  activate(
    @Param('id', idParam) id: string,
    @Body({ schema: amenityActionRequestSchema }) body: AmenityActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminAmenity> {
    return this.amenities.setStatus(id, 'activate', body, actor, client);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Amenity deactivated')
  @ApiOperation({
    summary: 'Deactivate an amenity',
    description: 'Nothing is deleted. Repeating it is a no-op.',
  })
  @ApiEnvelopeResponse(adminAmenitySchema, {
    description: 'The amenity, now INACTIVE.',
    example: {
      message: 'Amenity deactivated',
      data: { ...EXAMPLE_ADMIN_AMENITY, status: 'INACTIVE' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  deactivate(
    @Param('id', idParam) id: string,
    @Body({ schema: amenityActionRequestSchema }) body: AmenityActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminAmenity> {
    return this.amenities.setStatus(id, 'deactivate', body, actor, client);
  }
}
