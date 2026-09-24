import { Injectable } from '@nestjs/common';
import type { AdminListReviewsQuery, Review, ReviewStatus } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { lockPlace, refreshPlaceRating } from './place-rating.js';
import { toReview } from './review-mappers.js';
import { ADMIN_ORDER_BY, REVIEW_SELECT } from './review-queries.js';
import { type ModerationAction, planModeration } from './review-rules.js';

const AUDIT_ACTION: Record<ModerationAction, AuditAction> = {
  hide: 'REVIEW_HIDDEN',
  restore: 'REVIEW_RESTORED',
  remove: 'REVIEW_REMOVED',
};

/**
 * Staff moderation of reviews: the queue and hide / restore / remove. Staff can never edit a
 * review's text or rating, and nothing here deletes a row — a removed review is kept for legal hold
 * and audit. Every change recomputes the place's rating in the same transaction.
 */
@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminListReviewsQuery): Promise<Paginated<Review>> {
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.placeId ? { placeId: query.placeId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: ADMIN_ORDER_BY[query.sort],
        ...pageWindow(query),
        select: REVIEW_SELECT,
      }),
    ]);
    return Paginated.of(rows.map(toReview), { page: query.page, limit: query.limit, total });
  }

  async get(id: string): Promise<Review> {
    return toReview(await this.load(id));
  }

  async moderate(
    id: string,
    action: ModerationAction,
    reason: string | undefined,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<Review> {
    const review = await this.load(id);
    const plan = planModeration(action, review.status);
    if (plan.kind === 'noop') return toReview(review);
    if (plan.kind === 'invalid') throw AppException.conflict('CONFLICT', plan.message);

    await this.prisma.$transaction(async (tx) => {
      await lockPlace(tx, review.place.id);
      // Conditional on the status read above: two moderators acting at once cannot both "win".
      const claimed = await tx.review.updateMany({
        where: { id, status: review.status },
        data: {
          status: plan.to,
          moderationNote: reason ?? null,
          moderatedById: actor.id,
          moderatedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw AppException.conflict(
          'CONFLICT',
          'This review changed while you were looking at it. Reload and try again.',
        );
      }
      const rating = await refreshPlaceRating(tx, review.place.id);
      await this.audit.record(
        {
          action: AUDIT_ACTION[action],
          actorId: actor.id,
          entityType: 'Review',
          entityId: id,
          metadata: {
            placeId: review.place.id,
            from: review.status,
            to: plan.to satisfies ReviewStatus,
            ...(reason ? { reason } : {}),
            placeRating: rating,
          },
          client,
        },
        tx,
      );
    });
    return toReview(await this.load(id));
  }

  private async load(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id }, select: REVIEW_SELECT });
    if (!review) throw AppException.notFound('Review not found');
    return review;
  }
}
