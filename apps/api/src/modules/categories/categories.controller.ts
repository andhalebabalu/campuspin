import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CategoryDetail,
  type CategoryGroup,
  categoryDetailSchema,
  categoryGroupSchema,
  categoryIdOrSlugSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CategoriesService } from './categories.service.js';

/** Same for every visitor, so a shared cache may keep it for a minute and serve it stale for five. */
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const EXAMPLE_GROUP = {
  id: '01a0c600-1111-7000-8000-000000000001',
  slug: 'food',
  name: 'Food',
  description: 'Messes, tiffin services, restaurants and cafes.',
  icon: 'utensils',
  sortOrder: 1,
  defaultPriceUnit: null,
  children: [
    {
      id: '01a0c600-1111-7000-8000-000000000002',
      slug: 'mess',
      name: 'Mess',
      description: 'Monthly meal plans.',
      icon: 'utensils',
      sortOrder: 0,
      defaultPriceUnit: 'MONTH',
    },
  ],
};

const EXAMPLE_DETAIL = {
  id: '01a0c600-1111-7000-8000-000000000002',
  slug: 'mess',
  name: 'Mess',
  description: 'Monthly meal plans.',
  icon: 'utensils',
  sortOrder: 0,
  defaultPriceUnit: 'MONTH',
  parentId: EXAMPLE_GROUP.id,
  attributes: [
    {
      id: '01a0c600-2222-7000-8000-000000000001',
      key: 'veg_nonveg',
      name: 'Veg / Non-veg',
      dataType: 'ENUM',
      required: true,
      filterable: true,
      searchable: false,
      unit: null,
      options: [
        { value: 'veg', label: 'Veg' },
        { value: 'non_veg', label: 'Non-veg' },
      ],
      helpText: null,
      sortOrder: 0,
    },
  ],
  ratingDimensions: [
    { id: '01a0c600-3333-7000-8000-000000000001', key: 'food', label: 'Food', sortOrder: 0 },
  ],
};

/**
 * The public category catalogue: a two-level tree (a group such as "Food", containing categories
 * such as "Mess"). Anyone can browse it, no account needed. Staff manage it through
 * `/admin/categories`.
 */
@Public()
@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Categories retrieved')
  @ApiOperation({
    summary: 'The category tree',
    description:
      'Every active group with its active categories, in display order. A group whose own status ' +
      'is inactive is omitted entirely, along with its categories.',
  })
  @ApiEnvelopeResponse(z.array(categoryGroupSchema), {
    description: 'The category tree.',
    example: { message: 'Categories retrieved', data: [EXAMPLE_GROUP] },
  })
  @ApiErrorResponses(429)
  tree(): Promise<CategoryGroup[]> {
    return this.categories.tree();
  }

  @Get(':idOrSlug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Category retrieved')
  @ApiOperation({
    summary: 'Get one category or group',
    description:
      'By id or by slug. Works for a group (empty `attributes`/`ratingDimensions`) or a leaf ' +
      'category. A category whose group is inactive is a 404, exactly like one that does not exist.',
  })
  @ApiEnvelopeResponse(categoryDetailSchema, {
    description: 'The category, with its attribute and rating-dimension definitions.',
    example: { message: 'Category retrieved', data: EXAMPLE_DETAIL },
  })
  @ApiErrorResponses({ status: 404, code: 'NOT_FOUND', message: 'Category not found' }, 429)
  detail(
    @Param('idOrSlug', { schema: categoryIdOrSlugSchema }) idOrSlug: string,
  ): Promise<CategoryDetail> {
    return this.categories.getOne(idOrSlug);
  }
}
