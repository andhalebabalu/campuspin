import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminPromotionSchema,
  createPromotionSchema,
  listPromotionsQuerySchema,
  promotionSchema,
  updatePromotionSchema,
  uuidSchema,
  PROMOTION_EVENTS,
  type AdminPromotion,
  type CreatePromotionRequest,
  type ListPromotionsQuery,
  type Promotion,
  type PromotionEvent,
  type UpdatePromotionRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, Viewer } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { OptionalAuth } from '../auth/decorators/public.decorator.js';
import { PromotionsService } from './promotions.service.js';

const EXAMPLE_PROMOTION: Promotion = {
  id: '01a0d000-2222-7000-8000-000000000001',
  placement: 'SPLASH',
  kind: 'NEW_FEATURE',
  title: 'The student marketplace is live',
  body: 'Buy and sell books, cycles and hostel gear with students near your college.',
  imageUrl: null,
  ctaLabel: 'Open the marketplace',
  ctaLink: '/marketplace',
  displaySeconds: 10,
  skipAfterSeconds: 5,
};

const EXAMPLE_ADMIN_PROMOTION: AdminPromotion = {
  ...EXAMPLE_PROMOTION,
  audience: 'STUDENTS',
  active: true,
  priority: 10,
  startsAt: null,
  endsAt: null,
  state: 'LIVE',
  views: 1240,
  clicks: 96,
  createdAt: '2026-09-27T10:00:00.000Z',
  updatedAt: '2026-09-27T10:00:00.000Z',
};

const UNAUTHORIZED = { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' } as const;
const FORBIDDEN = {
  status: 403,
  code: 'FORBIDDEN',
  message: 'You do not have permission to perform this action',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Promotion not found' } as const;
const idParam = { schema: uuidSchema } as const;
const eventParam = { schema: z.enum(PROMOTION_EVENTS) } as const;

/** What the student and business apps show: a splash ad on open, and Featured cards. */
@ApiTags('Promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @OptionalAuth()
  @Get()
  @ResponseMessage('Promotions retrieved')
  @ApiOperation({
    summary: 'Live promotions for me',
    description:
      'Active and within their schedule, for my audience (students, businesses or everyone), highest priority first. At most 10.',
  })
  @ApiEnvelopeResponse(z.array(promotionSchema), {
    description: 'Promotions to show.',
    example: { message: 'Promotions retrieved', data: [EXAMPLE_PROMOTION] },
  })
  live(
    @Query({ schema: listPromotionsQuerySchema }) query: ListPromotionsQuery,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<Promotion[]> {
    return this.promotions.live(query.placement, viewer?.roles ?? null);
  }

  @OptionalAuth()
  @Post(':id/:event')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Recorded')
  @ApiOperation({
    summary: 'Count a view or a tap',
    description: '`event` is `view` (it was shown) or `click` (its button was tapped). Always succeeds.',
  })
  @ApiEnvelopeResponse(z.null(), { description: 'Counted.', example: { message: 'Recorded', data: null } })
  async record(
    @Param('id', idParam) id: string,
    @Param('event', eventParam) event: PromotionEvent,
  ): Promise<null> {
    await this.promotions.record(id, event);
    return null;
  }
}

/** Staff management of promotions. Every route needs `promotions.manage` (ADMIN, SUPER_ADMIN). */
@ApiTags('Admin: Promotions')
@ApiBearerAuth()
@Permissions('promotions.manage')
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ResponseMessage('Promotions retrieved')
  @ApiOperation({ summary: 'List all promotions', description: 'Live and paused first, then by priority.' })
  @ApiEnvelopeResponse(z.array(adminPromotionSchema), {
    description: 'Every promotion with its state and reach.',
    example: { message: 'Promotions retrieved', data: [EXAMPLE_ADMIN_PROMOTION] },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(): Promise<AdminPromotion[]> {
    return this.promotions.list();
  }

  @Post()
  @ResponseMessage('Promotion created')
  @ApiOperation({
    summary: 'Create a promotion',
    description:
      'SPLASH shows full screen when the app opens for `displaySeconds`, with a close button after `skipAfterSeconds`. FEED is a card in the Featured section.',
  })
  @ApiEnvelopeResponse(adminPromotionSchema, {
    status: 201,
    description: 'The new promotion.',
    example: { message: 'Promotion created', data: EXAMPLE_ADMIN_PROMOTION },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { skipAfterSeconds: ['The close button must appear before the ad ends'] } },
    },
    UNAUTHORIZED,
    FORBIDDEN,
  )
  create(
    @Body({ schema: createPromotionSchema }) body: CreatePromotionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPromotion> {
    return this.promotions.create(body, actor, client);
  }

  @Patch(':id')
  @ResponseMessage('Promotion updated')
  @ApiOperation({ summary: 'Edit, pause or resume a promotion', description: 'Send only the fields to change.' })
  @ApiEnvelopeResponse(adminPromotionSchema, {
    description: 'The updated promotion.',
    example: { message: 'Promotion updated', data: EXAMPLE_ADMIN_PROMOTION },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updatePromotionSchema }) body: UpdatePromotionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminPromotion> {
    return this.promotions.update(id, body, actor, client);
  }

  @Delete(':id')
  @ResponseMessage('Promotion deleted')
  @ApiOperation({ summary: 'Delete a promotion', description: 'Its reach is kept in the audit log.' })
  @ApiEnvelopeResponse(z.null(), { description: 'Deleted.', example: { message: 'Promotion deleted', data: null } })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  async remove(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<null> {
    await this.promotions.remove(id, actor, client);
    return null;
  }
}
