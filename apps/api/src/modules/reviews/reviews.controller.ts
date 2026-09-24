import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CreateReviewRequest,
  type ListMyReviewsQuery,
  type ListPlaceReviewsQuery,
  type PublicReview,
  type Review,
  type ReviewSummary,
  type ReviewWithdrawn,
  type UpdateReviewRequest,
  createReviewRequestSchema,
  listMyReviewsQuerySchema,
  listPlaceReviewsQuerySchema,
  placeIdOrSlugSchema,
  publicReviewSchema,
  reviewSchema,
  reviewSummarySchema,
  reviewWithdrawnSchema,
  updateReviewRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ReviewsService } from './reviews.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const PLACE_NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Place not found' } as const;
const REVIEW_NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Review not found' } as const;
const UNDER_MODERATION = {
  status: 409,
  code: 'CONFLICT',
  message: 'This review is under moderation and cannot be changed or withdrawn right now.',
} as const;
const DIMENSION_INVALID = {
  status: 400,
  code: 'VALIDATION_ERROR',
  message: 'Validation failed',
  details: {
    fields: { dimensionRatings: ["This place's categories have no such rating dimension"] },
  },
} as const;

const EXAMPLE_PUBLIC_REVIEW = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f790',
  rating: 4,
  comment: 'Good food, fair price. Gets crowded at 1 pm.',
  authorName: 'Asha K.',
  dimensionRatings: [
    { dimensionId: '01a0babd-5555-7000-8000-000000000001', key: 'food', label: 'Food', rating: 5 },
  ],
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
};

