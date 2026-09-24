import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminListReviewsQuery,
  type HideReviewRequest,
  type RemoveReviewRequest,
  type RestoreReviewRequest,
  type Review,
  adminListReviewsQuerySchema,
  hideReviewRequestSchema,
  removeReviewRequestSchema,
  restoreReviewRequestSchema,
  reviewSchema,
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
import { AdminReviewsService } from './admin-reviews.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Review not found' } as const;
const REASON_REQUIRED = {
  status: 400,
  code: 'VALIDATION_ERROR',
  message: 'Validation failed',
  details: { fields: { reason: ['Reason is required'] } },
} as const;
const REMOVED_IS_FINAL = {
  status: 409,
  code: 'CONFLICT',
  message: 'This review was removed. Removal is final.',
} as const;

const idParam = { schema: uuidSchema } as const;

const EXAMPLE_REVIEW = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f790',
  rating: 1,
  comment: 'Call 98765 43210 for a better deal!',
  authorName: 'Asha K.',
  dimensionRatings: [],
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T11:00:00.000Z',
  place: { id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f785', slug: 'sample-mess', name: 'Sample Mess' },
  userId: '01a0c44b-14bb-724c-98a4-00a05625e026',
  status: 'HIDDEN',
  moderationNote: 'Personal information in the comment',
  moderatedById: '01a0c44b-14bb-724c-98a4-00a05625e027',
  moderatedAt: '2026-09-24T11:00:00.000Z',
};

/**
 * Staff moderation of reviews. Every route needs `reviews.moderate` (MODERATOR, ADMIN,
 * SUPER_ADMIN). Staff can hide (reversible), restore and remove (final) a review, never edit or
 * delete one. Repeating an action is a harmless no-op.
 */
@ApiTags('Admin: Reviews')
@ApiBearerAuth()
@Permissions('reviews.moderate')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Get()
  @ResponseMessage('Reviews retrieved')
  @ApiOperation({
    summary: 'List reviews (the moderation queue)',
    description:
      'Every status by default; filter by `status`, `placeId` or `userId`. Sort by `newest` (default) or `oldest`.',
  })
  @ApiEnvelopeResponse(z.array(reviewSchema), {
    description: 'A page of reviews.',
    example: {
      message: 'Reviews retrieved',
      data: [EXAMPLE_REVIEW],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListReviewsQuerySchema }) query: AdminListReviewsQuery,
  ): Promise<Paginated<Review>> {
    return this.reviews.list(query);
  }

  @Get(':id')
  @ResponseMessage('Review retrieved')
  @ApiOperation({ summary: 'Get one review' })
  @ApiEnvelopeResponse(reviewSchema, {
    description: 'The review.',
    example: { message: 'Review retrieved', data: EXAMPLE_REVIEW },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', idParam) id: string): Promise<Review> {
    return this.reviews.get(id);
  }

  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review hidden')
  @ApiOperation({
    summary: 'Hide a review',
    description:
      'Takes it off the place page and out of the rating; reversible with `restore`. `reason` is required ' +
      'and shown to the author.',
  })
  @ApiEnvelopeResponse(reviewSchema, {
    description: 'The hidden review.',
    example: { message: 'Review hidden', data: EXAMPLE_REVIEW },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, REASON_REQUIRED, REMOVED_IS_FINAL)
  hide(
    @Param('id', idParam) id: string,
    @Body({ schema: hideReviewRequestSchema }) body: HideReviewRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Review> {
    return this.reviews.moderate(id, 'hide', body.reason, actor, client);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review restored')
  @ApiOperation({
    summary: 'Restore a hidden review',
    description: 'Publishes it again and counts it in the rating. `reason` is optional.',
  })
  @ApiEnvelopeResponse(reviewSchema, {
    description: 'The restored review.',
    example: {
      message: 'Review restored',
      data: { ...EXAMPLE_REVIEW, status: 'PUBLISHED', moderationNote: null },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, REMOVED_IS_FINAL)
  restore(
    @Param('id', idParam) id: string,
    @Body({ schema: restoreReviewRequestSchema }) body: RestoreReviewRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Review> {
    return this.reviews.moderate(id, 'restore', body?.reason, actor, client);
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Review removed')
  @ApiOperation({
    summary: 'Remove a review',
    description:
      'Final: it is never shown or counted again and cannot be restored. The row is kept for legal hold and ' +
      'audit, and the author cannot post a new review of the same place. `reason` is required.',
  })
  @ApiEnvelopeResponse(reviewSchema, {
    description: 'The removed review.',
    example: {
      message: 'Review removed',
      data: { ...EXAMPLE_REVIEW, status: 'REMOVED', moderationNote: 'Spam' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, REASON_REQUIRED)
  remove(
    @Param('id', idParam) id: string,
    @Body({ schema: removeReviewRequestSchema }) body: RemoveReviewRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Review> {
    return this.reviews.moderate(id, 'remove', body.reason, actor, client);
  }
}
