import { Injectable } from '@nestjs/common';
import type {
  AdminCommunityPost,
  AdminListCommunityPostsQuery,
  AdminListListingsQuery,
  AdminListing,
  ReportTargetType,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { excerptOf } from '../community/community.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type Tx = Prisma.TransactionClient;

const COLLEGE = { select: { id: true, slug: true, name: true } } as const;
const MEMBER = { select: { id: true, name: true } } as const;

/**
 * Staff actions on community posts, comments and marketplace listings. Hiding is a reversible hold
 * (the author sees the reason); removing is final. Each action is audited, tells the author, and
 * closes the open reports on that content.
 */
@Injectable()
export class ContentModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Community ──────────────────────────────────────────────────────────────────────────────────

  async posts(query: AdminListCommunityPostsQuery): Promise<Paginated<AdminCommunityPost>> {
    const reportedIds = query.reported ? await this.openReportTargets('COMMUNITY_POST') : null;
    const where: Prisma.CommunityPostWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.q ? { title: { contains: query.q } } : {}),
      ...(reportedIds ? { id: { in: reportedIds } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.communityPost.count({ where }),
      this.prisma.communityPost.findMany({
        where,
        include: { college: COLLEGE, author: MEMBER },
        orderBy: { id: 'desc' },
        ...pageWindow(query),
      }),
    ]);
    const counts = await this.openReportCounts(
      'COMMUNITY_POST',
      rows.map((row) => row.id),
    );
    return Paginated.of(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        visibility: row.visibility,
        status: row.status,
        moderationNote: row.moderationNote,
        college: row.college,
        author: row.author,
        commentCount: row.commentCount,
        openReports: counts.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
      { ...query, total },
    );
  }

  async setPostStatus(
    postId: string,
    next: 'ACTIVE' | 'HIDDEN' | 'REMOVED',
    reason: string | undefined,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCommunityPost> {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      select: { status: true, authorId: true, title: true, body: true },
    });
    if (!post) throw AppException.notFound('Post not found');
    assertMove(post.status, next);

    await this.prisma.$transaction(async (tx) => {
      await tx.communityPost.update({
        where: { id: postId },
        data: { status: next, moderationNote: next === 'ACTIVE' ? null : (reason ?? null) },
      });
      await this.record(tx, POST_ACTIONS[next], 'CommunityPost', postId, reason, actor, client);
      if (next !== 'ACTIVE') {
        await this.closeReports(tx, 'COMMUNITY_POST', postId, reason, actor);
        await this.notifications.notify(
          {
            userId: post.authorId,
            category: 'ACCOUNT',
            type: next === 'HIDDEN' ? 'community.post_hidden' : 'community.post_removed',
            title:
              next === 'HIDDEN' ? 'A moderator hid your post' : 'A moderator removed your post',
            message: `"${post.title ?? excerptOf(post.body, 60)}": ${reason ?? 'against the community rules'}`,
            ...(next === 'HIDDEN' ? { link: `/community/posts/${postId}` } : {}),
          },
          tx,
        );
      }
    });
    return this.onePost(postId);
  }

  async removeComment(
    commentId: string,
    reason: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<void> {
    const comment = await this.prisma.communityComment.findUnique({
      where: { id: commentId },
      select: { status: true, postId: true, authorId: true },
    });
    if (!comment) throw AppException.notFound('Comment not found');
    if (comment.status === 'REMOVED') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.communityComment.update({ where: { id: commentId }, data: { status: 'REMOVED' } });
      if (comment.status === 'ACTIVE') {
        await tx.communityPost.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 } },
        });
      }
      await this.record(
        tx,
        'COMMUNITY_COMMENT_REMOVED',
        'CommunityComment',
        commentId,
        reason,
        actor,
        client,
      );
      await this.closeReports(tx, 'COMMUNITY_COMMENT', commentId, reason, actor);
      await this.notifications.notify(
        {
          userId: comment.authorId,
          category: 'ACCOUNT',
          type: 'community.comment_removed',
          title: 'A moderator removed your comment',
          message: reason,
          link: `/community/posts/${comment.postId}`,
        },
        tx,
      );
    });
  }

  // ── Marketplace ────────────────────────────────────────────────────────────────────────────────

  async listings(query: AdminListListingsQuery): Promise<Paginated<AdminListing>> {
    const reportedIds = query.reported ? await this.openReportTargets('MARKETPLACE_LISTING') : null;
    const where: Prisma.MarketplaceListingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.q ? { title: { contains: query.q } } : {}),
      ...(reportedIds ? { id: { in: reportedIds } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.marketplaceListing.count({ where }),
      this.prisma.marketplaceListing.findMany({
        where,
        include: {
          college: COLLEGE,
          seller: MEMBER,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true } },
        },
        orderBy: { id: 'desc' },
        ...pageWindow(query),
      }),
    ]);
    const counts = await this.openReportCounts(
      'MARKETPLACE_LISTING',
      rows.map((row) => row.id),
    );
    return Paginated.of(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        price: row.price,
        status: row.status,
        moderationNote: row.moderationNote,
        college: row.college,
        seller: row.seller,
        coverImageUrl: row.images[0]?.imageUrl ?? null,
        openReports: counts.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
      { ...query, total },
    );
  }

  async setListingStatus(
    listingId: string,
    next: 'ACTIVE' | 'HIDDEN' | 'REMOVED',
    reason: string | undefined,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminListing> {
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { status: true, sellerId: true, title: true },
    });
    if (!listing) throw AppException.notFound('Listing not found');
    if (listing.status === 'REMOVED') {
      throw AppException.conflict('CONFLICT', 'This listing was removed for good.');
    }
    if (next === 'ACTIVE' && listing.status !== 'HIDDEN') {
      throw AppException.conflict('CONFLICT', 'Only a hidden listing can be restored.');
    }
    if (next === 'HIDDEN' && listing.status === 'HIDDEN') {
      throw AppException.conflict('CONFLICT', 'This listing is already hidden.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceListing.update({
        where: { id: listingId },
        data: { status: next, moderationNote: next === 'ACTIVE' ? null : (reason ?? null) },
      });
      await this.record(
        tx,
        LISTING_ACTIONS[next],
        'MarketplaceListing',
        listingId,
        reason,
        actor,
        client,
      );
      if (next !== 'ACTIVE') {
        await this.closeReports(tx, 'MARKETPLACE_LISTING', listingId, reason, actor);
        await this.notifications.notify(
          {
            userId: listing.sellerId,
            category: 'ACCOUNT',
            type: next === 'HIDDEN' ? 'marketplace.listing_hidden' : 'marketplace.listing_removed',
            title:
              next === 'HIDDEN'
                ? 'A moderator hid your listing'
                : 'A moderator removed your listing',
            message: `"${listing.title}": ${reason ?? 'against the marketplace rules'}`,
            ...(next === 'HIDDEN' ? { link: `/marketplace/${listingId}` } : {}),
          },
          tx,
        );
      }
    });
    return this.oneListing(listingId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  async onePost(postId: string): Promise<AdminCommunityPost> {
    const row = await this.prisma.communityPost.findUniqueOrThrow({
      where: { id: postId },
      include: { college: COLLEGE, author: MEMBER },
    });
    const counts = await this.openReportCounts('COMMUNITY_POST', [postId]);
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category,
      visibility: row.visibility,
      status: row.status,
      moderationNote: row.moderationNote,
      college: row.college,
      author: row.author,
      commentCount: row.commentCount,
      openReports: counts.get(postId) ?? 0,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async oneListing(listingId: string): Promise<AdminListing> {
    const row = await this.prisma.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      include: {
        college: COLLEGE,
        seller: MEMBER,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true } },
      },
    });
    const counts = await this.openReportCounts('MARKETPLACE_LISTING', [listingId]);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      status: row.status,
      moderationNote: row.moderationNote,
      college: row.college,
      seller: row.seller,
      coverImageUrl: row.images[0]?.imageUrl ?? null,
      openReports: counts.get(listingId) ?? 0,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Closes every open report on a target as RESOLVED (the content was acted on). */
  async closeReports(
    tx: Tx,
    targetType: ReportTargetType,
    targetId: string,
    note: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<number> {
    const result = await tx.report.updateMany({
      where: { targetType, targetId, status: { in: ['PENDING', 'IN_REVIEW'] } },
      data: {
        status: 'RESOLVED',
        resolution: note ?? null,
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });
    return result.count;
  }

  private async record(
    tx: Tx,
    action: AuditAction,
    entityType: string,
    entityId: string,
    reason: string | undefined,
    actor: AuthenticatedUser,
    client: ClientContext,
  ) {
    await this.audit.record(
      {
        action,
        actorId: actor.id,
        entityType,
        entityId,
        metadata: { reason: reason ?? null },
        client,
      },
      tx,
    );
  }

  private async openReportTargets(targetType: ReportTargetType): Promise<string[]> {
    const rows = await this.prisma.report.findMany({
      where: { targetType, status: { in: ['PENDING', 'IN_REVIEW'] } },
      select: { targetId: true },
      distinct: ['targetId'],
      take: 1000,
    });
    return rows.map((row) => row.targetId);
  }

  async openReportCounts(
    targetType: ReportTargetType,
    targetIds: string[],
  ): Promise<Map<string, number>> {
    if (targetIds.length === 0) return new Map();
    const rows = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType, targetId: { in: targetIds }, status: { in: ['PENDING', 'IN_REVIEW'] } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.targetId, row._count._all]));
  }
}

const POST_ACTIONS = {
  ACTIVE: 'COMMUNITY_POST_RESTORED',
  HIDDEN: 'COMMUNITY_POST_HIDDEN',
  REMOVED: 'COMMUNITY_POST_REMOVED',
} as const satisfies Record<string, AuditAction>;

const LISTING_ACTIONS = {
  ACTIVE: 'LISTING_RESTORED',
  HIDDEN: 'LISTING_HIDDEN',
  REMOVED: 'LISTING_REMOVED',
} as const satisfies Record<string, AuditAction>;

/** Hide only what is visible, restore only what is hidden, and never bring back a removal. */
function assertMove(
  current: 'ACTIVE' | 'HIDDEN' | 'REMOVED',
  next: 'ACTIVE' | 'HIDDEN' | 'REMOVED',
) {
  if (current === 'REMOVED') {
    throw AppException.conflict('CONFLICT', 'This was removed for good.');
  }
  if (next === 'ACTIVE' && current !== 'HIDDEN') {
    throw AppException.conflict('CONFLICT', 'Only hidden content can be restored.');
  }
  if (next === 'HIDDEN' && current === 'HIDDEN') {
    throw AppException.conflict('CONFLICT', 'This is already hidden.');
  }
}
