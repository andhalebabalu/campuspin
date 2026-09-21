import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CollegeCard,
  type CollegeDetail,
  type ListCollegesQuery,
  collegeCardSchema,
  collegeDetailSchema,
  collegeIdOrSlugSchema,
  listCollegesQuerySchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CollegesService } from './colleges.service.js';

/** Same for every visitor, so a shared cache may keep it for a minute and serve it stale for five. */
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const EXAMPLE_CARD = {
  id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
  slug: 'sample-arts-science-college',
  name: 'Sample Arts & Science College',
  shortName: 'Sample ASC',
  city: 'Ahilyanagar',
  state: 'Maharashtra',
  logoUrl: null,
  coverImageUrl: null,
  verified: true,
  placeCount: 14,
  distanceMeters: 850,
};

const EXAMPLE_DETAIL = {
  ...Object.fromEntries(Object.entries(EXAMPLE_CARD).filter(([key]) => key !== 'distanceMeters')),
  description: 'A sample college used to illustrate the API.',
  address: 'Station Road, Ahilyanagar',
  country: 'India',
  website: 'https://college.example.edu',
  latitude: 19.096,
  longitude: 74.748,
  serviceRadiusMeters: 5000,
  images: [
    {
      id: '01a0babd-b2e6-7011-bcca-d1eb1c0e7fbe',
      imageUrl: 'https://cdn.example.edu/campus-gate.jpg',
      altText: 'Main gate',
      sortOrder: 0,
    },
  ],
};

/**
 * The public college directory: anyone can browse it, no account needed. Only ACTIVE colleges are
 * visible. Staff manage colleges through `/admin/colleges`.
 */
@Public()
@ApiTags('Colleges')
@Controller('colleges')
export class CollegesController {
  constructor(private readonly colleges: CollegesService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Colleges retrieved')
  @ApiOperation({
    summary: 'List colleges',
    description:
      'Active colleges, paginated (`page`, `limit` up to 50). `q` searches name, short name and city; ' +
      "`city` matches exactly. Send `lat` and `lng` (together) to get each college's straight-line " +
      '`distanceMeters`, and `sort=nearest` to order by it. `sort=popular` orders by the number of ' +
      'active places. Unknown sort values and impossible coordinates are a 400.',
  })
  @ApiEnvelopeResponse(z.array(collegeCardSchema), {
    description: 'A page of colleges. `meta` carries the paging details.',
    example: {
      message: 'Colleges retrieved',
      data: [EXAMPLE_CARD],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { sort: ['sort=nearest needs lat and lng'] } },
    },
    429,
  )
  list(
    @Query({ schema: listCollegesQuerySchema }) query: ListCollegesQuery,
  ): Promise<Paginated<CollegeCard>> {
    return this.colleges.list(query);
  }

  @Get(':idOrSlug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('College retrieved')
  @ApiOperation({
    summary: 'Get one college',
    description:
      'By id or by slug. A college that is a draft or has been deactivated is a 404, exactly like one ' +
      'that does not exist.',
  })
  @ApiEnvelopeResponse(collegeDetailSchema, {
    description: 'The college with its images and the number of active places serving it.',
    example: { message: 'College retrieved', data: EXAMPLE_DETAIL },
  })
  @ApiErrorResponses({ status: 404, code: 'NOT_FOUND', message: 'College not found' }, 429)
  detail(
    @Param('idOrSlug', { schema: collegeIdOrSlugSchema }) idOrSlug: string,
  ): Promise<CollegeDetail> {
    return this.colleges.getOne(idOrSlug);
  }
}
