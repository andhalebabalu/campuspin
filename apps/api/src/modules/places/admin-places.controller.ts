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
  type AddPlaceImageRequest,
  type AdminListPlacesQuery,
  type AdminPlace,
  type AdminPlaceListItem,
  type CreatePlaceRequest,
  type PlaceActionRequest,
  type UpdatePlaceImageRequest,
  type UpdatePlaceRequest,
  addPlaceImageRequestSchema,
  adminListPlacesQuerySchema,
  adminPlaceListItemSchema,
  adminPlaceSchema,
  createPlaceRequestSchema,
  placeActionRequestSchema,
  updatePlaceImageRequestSchema,
  updatePlaceRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { AdminPlacesService } from './admin-places.service.js';

const EXAMPLE_ADMIN = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f785',
  slug: 'sample-mess',
  name: 'Sample Mess',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  primaryCategory: {
    id: '01a0babd-1111-7000-8000-000000000001',
    slug: 'mess',
    name: 'Mess',
    icon: 'utensils',
  },
  coverImageUrl: null,
  verified: false,
  ratingAverage: 0,
  ratingCount: 0,
  priceMin: 3000,
  priceMax: 3500,
  priceUnit: 'MONTH',
  description: null,
  address: 'Station Road, Ahilyanagar',
  country: 'India',
  phone: null,
  email: null,
  website: null,
  googleMapsUrl: null,
  latitude: 19.098,
  longitude: 74.75,
  status: 'DRAFT',
  verificationStatus: 'PENDING',
  lastVerifiedAt: null,
  isDemo: false,
  createdById: '01a0c44b-14bb-724c-98a4-00a05625e026',
  publishedAt: null,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};
