import { Injectable } from '@nestjs/common';
import type {
  AdminListSubmissionsQuery,
  ApproveSubmissionRequest,
  MarkDuplicateRequest,
  PlaceSubmission,
  RejectSubmissionRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { toPlaceSubmission } from './submission-mappers.js';
import { NEWEST_ORDER_BY, OLDEST_ORDER_BY, SUBMISSION_SELECT } from './submission-queries.js';

const reasonOf = (reason?: string): Prisma.InputJsonObject => (reason ? { reason } : {});

const notReviewable = () =>
  AppException.conflict('CONFLICT', 'This submission has already been reviewed.');

/**
 * Staff review of student submissions: the moderation queue and the three terminal outcomes
 * (approve, reject, mark as a duplicate of an existing place). A submission is reviewable only while
 * PENDING — this phase has no "request changes" loop (the schema's `SubmissionStatus` has no such
 * state; see [02 §5.7 "Implemented in Phase 8"](../../docs/02-architecture.md#57-suggest-a-place-duplicates-contributions)),
 * so once decided a submission's outcome is final; a student who disagrees submits again.
 */
@Injectable()
export class AdminSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminListSubmissionsQuery): Promise<Paginated<PlaceSubmission>> {
    const where: Prisma.PlaceSubmissionWhereInput = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.placeSubmission.count({ where }),
      this.prisma.placeSubmission.findMany({
        where,
        orderBy: query.sort === 'oldest' ? OLDEST_ORDER_BY : NEWEST_ORDER_BY,
        ...pageWindow(query),
        select: SUBMISSION_SELECT,
      }),
    ]);
    return Paginated.of(rows.map(toPlaceSubmission), {
      page: query.page,
      limit: query.limit,
      total,
    });
  }

  async get(id: string): Promise<PlaceSubmission> {
    return toPlaceSubmission(await this.load(id));
  }

  /** Publishes the pending place created at submit time. */
  async approve(
    id: string,
    body: ApproveSubmissionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<PlaceSubmission> {
    const submission = await this.load(id);
    if (submission.status !== 'PENDING') throw notReviewable();
    if (!submission.resultingPlaceId) {
      throw new Error('Every PENDING submission has a resultingPlaceId, set when it was created');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.placeSubmission.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: body?.reason ?? null,
        },
      });
      if (claimed.count !== 1) throw notReviewable();

      const placeId = submission.resultingPlaceId;
      if (placeId === null) throw new Error('checked above');
      await tx.place.update({
        where: { id: placeId },
        data: { status: 'ACTIVE', publishedAt: new Date() },
      });
      await this.record(
        'SUBMISSION_APPROVED',
        id,
        actor,
        client,
        { resultingPlaceId: placeId, ...reasonOf(body?.reason) },
        tx,
      );
      await this.audit.record(
        {
          action: 'PLACE_ACTIVATED',
          actorId: actor.id,
          entityType: 'Place',
          entityId: placeId,
          metadata: { from: 'PENDING', to: 'ACTIVE', viaSubmissionId: id },
          client,
        },
        tx,
      );
    });
    return toPlaceSubmission(await this.load(id));
  }

  /** Rejects the submission and the pending place it created; nothing goes live. */
  async reject(
    id: string,
    body: RejectSubmissionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<PlaceSubmission> {
    const submission = await this.load(id);
    if (submission.status !== 'PENDING') throw notReviewable();

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.placeSubmission.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: body.reason,
        },
      });
      if (claimed.count !== 1) throw notReviewable();

      if (submission.resultingPlaceId) {
        await tx.place.update({
          where: { id: submission.resultingPlaceId },
          data: { status: 'REJECTED' },
        });
      }
      await this.record('SUBMISSION_REJECTED', id, actor, client, { reason: body.reason }, tx);
    });
    return toPlaceSubmission(await this.load(id));
  }

  /** Links the submission to an existing place instead of publishing a second one. */
  async markDuplicate(
    id: string,
    body: MarkDuplicateRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<PlaceSubmission> {
    const submission = await this.load(id);
    if (submission.status !== 'PENDING') throw notReviewable();
    if (submission.resultingPlaceId === body.duplicateOfPlaceId) {
      throw AppException.validation({
        duplicateOfPlaceId: ['A submission cannot be marked as a duplicate of its own pending place'],
      });
    }
    const target = await this.prisma.place.findUnique({
      where: { id: body.duplicateOfPlaceId },
      select: { id: true },
    });
    if (!target) throw AppException.validation({ duplicateOfPlaceId: ['Place does not exist'] });

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.placeSubmission.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'DUPLICATE',
          duplicateOfPlaceId: body.duplicateOfPlaceId,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: body.reason ?? null,
        },
      });
      if (claimed.count !== 1) throw notReviewable();

      if (submission.resultingPlaceId) {
        await tx.place.update({
          where: { id: submission.resultingPlaceId },
          data: { status: 'REJECTED' },
        });
      }
      await this.record(
        'SUBMISSION_MARKED_DUPLICATE',
        id,
        actor,
        client,
        { duplicateOfPlaceId: body.duplicateOfPlaceId, ...reasonOf(body.reason) },
        tx,
      );
    });
    return toPlaceSubmission(await this.load(id));
  }

  private async load(id: string) {
    const submission = await this.prisma.placeSubmission.findUnique({
      where: { id },
      select: SUBMISSION_SELECT,
    });
    if (!submission) throw AppException.notFound('Submission not found');
    return submission;
  }

  private record(
    action: AuditAction,
    submissionId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      {
        action,
        actorId: actor.id,
        entityType: 'PlaceSubmission',
        entityId: submissionId,
        metadata,
        client,
      },
      tx,
    );
  }
}