const EXAMPLE_REVIEW = {
  ...EXAMPLE_PUBLIC_REVIEW,
  place: { id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f785', slug: 'sample-mess', name: 'Sample Mess' },
  userId: '01a0c44b-14bb-724c-98a4-00a05625e026',
  status: 'PUBLISHED',
  moderationNote: null,
  moderatedById: null,
  moderatedAt: null,
};

const EXAMPLE_SUMMARY = {
  ratingAverage: 4.2,
  ratingCount: 18,
  histogram: [
    { rating: 5, count: 8 },
    { rating: 4, count: 6 },
    { rating: 3, count: 3 },
    { rating: 2, count: 1 },
    { rating: 1, count: 0 },
  ],
  dimensions: [
    {
      id: '01a0babd-5555-7000-8000-000000000001',
      key: 'food',
      label: 'Food',
      average: 4.4,
      count: 12,
    },
  ],
};

/**
 * Reviews of a place: anyone can read them; a signed-in STUDENT can post one per place and edit or
 * withdraw it afterwards. Staff moderation lives at `/admin/reviews`.
 */
@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('places/:idOrSlug/reviews')
  @ResponseMessage('Reviews retrieved')
  @ApiOperation({
    summary: "List a place's reviews",
    description:
      'Published reviews of an active place, paginated. `sort`: `recent` (default), `highest` or `lowest`. ' +
      'Authors are shown by display name only ("Asha K."). Hidden and removed reviews never appear.',
  })
  @ApiEnvelopeResponse(z.array(publicReviewSchema), {
    description: 'A page of reviews.',
    example: {
      message: 'Reviews retrieved',
      data: [EXAMPLE_PUBLIC_REVIEW],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(PLACE_NOT_FOUND, 429)
  listForPlace(
    @Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string,
    @Query({ schema: listPlaceReviewsQuerySchema }) query: ListPlaceReviewsQuery,
  ): Promise<Paginated<PublicReview>> {
    return this.reviews.listForPlace(idOrSlug, query);
  }

  @Public()
  @Get('places/:idOrSlug/reviews/summary')
  @ResponseMessage('Review summary retrieved')
  @ApiOperation({
    summary: "A place's rating summary",
    description:
      'The overall average and count (the same values the place itself carries), a 5-to-1 star histogram, ' +
      'and every rating dimension a reviewer of this place may rate (from its categories), with its average ' +
      'so far (`null` until someone rates it).',
  })
  @ApiEnvelopeResponse(reviewSummarySchema, {
    description: 'The summary.',
    example: { message: 'Review summary retrieved', data: EXAMPLE_SUMMARY },
  })
  @ApiErrorResponses(PLACE_NOT_FOUND, 429)
  summary(
    @Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string,
  ): Promise<ReviewSummary> {
    return this.reviews.summary(idOrSlug);
  }

  @Post('places/:idOrSlug/reviews')
  @Roles('STUDENT')
  @ApiBearerAuth()
  @ResponseMessage('Review posted')
  @ApiOperation({
    summary: 'Review a place',
    description:
      'Students only, one review per place (a second is `409 ALREADY_REVIEWED`: edit the first instead). ' +
      'Published immediately and counted in the place rating at once. `dimensionRatings` may only name ' +
      "dimensions of the place's own categories (see the summary endpoint). The owner or a member of the " +
      "business that manages the place can't review it (403).",
  })
  @ApiEnvelopeResponse(reviewSchema, {
    status: 201,
    description: 'The new review.',
    example: { message: 'Review posted', data: EXAMPLE_REVIEW },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    {
      status: 403,
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
    },
    PLACE_NOT_FOUND,
    DIMENSION_INVALID,
    {
      status: 409,
      code: 'ALREADY_REVIEWED',
      message: 'You have already reviewed this place. Edit your review instead.',
    },
    429,
  )
  create(
    @Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string,
    @Body({ schema: createReviewRequestSchema }) body: CreateReviewRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Review> {
    return this.reviews.create(idOrSlug, body, actor, client);
  }

  @Get('me/reviews')
  @ApiBearerAuth()
  @ResponseMessage('Reviews retrieved')
  @ApiOperation({
    summary: 'My reviews',
    description:
      'Every review the caller wrote, newest first, with its moderation status and note. `placeId` narrows ' +
      'it to one place (answering "have I reviewed this already?").',
  })
  @ApiEnvelopeResponse(z.array(reviewSchema), {
    description: 'A page of reviews.',
    example: {
      message: 'Reviews retrieved',
      data: [EXAMPLE_REVIEW],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  listMine(
    @Query({ schema: listMyReviewsQuerySchema }) query: ListMyReviewsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<Review>> {
    return this.reviews.listMine(query, actor);
  }

  @Patch('reviews/:id')
  @ApiBearerAuth()
  @ResponseMessage('Review updated')
  @ApiOperation({
    summary: 'Edit my review',
    description:
      'Only the author, and only while the review is published (a hidden or removed review is under ' +
      'moderation: 409). `comment: null` clears the comment; `dimensionRatings` replaces the whole set. ' +
      "Anyone else's review answers 404.",
  })
  @ApiEnvelopeResponse(reviewSchema, {
    description: 'The updated review.',
    example: { message: 'Review updated', data: EXAMPLE_REVIEW },
  })
  @ApiErrorResponses(UNAUTHORIZED, REVIEW_NOT_FOUND, DIMENSION_INVALID, UNDER_MODERATION)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateReviewRequestSchema }) body: UpdateReviewRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Review> {
    return this.reviews.update(id, body, actor, client);
  }

  @Delete('reviews/:id')
  @ApiBearerAuth()
  @ResponseMessage('Review withdrawn')
  @ApiOperation({
    summary: 'Withdraw my review',
    description:
      "Deletes the author's own published review and returns the place's updated rating; they may review " +
      'the place again afterwards. A hidden or removed review cannot be withdrawn (409).',
  })
  @ApiEnvelopeResponse(reviewWithdrawnSchema, {
    description: "The place's rating without this review.",
    example: {
      message: 'Review withdrawn',
      data: { placeId: EXAMPLE_REVIEW.place.id, ratingAverage: 4.1, ratingCount: 17 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, REVIEW_NOT_FOUND, UNDER_MODERATION)
  withdraw(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ReviewWithdrawn> {
    return this.reviews.withdraw(id, actor, client);
  }
}
