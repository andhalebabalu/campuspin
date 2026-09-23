import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Amenity, amenitySchema } from '@platform/contracts';
import { z } from 'zod';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { AmenitiesService } from './amenities.service.js';

const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

const EXAMPLE_AMENITY = {
  id: '01a0c700-1111-7000-8000-000000000001',
  key: 'wifi',
  name: 'WiFi',
  icon: 'wifi',
  sortOrder: 0,
};

/** The public amenity list: any active facility a place can offer. No account needed. */
@Public()
@ApiTags('Amenities')
@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Amenities retrieved')
  @ApiOperation({
    summary: 'List amenities',
    description: 'Every active amenity, in display order.',
  })
  @ApiEnvelopeResponse(z.array(amenitySchema), {
    description: 'The amenity list.',
    example: { message: 'Amenities retrieved', data: [EXAMPLE_AMENITY] },
  })
  @ApiErrorResponses(429)
  list(): Promise<Amenity[]> {
    return this.amenities.list();
  }
}
