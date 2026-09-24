import { Injectable } from '@nestjs/common';
import type {
  CreateReviewRequest,
  DimensionRatingInput,
  ListMyReviewsQuery,
  ListPlaceReviewsQuery,
  PublicReview,
  Review,
  ReviewSummary,
  ReviewWithdrawn,
  UpdateReviewRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { idOrSlugFilter } from '../places/place-queries.js';
import { lockPlace, refreshPlaceRating } from './place-rating.js';
import { toPublicReview, toReview } from './review-mappers.js';
import {
  PUBLIC_ORDER_BY,
  PUBLIC_REVIEW_SELECT,
  REVIEW_SELECT,
  visibleOnly,
} from './review-queries.js';
import {
  buildHistogram,
  canAuthorChange,
  roundRating,
  unknownDimensionIds,
} from './review-rules.js';

const alreadyReviewed = () =>
  AppException.conflict(
    'ALREADY_REVIEWED',
    'You have already reviewed this place. Edit your review instead.',
  );

const underModeration = () =>
  AppException.conflict(
    'CONFLICT',
    'This review is under moderation and cannot be changed or withdrawn right now.',
  );

const placeNotFound = () => AppException.notFound('Place not found');
const reviewNotFound = () => AppException.notFound('Review not found');

interface ActivePlace {
  id: string;
  businessProfileId: string | null;
}

/**
 * The public and author-facing half of reviews: reading a place's reviews and rating summary,
 * posting one review per place, and editing or withdrawing it. Staff moderation lives in
 * `AdminReviewsService`. Every write keeps the place's stored rating in step, in the same
 * transaction (see `place-rating.ts`).
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────────────────────────────

  async listForPlace(
    idOrSlug: string,
    query: ListPlaceReviewsQuery,
  ): Promise<Paginated<PublicReview>> {
    const place = await this.activePlace(idOrSlug);
    const where: Prisma.ReviewWhereInput = { placeId: place.id, ...visibleOnly };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: PUBLIC_ORDER_BY[query.sort],
        ...pageWindow(query),
        select: PUBLIC_REVIEW_SELECT,
      }),
    ]);
    return Paginated.of(rows.map(toPublicReview), { page: query.page, limit: query.limit, total });
  }

  async summary(idOrSlug: string): Promise<ReviewSummary> {
    const place = await this.prisma.place.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(idOrSlug) },
      select: { id: true, ratingAverage: true, ratingCount: true },
    });
    if (!place) throw placeNotFound();

    const [byRating, dimensions, byDimension] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { placeId: place.id, ...visibleOnly },
        _count: { _all: true },
      }),
      this.dimensionsOf(place.id),
      this.prisma.reviewRating.groupBy({
        by: ['dimensionId'],
        where: { review: { placeId: place.id, ...visibleOnly } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    const statsByDimension = new Map(byDimension.map((row) => [row.dimensionId, row]));

    return {
      ratingAverage: place.ratingAverage,
      ratingCount: place.ratingCount,
      histogram: buildHistogram(
        byRating.map((row) => ({ rating: row.rating, count: row._count._all })),
      ),
      dimensions: dimensions.map((dimension) => {
        const stats = statsByDimension.get(dimension.id);
        const average = stats?._avg.rating;
        return {
          id: dimension.id,
          key: dimension.key,
          label: dimension.label,
          average: average === null || average === undefined ? null : roundRating(average),
          count: stats?._count._all ?? 0,
        };
      }),
    };
  }

  // ── The author ─────────────────────────────────────────────────────────────────────────────────

  async create(
    idOrSlug: string,
    dto: CreateReviewRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<Review> {
    const place = await this.activePlace(idOrSlug);
    await this.assertNotOwnBusiness(place, actor);
    await this.assertDimensionsBelongTo(place.id, dto.dimensionRatings);
    const existing = await this.prisma.review.count({
      where: { placeId: place.id, userId: actor.id },
    });
    if (existing > 0) throw alreadyReviewed();

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const locked = await lockPlace(tx, place.id);
        if (locked?.status !== 'ACTIVE') throw placeNotFound();

        const review = await tx.review.create({
          data: {
            placeId: place.id,
            userId: actor.id,
            rating: dto.rating,
            comment: dto.comment ?? null,
            ratings: { create: dimensionRows(dto.dimensionRatings) },
          },
          select: { id: true },
        });
        const rating = await refreshPlaceRating(tx, place.id);
        await this.audit.record(
          {
            action: 'REVIEW_CREATED',
            actorId: actor.id,
            entityType: 'Review',
            entityId: review.id,
            metadata: { placeId: place.id, rating: dto.rating, placeRating: rating },
            client,
          },
          tx,
        );
        return review.id;
      });
    } catch (error) {
      // Two simultaneous first reviews by the same user: the unique (placeId, userId) index decides.
      if (isUniqueConstraintError(error)) throw alreadyReviewed();
      throw error;
    }
    return this.loadOwn(id, actor);
  }

  async listMine(query: ListMyReviewsQuery, actor: AuthenticatedUser): Promise<Paginated<Review>> {
    const where: Prisma.ReviewWhereInput = {
      userId: actor.id,
      ...(query.placeId ? { placeId: query.placeId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: PUBLIC_ORDER_BY.recent,
        ...pageWindow(query),
        select: REVIEW_SELECT,
      }),
    ]);
    return Paginated.of(rows.map(toReview), { page: query.page, limit: query.limit, total });
  }

  async update(
    id: string,
    dto: UpdateReviewRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<Review> {
    const review = await this.loadOwnRow(id, actor);
    if (!canAuthorChange(review.status)) throw underModeration();
    if (dto.dimensionRatings)
      await this.assertDimensionsBelongTo(review.place.id, dto.dimensionRatings);

    await this.prisma.$transaction(async (tx) => {
      await lockPlace(tx, review.place.id);
      // Conditional on the status still being one the author may change: a moderator hiding the
      // review between the read above and this write wins, and the edit is refused.
      const claimed = await tx.review.updateMany({
        where: { id, userId: actor.id, ...visibleOnly },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        },
      });
      if (claimed.count !== 1) throw underModeration();

      if (dto.dimensionRatings) {
        await tx.reviewRating.deleteMany({ where: { reviewId: id } });
        await tx.reviewRating.createMany({
          data: dimensionRows(dto.dimensionRatings).map((row) => ({ ...row, reviewId: id })),
        });
      }
      const rating = await refreshPlaceRating(tx, review.place.id);
      await this.audit.record(
        {
          action: 'REVIEW_UPDATED',
          actorId: actor.id,
          entityType: 'Review',
          entityId: id,
          metadata: {
            placeId: review.place.id,
            changed: Object.keys(dto).filter(
              (key) => dto[key as keyof UpdateReviewRequest] !== undefined,
            ),
            ...(dto.rating !== undefined ? { from: review.rating, to: dto.rating } : {}),
            placeRating: rating,
          },
          client,
        },
        tx,
      );
    });
    return this.loadOwn(id, actor);
  }

  /**
   * The author takes their review down. It is deleted outright (with its dimension ratings): it is
   * their own content, and nothing a moderator acted on is lost, because a hidden or removed review
   * cannot be withdrawn. The audit log keeps that it existed. They may then review the place again.
   */
  async withdraw(
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<ReviewWithdrawn> {
    const review = await this.loadOwnRow(id, actor);
    if (!canAuthorChange(review.status)) throw underModeration();

    return this.prisma.$transaction(async (tx) => {
      await lockPlace(tx, review.place.id);
      const deleted = await tx.review.deleteMany({
        where: { id, userId: actor.id, ...visibleOnly },
      });
      if (deleted.count !== 1) throw underModeration();

      const rating = await refreshPlaceRating(tx, review.place.id);
      await this.audit.record(
        {
          action: 'REVIEW_WITHDRAWN',
          actorId: actor.id,
          entityType: 'Review',
          entityId: id,
          metadata: { placeId: review.place.id, rating: review.rating, placeRating: rating },
          client,
        },
        tx,
      );
      return { placeId: review.place.id, ...rating };
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async activePlace(idOrSlug: string): Promise<ActivePlace> {
    const place = await this.prisma.place.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(idOrSlug) },
      select: { id: true, businessProfileId: true },
    });
    if (!place) throw placeNotFound();
    return place;
  }

  /** A business cannot rate itself: its owner and members are refused on their own listings. */
  private async assertNotOwnBusiness(place: ActivePlace, actor: AuthenticatedUser): Promise<void> {
    if (!place.businessProfileId) return;
    const managesIt = await this.prisma.businessProfile.count({
      where: {
        id: place.businessProfileId,
        OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }],
      },
    });
    if (managesIt > 0) {
      throw AppException.forbidden('FORBIDDEN', 'You cannot review a place your business manages.');
    }
  }

  /** Every rating dimension of every category the place is in, in display order. */
  private dimensionsOf(placeId: string) {
    return this.prisma.categoryRatingDimension.findMany({
      where: { category: { places: { some: { placeId } } } },
      select: { id: true, key: true, label: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }, { id: 'asc' }],
    });
  }

  private async assertDimensionsBelongTo(
    placeId: string,
    ratings: readonly DimensionRatingInput[],
  ): Promise<void> {
    if (ratings.length === 0) return;
    const allowed = new Set((await this.dimensionsOf(placeId)).map((dimension) => dimension.id));
    const unknown = unknownDimensionIds(ratings, allowed);
    if (unknown.length > 0) {
      throw AppException.validation({
        dimensionRatings: ["This place's categories have no such rating dimension"],
      });
    }
  }

  /** The caller's own review. Someone else's is a 404, so its existence is not revealed. */
  private async loadOwnRow(id: string, actor: AuthenticatedUser) {
    const row = await this.prisma.review.findUnique({ where: { id }, select: REVIEW_SELECT });
    if (!row || row.userId !== actor.id) throw reviewNotFound();
    return row;
  }

  private async loadOwn(id: string, actor: AuthenticatedUser): Promise<Review> {
    return toReview(await this.loadOwnRow(id, actor));
  }
}

function dimensionRows(ratings: readonly DimensionRatingInput[]) {
  return ratings.map((entry) => ({ dimensionId: entry.dimensionId, rating: entry.rating }));
}
