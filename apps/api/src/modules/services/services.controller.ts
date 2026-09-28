import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  messMenuCardSchema,
  placeCardSchema,
  placeIdOrSlugSchema,
  placeMenusSchema,
  placeServicesSchema,
  serviceTypeKeySchema,
  serviceTypePlacesQuerySchema,
  serviceTypeSchema,
  studentHomeQuerySchema,
  studentHomeSchema,
  todaysMenusQuerySchema,
  type MessMenuCard,
  type PlaceCard,
  type PlaceMenus,
  type PlaceServices,
  type ServiceType,
  type ServiceTypePlacesQuery,
  type StudentHome,
  type StudentHomeQuery,
  type TodaysMenusQuery,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, Viewer } from '../auth/decorators/current-user.decorator.js';
import { OptionalAuth, Public } from '../auth/decorators/public.decorator.js';
import { MenusService } from './menus.service.js';
import { PlaceServicesService } from './place-services.service.js';
import { ServiceTypesService } from './service-types.service.js';
import { StudentHomeService } from './student-home.service.js';

const PUBLIC_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Place not found' } as const;
const placeParam = { schema: placeIdOrSlugSchema } as const;
const keyParam = { schema: serviceTypeKeySchema } as const;

/** The service catalogue (quick actions) and the places offering each service. */
@ApiTags('Services')
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly types: ServiceTypesService) {}

  @Public()
  @Get()
  @Header('Cache-Control', PUBLIC_CACHE)
  @ResponseMessage('Service types retrieved')
  @ApiOperation({
    summary: 'Service types',
    description:
      'Every active service type (Order Food, Print, Daily Menu, ...), in display order.',
  })
  @ApiEnvelopeResponse(z.array(serviceTypeSchema), { description: 'The service types.' })
  list(): Promise<ServiceType[]> {
    return this.types.active();
  }

  @Public()
  @Get(':key/places')
  @ResponseMessage('Places retrieved')
  @ApiOperation({
    summary: 'Places offering a service',
    description:
      'Live places with the service switched on (for a LISTING type such as Find Room: the places in its ' +
      'category). Nearest first when `lat`/`lng` are sent, otherwise best rated.',
  })
  @ApiEnvelopeResponse(z.array(placeCardSchema), { description: 'A page of places.' })
  @ApiErrorResponses({ status: 404, code: 'NOT_FOUND', message: 'Service not found' })
  places(
    @Param('key', keyParam) key: string,
    @Query({ schema: serviceTypePlacesQuerySchema }) query: ServiceTypePlacesQuery,
  ): Promise<Paginated<PlaceCard>> {
    return this.types.places(key, query);
  }
}

/** What students see of a place's services, and today's mess menus. */
@ApiTags('Services')
@Controller()
export class PlaceServicesController {
  constructor(
    private readonly services: PlaceServicesService,
    private readonly menus: MenusService,
  ) {}

  @Public()
  @Get('places/:idOrSlug/services')
  @ResponseMessage('Services retrieved')
  @ApiOperation({
    summary: "A place's services",
    description:
      'The live services of a place (only those the business switched on and staff have not switched ' +
      'off) with their student-facing settings, plus today’s and tomorrow’s published menu for a mess.',
  })
  @ApiEnvelopeResponse(placeServicesSchema, { description: 'Services and menus.' })
  @ApiErrorResponses(NOT_FOUND)
  placeServices(@Param('idOrSlug', placeParam) idOrSlug: string): Promise<PlaceServices> {
    return this.services.publicServices(idOrSlug);
  }

  @Public()
  @Get('places/:idOrSlug/menus')
  @ResponseMessage('Menus retrieved')
  @ApiOperation({
    summary: "A mess's menus",
    description: 'Today’s and tomorrow’s published menus (India dates); null when not published.',
  })
  @ApiEnvelopeResponse(placeMenusSchema, { description: 'Today and tomorrow.' })
  @ApiErrorResponses(NOT_FOUND)
  placeMenus(@Param('idOrSlug', placeParam) idOrSlug: string): Promise<PlaceMenus> {
    return this.menus.publicPlaceMenus(idOrSlug);
  }

  @OptionalAuth()
  @Get('menus/today')
  @Header('Cache-Control', 'no-store')
  @ResponseMessage('Menus retrieved')
  @ApiOperation({
    summary: "Today's mess menus",
    description:
      'Messes that published a menu for today: the caller’s saved messes first, then the nearest ' +
      '(`lat`/`lng`) or best rated. `saved=true` returns saved messes only (needs a session).',
  })
  @ApiEnvelopeResponse(z.array(messMenuCardSchema), { description: 'Messes with their menus.' })
  todaysMenus(
    @Query({ schema: todaysMenusQuerySchema }) query: TodaysMenusQuery,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<MessMenuCard[]> {
    return this.menus.todaysMenus(query, viewer?.id ?? null);
  }
}

/** The student home screen in one call. */
@ApiTags('Services')
@ApiBearerAuth()
@Controller('me/home')
export class StudentHomeController {
  constructor(private readonly home: StudentHomeService) {}

  @Get()
  @ResponseMessage('Home retrieved')
  @ApiOperation({
    summary: 'My home screen',
    description:
      'Quick actions (with how many places offer each), today’s mess menus and saved places. Send ' +
      '`lat`/`lng` for distances.',
  })
  @ApiEnvelopeResponse(studentHomeSchema, { description: 'Everything the home screen shows.' })
  @ApiErrorResponses({ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' })
  get(
    @Query({ schema: studentHomeQuerySchema }) query: StudentHomeQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<StudentHome> {
    return this.home.home(actor, query);
  }
}
