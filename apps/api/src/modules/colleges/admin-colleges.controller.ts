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
  type AddCollegeImageRequest,
  type AdminCollege,
  type AdminCollegeListItem,
  type AdminListCollegesQuery,
  type CollegeActionRequest,
  type CreateCollegeRequest,
  type UpdateCollegeImageRequest,
  type UpdateCollegeRequest,
  addCollegeImageRequestSchema,
  adminCollegeListItemSchema,
  adminCollegeSchema,
  adminListCollegesQuerySchema,
  collegeActionRequestSchema,
  createCollegeRequestSchema,
  updateCollegeImageRequestSchema,
  updateCollegeRequestSchema,
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
import { AdminCollegesService } from './admin-colleges.service.js';

const EXAMPLE_ADMIN = {
  id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
  slug: 'sample-arts-science-college',
  name: 'Sample Arts & Science College',
  shortName: 'Sample ASC',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  logoUrl: null,
  coverImageUrl: null,
  verified: false,
  placeCount: 14,
  description: null,
  address: 'Station Road, Ahilyanagar',
  country: 'India',
  website: null,
  latitude: 19.096,
  longitude: 74.748,
  serviceRadiusMeters: 5000,
  status: 'DRAFT',
  verificationStatus: 'PENDING',
  isDemo: false,
  createdById: '01a0c44b-14bb-724c-98a4-00a05625e026',
  createdAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:00:00.000Z',
};
const EXAMPLE_ADMIN_DETAIL = { ...EXAMPLE_ADMIN, images: [] };

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'College not found' } as const;

const idParam = { schema: uuidSchema } as const;

/**
 * Staff management of the college directory. Every route needs the `colleges.manage` permission
 * (ADMIN and SUPER_ADMIN), and every change is recorded in `audit_logs`. Nothing here deletes a
 * college: colleges are deactivated, so history and student links survive.
 */
@ApiTags('Admin: Colleges')
@ApiBearerAuth()
@Permissions('colleges.manage')
@Controller('admin/colleges')
export class AdminCollegesController {
  constructor(private readonly colleges: AdminCollegesService) {}

  @Get()
  @ResponseMessage('Colleges retrieved')
  @ApiOperation({
    summary: 'List all colleges (any status)',
    description:
      'Includes drafts and deactivated colleges. Filter by `status`, `verification`, `q` and `city`; ' +
      'sort by `newest` (default), `updated` or `name`.',
  })
  @ApiEnvelopeResponse(z.array(adminCollegeListItemSchema), {
    description: 'A page of colleges.',
    example: {
      message: 'Colleges retrieved',
      data: [EXAMPLE_ADMIN],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListCollegesQuerySchema }) query: AdminListCollegesQuery,
  ): Promise<Paginated<AdminCollegeListItem>> {
    return this.colleges.list(query);
  }

  @Post()
  @ResponseMessage('College created')
  @ApiOperation({
    summary: 'Create a college',
    description:
      'Starts as a DRAFT (invisible to the public) unless `status: "ACTIVE"` is sent. The slug is made ' +
      'from the name unless given. Places within `serviceRadiusMeters` are linked automatically. ' +
      'Unknown fields are refused, so `isDemo` or `verificationStatus` cannot be set here.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    status: 201,
    description: 'The new college.',
    example: { message: 'College created', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { latitude: ['Too big: expected number to be <=90'] } },
    },
    UNAUTHORIZED,
    FORBIDDEN,
    {
      status: 409,
      code: 'CONFLICT',
      message: 'A college named "Sample Arts & Science College" already exists in Ahilyanagar.',
    },
  )
  create(
    @Body({ schema: createCollegeRequestSchema }) body: CreateCollegeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.create(body, actor, client);
  }

  @Get(':id')
  @ResponseMessage('College retrieved')
  @ApiOperation({ summary: 'Get one college (any status), with its images' })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college.',
    example: { message: 'College retrieved', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', idParam) id: string): Promise<AdminCollege> {
    return this.colleges.get(id);
  }

