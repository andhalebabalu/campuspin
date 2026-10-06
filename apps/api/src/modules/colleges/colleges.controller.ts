import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CollegeCard,
  type CollegeDetail,
  type CollegeFacets,
  type CollegeNearby,
  type ListCollegesQuery,
  collegeCardSchema,
  collegeDetailSchema,
  collegeFacetsSchema,
  collegeIdOrSlugSchema,
  collegeNearbySchema,
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
  streams: ['arts-science-commerce'],
  management: 'aided',
  courses: null,
};

const EXAMPLE_DETAIL = {
  ...Object.fromEntries(
    Object.entries(EXAMPLE_CARD).filter(
      ([key]) => !['distanceMeters', 'streams', 'management', 'courses'].includes(key),
    ),
  ),
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
      'Active colleges, paginated (`page`, `limit` up to 50). `q` is a forgiving search: every word ' +
      'must appear in the name, short name, city or address (whole, as a word start, inside a word, ' +
      'or as the initials: `pict`, `coep`), in any order; only when nothing matches are small typos ' +
      'forgiven. `sort=relevance` (the default) puts the best match first, or orders by name without ' +
      "`q`. `city` matches exactly. Send `lat` and `lng` (together) to get each college's straight-line " +
      '`distanceMeters`, and `sort=nearest` to order by it. `sort=popular` orders by the number of ' +
      'active places. `stream` and `management` take comma-separated values (see `GET /colleges/facets` for ' +
      'the counts); a college matches if any value matches. Unknown sort values and impossible ' +
      'coordinates are a 400.',
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

  // Declared before `:idOrSlug` so "facets" is never read as a slug (and it is a reserved slug word).
  @Get('facets')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('College facets retrieved')
  @ApiOperation({
    summary: 'Counts for the college directory',
    description:
      'Over every active college: the total, how many staff have verified, colleges per city, and per ' +
      'stream and management type (the values `GET /colleges` accepts as `stream` and `management`). ' +
      "Streams are derived from each college's name and listed courses, so a college can count in several.",
  })
  @ApiEnvelopeResponse(collegeFacetsSchema, {
    description: 'The counts.',
    example: {
      message: 'College facets retrieved',
      data: {
        total: 200,
        verified: 0,
        cities: [{ name: 'Kopargaon', count: 13 }],
        streams: [{ key: 'pharmacy', label: 'Pharmacy', count: 44 }],
        management: [{ key: 'aided', label: 'Government aided', count: 38 }],
      },
    },
  })
  @ApiErrorResponses(429)
  facets(): Promise<CollegeFacets> {
    return this.colleges.facets();
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

  @Get(':idOrSlug/nearby')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Nearby places summarised')
  @ApiOperation({
    summary: 'What is around a college, by category',
    description:
      'One row per category that has at least one active place serving the college (within its service ' +
      'radius, minus any a staff member excluded): how many, the nearest and farthest distance in metres, ' +
      'and the nearest place itself. Nearest category first. Categories with nothing listed are absent.',
  })
  @ApiEnvelopeResponse(collegeNearbySchema, {
    description: 'The categories around the college.',
    example: {
      message: 'Nearby places summarised',
      data: {
        categories: [
          {
            slug: 'bus',
            name: 'Bus',
            icon: 'bus',
            groupSlug: 'transport',
            count: 2,
            nearestMeters: 272,
            farthestMeters: 1106,
            nearest: { slug: 'loni-bus-stand-rahata', name: 'Loni Bus Stand' },
          },
        ],
      },
    },
  })
  @ApiErrorResponses({ status: 404, code: 'NOT_FOUND', message: 'College not found' }, 429)
  nearby(
    @Param('idOrSlug', { schema: collegeIdOrSlugSchema }) idOrSlug: string,
  ): Promise<CollegeNearby> {
    return this.colleges.nearby(idOrSlug);
  }
}