const EXAMPLE_ADMIN_DETAIL = {
  ...EXAMPLE_ADMIN,
  categories: [{ ...EXAMPLE_ADMIN.primaryCategory, isPrimary: true }],
  amenities: [],
  hours: [],
  priceOptions: [],
  images: [],
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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Place not found' } as const;

const idParam = { schema: uuidSchema } as const;

/**
 * Staff management of the place directory. Every route needs the `places.manage` permission (ADMIN
 * and SUPER_ADMIN); the finer-grained `places.create`/`places.update` permissions already seeded
 * for BUSINESS_OWNER are reserved for the business-owner phase's own, ownership-scoped routes.
 * Nothing here deletes a place: places are deactivated, so history and reviews survive.
 */
@ApiTags('Admin: Places')
@ApiBearerAuth()
@Permissions('places.manage')
@Controller('admin/places')
export class AdminPlacesController {
  constructor(private readonly places: AdminPlacesService) {}

  @Get()
  @ResponseMessage('Places retrieved')
  @ApiOperation({
    summary: 'List all places (any status)',
    description:
      'Includes drafts, pending, rejected and deactivated places. Filter by `status`, `verification`, `q` ' +
      'and `city`; sort by `newest` (default), `updated` or `name`.',
  })
  @ApiEnvelopeResponse(z.array(adminPlaceListItemSchema), {
    description: 'A page of places.',
    example: {
      message: 'Places retrieved',
      data: [EXAMPLE_ADMIN],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListPlacesQuerySchema }) query: AdminListPlacesQuery,
  ): Promise<Paginated<AdminPlaceListItem>> {
    return this.places.list(query);
  }

  @Post()
  @ResponseMessage('Place created')
  @ApiOperation({
    summary: 'Create a place',
    description:
      'Starts as a DRAFT (invisible to the public) unless `status: "ACTIVE"` is sent. The slug is made from ' +
      'the name unless given. The first id in `categoryIds` becomes the primary category; every id must be a ' +
      'leaf category (not a group). `priceMin`/`priceMax`/`priceUnit` are computed from `priceOptions` in the ' +
      "primary category's default price unit. Colleges within range are linked automatically, the same as " +
      'creating a college does for its places. Unknown fields are refused, so `isDemo` or `ratingAverage` ' +
      'cannot be set here.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    status: 201,
    description: 'The new place.',
    example: { message: 'Place created', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        fields: { categoryIds: ['Category 01a0… is a group; pick one of its categories'] },
      },
    },
    UNAUTHORIZED,
    FORBIDDEN,
    { status: 409, code: 'CONFLICT', message: 'This slug is already used by another place.' },
  )
  create(
    @Body({ schema: createPlaceRequestSchema }) body: CreatePlaceRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.create(body, actor, client);
  }

  @Get(':id')
  @ResponseMessage('Place retrieved')
  @ApiOperation({ summary: 'Get one place (any status), with everything about it' })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place.',
    example: { message: 'Place retrieved', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', idParam) id: string): Promise<AdminPlace> {
    return this.places.get(id);
  }

  @Patch(':id')
  @ResponseMessage('Place updated')
  @ApiOperation({
    summary: 'Edit a place',
    description:
      'Send only the fields to change; optional text and links can be cleared with `null`. Status and ' +
      'verification have their own endpoints and are refused here. `categoryIds`, `amenityIds`, `hours` and ' +
      '`priceOptions` REPLACE the whole list when sent, and are left untouched when omitted. The slug can ' +
      'change only while the place is a DRAFT. Moving the place recomputes which colleges it serves. Saving ' +
      'values that change nothing is a harmless no-op.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The updated place.',
    example: { message: 'Place updated', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { _root: ['Unrecognized key: "status"'] } },
    },
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
    {
      status: 409,
      code: 'CONFLICT',
      message: 'The slug of a published place cannot be changed: it is part of its public link.',
    },
  )
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updatePlaceRequestSchema }) body: UpdatePlaceRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.update(id, body, actor, client);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Place activated')
  @ApiOperation({
    summary: 'Publish a place',
    description:
      'Any not-yet-active status -> ACTIVE (visible to the public). Repeating it is a no-op. `reason` is ' +
      'optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place, now ACTIVE.',
    example: { message: 'Place activated', data: { ...EXAMPLE_ADMIN_DETAIL, status: 'ACTIVE' } },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  activate(
    @Param('id', idParam) id: string,
    @Body({ schema: placeActionRequestSchema }) body: PlaceActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.setStatus(id, 'activate', body, actor, client);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Place deactivated')
  @ApiOperation({
    summary: 'Hide a place',
    description:
      'ACTIVE -> INACTIVE (removed from the public directory; nothing is deleted). Repeating it is a no-op. ' +
      'A place that was never published answers 409. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place, now INACTIVE.',
    example: {
      message: 'Place deactivated',
      data: { ...EXAMPLE_ADMIN_DETAIL, status: 'INACTIVE' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message:
      'This place has never been published, so there is nothing to deactivate. Activate it, or leave it as is.',
  })
  deactivate(
    @Param('id', idParam) id: string,
    @Body({ schema: placeActionRequestSchema }) body: PlaceActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.setStatus(id, 'deactivate', body, actor, client);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Place verified')
  @ApiOperation({
    summary: 'Mark a place as verified',
    description:
      'Staff have confirmed the details. Repeating it is a no-op. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place, now verified.',
    example: {
      message: 'Place verified',
      data: { ...EXAMPLE_ADMIN_DETAIL, verified: true, verificationStatus: 'VERIFIED' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  verify(
    @Param('id', idParam) id: string,
    @Body({ schema: placeActionRequestSchema }) body: PlaceActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.setVerification(id, 'verify', body, actor, client);
  }

  @Post(':id/unverify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Place verification removed')
  @ApiOperation({
    summary: 'Remove the verified mark',
    description:
      'Back to PENDING. Repeating it is a no-op. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place, no longer verified.',
    example: { message: 'Place verification removed', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  unverify(
    @Param('id', idParam) id: string,
    @Body({ schema: placeActionRequestSchema }) body: PlaceActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.setVerification(id, 'unverify', body, actor, client);
  }

  @Post(':id/images')
  @ResponseMessage('Image added')
  @ApiOperation({
    summary: 'Add an image',
    description:
      'Adds a link to a picture (http or https only); the picture itself is hosted elsewhere. At most 20 per ' +
      'place. The first image added becomes the cover unless `isCover` says otherwise; setting `isCover: true` ' +
      'unsets it on every other image. Lower `sortOrder` shows first; by default the image goes to the end.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    status: 201,
    description: 'The place with its updated gallery.',
    example: { message: 'Image added', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'A place can have at most 20 images. Remove one first.',
  })
  addImage(
    @Param('id', idParam) id: string,
    @Body({ schema: addPlaceImageRequestSchema }) body: AddPlaceImageRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.addImage(id, body, actor, client);
  }

  @Patch(':id/images/:imageId')
  @ResponseMessage('Image updated')
  @ApiOperation({
    summary: "Change an image's label, cover status or position",
    description:
      'Only `altText`, `isCover` and `sortOrder` can change. To use a different picture, remove this image ' +
      'and add a new one.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place with its updated gallery.',
    example: { message: 'Image updated', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Image not found',
  })
  updateImage(
    @Param('id', idParam) id: string,
    @Param('imageId', idParam) imageId: string,
    @Body({ schema: updatePlaceImageRequestSchema }) body: UpdatePlaceImageRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.updateImage(id, imageId, body, actor, client);
  }

  @Delete(':id/images/:imageId')
  @ResponseMessage('Image removed')
  @ApiOperation({
    summary: 'Remove an image',
    description:
      'Removes the link from this place. An image id that belongs to another place is a 404.',
  })
  @ApiEnvelopeResponse(adminPlaceSchema, {
    description: 'The place with its updated gallery.',
    example: { message: 'Image removed', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Image not found',
  })
  removeImage(
    @Param('id', idParam) id: string,
    @Param('imageId', idParam) imageId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPlace> {
    return this.places.removeImage(id, imageId, actor, client);
  }
}