  @Patch(':id')
  @ResponseMessage('College updated')
  @ApiOperation({
    summary: 'Edit a college',
    description:
      'Send only the fields to change; optional text and links can be cleared with `null`. Status and ' +
      'verification have their own endpoints and are refused here. The slug can change only while the ' +
      'college is a DRAFT. Moving the college or changing its radius recomputes which places serve it. ' +
      'Saving values that change nothing is a harmless no-op.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The updated college.',
    example: { message: 'College updated', data: EXAMPLE_ADMIN_DETAIL },
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
      message: 'The slug of a published college cannot be changed: it is part of its public link.',
    },
  )
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateCollegeRequestSchema }) body: UpdateCollegeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.update(id, body, actor, client);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('College activated')
  @ApiOperation({
    summary: 'Publish a college',
    description:
      'DRAFT or INACTIVE -> ACTIVE (visible to the public). Repeating it is a no-op. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college, now ACTIVE.',
    example: { message: 'College activated', data: { ...EXAMPLE_ADMIN_DETAIL, status: 'ACTIVE' } },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  activate(
    @Param('id', idParam) id: string,
    @Body({ schema: collegeActionRequestSchema }) body: CollegeActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.setStatus(id, 'activate', body, actor, client);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('College deactivated')
  @ApiOperation({
    summary: 'Hide a college',
    description:
      'ACTIVE -> INACTIVE (removed from the public directory; nothing is deleted). Repeating it is a ' +
      'no-op. A DRAFT was never published and answers 409. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college, now INACTIVE.',
    example: {
      message: 'College deactivated',
      data: { ...EXAMPLE_ADMIN_DETAIL, status: 'INACTIVE' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message:
      'A draft college has never been published, so there is nothing to deactivate. Activate it, or leave it as a draft.',
  })
  deactivate(
    @Param('id', idParam) id: string,
    @Body({ schema: collegeActionRequestSchema }) body: CollegeActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.setStatus(id, 'deactivate', body, actor, client);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('College verified')
  @ApiOperation({
    summary: 'Mark a college as verified',
    description:
      'Staff have confirmed the details. Repeating it is a no-op. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college, now verified.',
    example: {
      message: 'College verified',
      data: { ...EXAMPLE_ADMIN_DETAIL, verified: true, verificationStatus: 'VERIFIED' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  verify(
    @Param('id', idParam) id: string,
    @Body({ schema: collegeActionRequestSchema }) body: CollegeActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.setVerification(id, 'verify', body, actor, client);
  }

  @Post(':id/unverify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('College verification removed')
  @ApiOperation({
    summary: 'Remove the verified mark',
    description:
      'Back to PENDING. Repeating it is a no-op. `reason` is optional and goes to the audit log.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college, no longer verified.',
    example: { message: 'College verification removed', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  unverify(
    @Param('id', idParam) id: string,
    @Body({ schema: collegeActionRequestSchema }) body: CollegeActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.setVerification(id, 'unverify', body, actor, client);
  }

  @Post(':id/images')
  @ResponseMessage('Image added')
  @ApiOperation({
    summary: 'Add an image',
    description:
      'Adds a link to a picture (http or https only); the picture itself is hosted elsewhere. At most ' +
      '20 per college. Lower `sortOrder` shows first; by default the image goes to the end.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    status: 201,
    description: 'The college with its updated gallery.',
    example: { message: 'Image added', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'A college can have at most 20 images. Remove one first.',
  })
  addImage(
    @Param('id', idParam) id: string,
    @Body({ schema: addCollegeImageRequestSchema }) body: AddCollegeImageRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.addImage(id, body, actor, client);
  }

  @Patch(':id/images/:imageId')
  @ResponseMessage('Image updated')
  @ApiOperation({
    summary: "Change an image's label or position",
    description:
      'Only `altText` and `sortOrder` can change. To use a different picture, remove this image and add a new one.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college with its updated gallery.',
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
    @Body({ schema: updateCollegeImageRequestSchema }) body: UpdateCollegeImageRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCollege> {
    return this.colleges.updateImage(id, imageId, body, actor, client);
  }

  @Delete(':id/images/:imageId')
  @ResponseMessage('Image removed')
  @ApiOperation({
    summary: 'Remove an image',
    description:
      'Removes the link from this college. An image id that belongs to another college is a 404.',
  })
  @ApiEnvelopeResponse(adminCollegeSchema, {
    description: 'The college with its updated gallery.',
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
  ): Promise<AdminCollege> {
    return this.colleges.removeImage(id, imageId, actor, client);
  }
}
