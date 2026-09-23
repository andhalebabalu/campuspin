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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminCategory,
  type AdminCategoryGroup,
  type CategoryActionRequest,
  type CreateCategoryAttributeRequest,
  type CreateCategoryRatingDimensionRequest,
  type CreateCategoryRequest,
  type UpdateCategoryAttributeRequest,
  type UpdateCategoryRatingDimensionRequest,
  type UpdateCategoryRequest,
  adminCategoryGroupSchema,
  adminCategorySchema,
  categoryActionRequestSchema,
  createCategoryAttributeRequestSchema,
  createCategoryRatingDimensionRequestSchema,
  createCategoryRequestSchema,
  updateCategoryAttributeRequestSchema,
  updateCategoryRatingDimensionRequestSchema,
  updateCategoryRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { AdminCategoriesService } from './admin-categories.service.js';

const EXAMPLE_ADMIN_DETAIL = {
  id: '01a0c600-1111-7000-8000-000000000002',
  slug: 'mess',
  name: 'Mess',
  description: 'Monthly meal plans.',
  icon: 'utensils',
  sortOrder: 0,
  defaultPriceUnit: 'MONTH',
  parentId: '01a0c600-1111-7000-8000-000000000001',
  attributes: [],
  ratingDimensions: [],
  status: 'ACTIVE',
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};
const EXAMPLE_ADMIN_GROUP = { ...EXAMPLE_ADMIN_DETAIL, parentId: null, children: [] };

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
const CATEGORY_NOT_FOUND = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Category not found',
} as const;
const ATTRIBUTE_NOT_FOUND = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Attribute not found',
} as const;
const DIMENSION_NOT_FOUND = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Rating dimension not found',
} as const;

const idParam = { schema: uuidSchema } as const;

/**
 * Staff management of the category catalogue: the tree itself, its attributes and its rating
 * dimensions. Every route needs the `categories.manage` permission (ADMIN, SUPER_ADMIN), and every
 * change is recorded in `audit_logs`. Nothing here deletes a category: it is deactivated instead.
 */
