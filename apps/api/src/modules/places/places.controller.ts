import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ListPlacesQuery,
  type PlaceCard,
  type PlaceDetail,
  listPlacesQuerySchema,
  placeCardSchema,
  placeDetailSchema,
  placeIdOrSlugSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlacesService } from './places.service.js';

/** Same for every visitor, so a shared cache may keep it for a minute and serve it stale for five. */
const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const EXAMPLE_CARD = {
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
  verified: true,
  ratingAverage: 4.2,
  ratingCount: 18,
  priceMin: 3000,
  priceMax: 3500,
  priceUnit: 'MONTH',
  distanceMeters: 850,
};

const EXAMPLE_DETAIL = {
  ...Object.fromEntries(Object.entries(EXAMPLE_CARD).filter(([key]) => key !== 'distanceMeters')),
  description: 'A sample mess used to illustrate the API.',
  address: 'Station Road, Ahilyanagar',
  country: 'India',
  phone: '+91 98765 43210',
  email: 'contact@sample-mess.example.com',
  website: 'https://sample-mess.example.com',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=19.098,74.75',
  latitude: 19.098,
  longitude: 74.75,
  categories: [{ ...EXAMPLE_CARD.primaryCategory, isPrimary: true }],
  amenities: [
    { id: '01a0babd-2222-7000-8000-000000000001', key: 'wifi', name: 'WiFi', icon: 'wifi' },
  ],
  hours: [
    {
      id: '01a0babd-3333-7000-8000-000000000001',
      dayOfWeek: 1,
      openTime: '09:00',
      closeTime: '21:00',
      isClosed: false,
      is24Hours: false,
      slotLabel: null,
      sortOrder: 0,
    },
  ],
  priceOptions: [
    {
      id: '01a0babd-4444-7000-8000-000000000001',
      label: 'Monthly, veg',
      amount: 3000,
      unit: 'MONTH',
      note: null,
      sortOrder: 0,
    },
  ],
  images: [],
};

/**
 * The public place directory: anyone can browse it, no account needed. Only ACTIVE places are
 * visible. Staff manage places through `/admin/places`.
 */
@Public()
@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Places retrieved')
  @ApiOperation({
    summary: 'List places',
    description:
      'Active places, paginated (`page`, `limit` up to 50). `q` searches name, description and address; ' +
      '`city` matches exactly. `collegeSlug` scopes the list to places serving that college (excluding any ' +
      'a staff member explicitly excluded), and `categorySlug` narrows further. `minPrice`/`maxPrice` keep ' +
      'places whose own price range overlaps the window (places with no price never match); `verified=true` ' +
      "shows only staff-verified places. Send `lat` and `lng` (together) for each place's straight-line " +
      "`distanceMeters`; with `collegeSlug` alone, distance defaults to 'from that college'. `sort=nearest` " +
      'needs one of those; `sort=cheapest` orders by `priceMin` (places with no price sort last, never as ' +
      'free); `sort=relevance` needs `q` and ranks by MySQL full-text relevance on name/description, with ' +
      'distance and verified status breaking ties among equally relevant results. Unknown sort values and ' +
      'impossible coordinates are a 400.',
  })
  @ApiEnvelopeResponse(z.array(placeCardSchema), {
    description: 'A page of places. `meta` carries the paging details.',
    example: {
      message: 'Places retrieved',
      data: [EXAMPLE_CARD],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { sort: ['sort=nearest needs lat and lng, or a collegeSlug'] } },
    },
    { status: 404, code: 'NOT_FOUND', message: 'College not found' },
    429,
  )
  list(
    @Query({ schema: listPlacesQuerySchema }) query: ListPlacesQuery,
  ): Promise<Paginated<PlaceCard>> {
    return this.places.list(query);
  }

  @Get(':idOrSlug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Place retrieved')
  @ApiOperation({
    summary: 'Get one place',
    description:
      'By id or by slug. A place that is a draft, pending, rejected or deactivated is a 404, exactly like ' +
      'one that does not exist.',
  })
  @ApiEnvelopeResponse(placeDetailSchema, {
    description: 'The place with its categories, amenities, hours, price options and images.',
    example: { message: 'Place retrieved', data: EXAMPLE_DETAIL },
  })
  @ApiErrorResponses({ status: 404, code: 'NOT_FOUND', message: 'Place not found' }, 429)
  detail(
    @Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string,
  ): Promise<PlaceDetail> {
    return this.places.getOne(idOrSlug);
  }
}