@ApiTags('Admin: Categories')
@ApiBearerAuth()
@Permissions('categories.manage')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}

  @Get()
  @ResponseMessage('Categories retrieved')
  @ApiOperation({
    summary: 'The full category tree',
    description: 'Every group and category, any status.',
  })
  @ApiEnvelopeResponse(z.array(adminCategoryGroupSchema), {
    description: 'The category tree.',
    example: { message: 'Categories retrieved', data: [EXAMPLE_ADMIN_GROUP] },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  tree(): Promise<AdminCategoryGroup[]> {
    return this.categories.tree();
  }

  @Post()
  @ResponseMessage('Category created')
  @ApiOperation({
    summary: 'Create a group or a category',
    description:
      'Omit `parentId` to create a top-level GROUP (e.g. "Food"); set it to an existing group\'s id ' +
      'to create a category inside it (e.g. "Mess"). The tree is exactly two levels. The slug is ' +
      'made from the name unless given. Unknown fields are refused.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    status: 201,
    description: 'The new group or category.',
    example: { message: 'Category created', data: EXAMPLE_ADMIN_DETAIL },
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
    {
      status: 409,
      code: 'CONFLICT',
      message: 'A category named "Mess" already exists in this group.',
    },
  )
  create(
    @Body({ schema: createCategoryRequestSchema }) body: CreateCategoryRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.create(body, actor, client);
  }

  @Get(':id')
  @ResponseMessage('Category retrieved')
  @ApiOperation({ summary: 'Get one group or category (any status)' })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category.',
    example: { message: 'Category retrieved', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, CATEGORY_NOT_FOUND)
  get(@Param('id', idParam) id: string): Promise<AdminCategory> {
    return this.categories.get(id);
  }

  @Patch(':id')
  @ResponseMessage('Category updated')
  @ApiOperation({
    summary: 'Edit a group or a category',
    description:
      'Send only the fields to change; optional text can be cleared with `null`. `parentId` and ' +
      '`status` are not editable here (status has its own activate/deactivate actions; a category ' +
      'cannot be moved to a different group). Saving values that change nothing is a harmless no-op.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The updated category.',
    example: { message: 'Category updated', data: EXAMPLE_ADMIN_DETAIL },
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
    CATEGORY_NOT_FOUND,
    { status: 409, code: 'CONFLICT', message: 'This slug is already used by another category.' },
  )
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateCategoryRequestSchema }) body: UpdateCategoryRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.update(id, body, actor, client);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Category activated')
  @ApiOperation({
    summary: 'Publish a group or category',
    description: 'INACTIVE -> ACTIVE. Repeating it is a no-op.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category, now ACTIVE.',
    example: { message: 'Category activated', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, CATEGORY_NOT_FOUND)
  activate(
    @Param('id', idParam) id: string,
    @Body({ schema: categoryActionRequestSchema }) body: CategoryActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.setStatus(id, 'activate', body, actor, client);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Category deactivated')
  @ApiOperation({
    summary: 'Hide a group or category',
    description:
      'ACTIVE -> INACTIVE (removed from the public catalogue; nothing is deleted). Repeating it is a no-op.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category, now INACTIVE.',
    example: {
      message: 'Category deactivated',
      data: { ...EXAMPLE_ADMIN_DETAIL, status: 'INACTIVE' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, CATEGORY_NOT_FOUND)
  deactivate(
    @Param('id', idParam) id: string,
    @Body({ schema: categoryActionRequestSchema }) body: CategoryActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.setStatus(id, 'deactivate', body, actor, client);
  }

  @Post(':id/attributes')
  @ResponseMessage('Attribute added')
  @ApiOperation({
    summary: 'Add an attribute',
    description:
      'Only on a category, not a group. `key` is permanent. `ENUM`/`MULTI_ENUM` need at least one option; every other type must have none.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    status: 201,
    description: 'The category with its updated attributes.',
    example: { message: 'Attribute added', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { options: ['ENUM and MULTI_ENUM attributes need at least one option'] } },
    },
    UNAUTHORIZED,
    FORBIDDEN,
    CATEGORY_NOT_FOUND,
    {
      status: 409,
      code: 'CONFLICT',
      message: 'This key is already used by another attribute of this category.',
    },
  )
  addAttribute(
    @Param('id', idParam) id: string,
    @Body({ schema: createCategoryAttributeRequestSchema }) body: CreateCategoryAttributeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.addAttribute(id, body, actor, client);
  }

  @Patch(':id/attributes/:attributeId')
  @ResponseMessage('Attribute updated')
  @ApiOperation({
    summary: 'Edit an attribute',
    description: '`key` and `dataType` cannot change; recreate the attribute instead.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category with its updated attributes.',
    example: { message: 'Attribute updated', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, ATTRIBUTE_NOT_FOUND)
  updateAttribute(
    @Param('id', idParam) id: string,
    @Param('attributeId', idParam) attributeId: string,
    @Body({ schema: updateCategoryAttributeRequestSchema }) body: UpdateCategoryAttributeRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.updateAttribute(id, attributeId, body, actor, client);
  }

  @Delete(':id/attributes/:attributeId')
  @ResponseMessage('Attribute removed')
  @ApiOperation({
    summary: 'Remove an attribute',
    description: 'Refused with 409 if a place already has a value for it.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category with its updated attributes.',
    example: { message: 'Attribute removed', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, ATTRIBUTE_NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'This attribute has values on existing places and cannot be removed.',
  })
  removeAttribute(
    @Param('id', idParam) id: string,
    @Param('attributeId', idParam) attributeId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.removeAttribute(id, attributeId, actor, client);
  }

  @Post(':id/rating-dimensions')
  @ResponseMessage('Rating dimension added')
  @ApiOperation({
    summary: 'Add a rating dimension',
    description: 'Only on a category, not a group. `key` is permanent.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    status: 201,
    description: 'The category with its updated rating dimensions.',
    example: { message: 'Rating dimension added', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, CATEGORY_NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'This key is already used by another rating dimension of this category.',
  })
  addRatingDimension(
    @Param('id', idParam) id: string,
    @Body({ schema: createCategoryRatingDimensionRequestSchema })
    body: CreateCategoryRatingDimensionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.addRatingDimension(id, body, actor, client);
  }

  @Patch(':id/rating-dimensions/:dimensionId')
  @ResponseMessage('Rating dimension updated')
  @ApiOperation({
    summary: 'Edit a rating dimension',
    description: '`key` cannot change; recreate it instead.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category with its updated rating dimensions.',
    example: { message: 'Rating dimension updated', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, DIMENSION_NOT_FOUND)
  updateRatingDimension(
    @Param('id', idParam) id: string,
    @Param('dimensionId', idParam) dimensionId: string,
    @Body({ schema: updateCategoryRatingDimensionRequestSchema })
    body: UpdateCategoryRatingDimensionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.updateRatingDimension(id, dimensionId, body, actor, client);
  }

  @Delete(':id/rating-dimensions/:dimensionId')
  @ResponseMessage('Rating dimension removed')
  @ApiOperation({
    summary: 'Remove a rating dimension',
    description: 'Refused with 409 if a review already rates it.',
  })
  @ApiEnvelopeResponse(adminCategorySchema, {
    description: 'The category with its updated rating dimensions.',
    example: { message: 'Rating dimension removed', data: EXAMPLE_ADMIN_DETAIL },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, DIMENSION_NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'This rating dimension has reviews and cannot be removed.',
  })
  removeRatingDimension(
    @Param('id', idParam) id: string,
    @Param('dimensionId', idParam) dimensionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCategory> {
    return this.categories.removeRatingDimension(id, dimensionId, actor, client);
  }
}
