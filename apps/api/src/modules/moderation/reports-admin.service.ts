import { Injectable } from '@nestjs/common';
import type {
  AdminListReportsQuery,
  AdminReport,
  DismissReportRequest,
  PermissionKey,
  ReportTargetType,
  ResolveReportRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { RbacService } from '../auth/services/rbac.service.js';
import { ContentModerationService } from './content-moderation.service.js';

/** Which permission lets a staff member handle reports on each kind of content. */
const PERMISSION_FOR: Readonly<Partial<Record<ReportTargetType, PermissionKey[]>>> = {
  COMMUNITY_POST: ['community.moderate'],
  COMMUNITY_COMMENT: ['community.moderate'],
  MARKETPLACE_LISTING: ['marketplace.moderate'],
  USER: ['community.moderate', 'marketplace.moderate'],
};

const excerpt = (text: string) => (text.length > 240 ? `${text.slice(0, 237)}…` : text);

type Target = AdminReport['target'];

/**
 * The member reports queue. Each staff member sees the reports their permissions let them act on
 * (community moderators: posts, comments and members; marketplace moderators: listings and members).
 */
@Injectable()
export class ReportsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly content: ContentModerationService,
  ) {}

  async allowedTypes(actor: AuthenticatedUser): Promise<ReportTargetType[]> {
    const granted = new Set(await this.rbac.permissionsForRoles(actor.roles));
    return (Object.keys(PERMISSION_FOR) as ReportTargetType[]).filter((type) =>
      PERMISSION_FOR[type]!.some((permission) => granted.has(permission)),
    );
  }

  async list(
    actor: AuthenticatedUser,
    query: AdminListReportsQuery,
  ): Promise<Paginated<AdminReport>> {
    const allowed = await this.allowedTypes(actor);
    const types = query.targetType ? allowed.filter((type) => type === query.targetType) : allowed;
    const where = {
      targetType: { in: types },
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: { reporter: { select: { id: true, name: true } } },
        // The queue works oldest first while open; closed ones read newest first.
        orderBy:
          query.status === 'PENDING' || query.status === 'IN_REVIEW'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
    ]);

    const targets = await this.targets(rows);
    const openCounts = new Map<string, number>();
    for (const type of new Set(rows.map((row) => row.targetType))) {
      const counts = await this.content.openReportCounts(
        type,
        rows.filter((row) => row.targetType === type).map((row) => row.targetId),
      );
      for (const [id, count] of counts) openCounts.set(`${type}:${id}`, count);
    }

    return Paginated.of(
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
        description: row.description,
        reporter: row.reporter,
        target: targets.get(`${row.targetType}:${row.targetId}`) ?? {
          type: row.targetType,
          id: row.targetId,
          label: null,
          excerpt: null,
          status: null,
          owner: null,
          link: null,
        },
        openReportsOnTarget: openCounts.get(`${row.targetType}:${row.targetId}`) ?? 0,
        resolution: row.resolution,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      { ...query, total },
    );
  }

  /** Act on the reported content (or not) and close every open report on it. */
  async resolve(
    reportId: string,
    dto: ResolveReportRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminReport> {
    const report = await this.openReport(reportId, actor);
    const { targetType, targetId } = report;

    if (dto.action !== 'NONE') {
      await this.apply(targetType, targetId, dto, actor, client);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.content.closeReports(tx, targetType, targetId, dto.note, actor);
      await this.audit.record(
        {
          action: 'REPORT_RESOLVED',
          actorId: actor.id,
          entityType: 'Report',
          entityId: reportId,
          metadata: { action: dto.action, targetType, targetId, note: dto.note },
          client,
        },
        tx,
      );
    });
    return this.one(reportId);
  }

  async dismiss(
    reportId: string,
    dto: DismissReportRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminReport> {
    await this.openReport(reportId, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: 'DISMISSED',
          resolution: dto.note ?? null,
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          action: 'REPORT_DISMISSED',
          actorId: actor.id,
          entityType: 'Report',
          entityId: reportId,
          metadata: { note: dto.note ?? null },
          client,
        },
        tx,
      );
    });
    return this.one(reportId);
  }

  /** How many open reports this staff member can act on (for the dashboard). */
  async openCount(actor: AuthenticatedUser): Promise<number> {
    return this.prisma.report.count({
      where: {
        targetType: { in: await this.allowedTypes(actor) },
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Hides or removes the reported content. Content already in that state (another moderator got
   * there first) is fine: the reports are closed all the same.
   */
  private async apply(
    targetType: ReportTargetType,
    targetId: string,
    dto: ResolveReportRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<void> {
    const next = dto.action === 'HIDE' ? 'HIDDEN' : 'REMOVED';
    try {
      if (targetType === 'COMMUNITY_POST') {
        await this.content.setPostStatus(targetId, next, dto.note, actor, client);
      } else if (targetType === 'MARKETPLACE_LISTING') {
        await this.content.setListingStatus(targetId, next, dto.note, actor, client);
      } else if (targetType === 'COMMUNITY_COMMENT') {
        // Comments have no hold: hiding one removes it.
        await this.content.removeComment(targetId, dto.note, actor, client);
      } else {
        throw AppException.badRequest(
          'BAD_REQUEST',
          'Members are not hidden from here: suspend the account from the users screen.',
        );
      }
    } catch (error) {
      if (!(error instanceof AppException && error.code === 'CONFLICT')) throw error;
    }
  }

  private async openReport(reportId: string, actor: AuthenticatedUser) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { targetType: true, targetId: true, status: true },
    });
    const allowed = await this.allowedTypes(actor);
    if (!report || !allowed.includes(report.targetType)) {
      throw AppException.notFound('Report not found');
    }
    if (report.status !== 'PENDING' && report.status !== 'IN_REVIEW') {
      throw AppException.conflict('CONFLICT', 'This report is already closed.');
    }
    return report;
  }

  private async one(reportId: string): Promise<AdminReport> {
    const row = await this.prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      include: { reporter: { select: { id: true, name: true } } },
    });
    const targets = await this.targets([row]);
    const counts = await this.content.openReportCounts(row.targetType, [row.targetId]);
    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      description: row.description,
      reporter: row.reporter,
      target: targets.get(`${row.targetType}:${row.targetId}`)!,
      openReportsOnTarget: counts.get(row.targetId) ?? 0,
      resolution: row.resolution,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** A readable summary of each reported thing, loaded in one query per kind. */
  private async targets(
    rows: ReadonlyArray<{ targetType: ReportTargetType; targetId: string }>,
  ): Promise<Map<string, Target>> {
    const idsOf = (type: ReportTargetType) => [
      ...new Set(rows.filter((row) => row.targetType === type).map((row) => row.targetId)),
    ];
    const member = { select: { id: true, name: true } } as const;
    const [posts, comments, listings, users] = await Promise.all([
      this.prisma.communityPost.findMany({
        where: { id: { in: idsOf('COMMUNITY_POST') } },
        select: { id: true, title: true, body: true, status: true, author: member },
      }),
      this.prisma.communityComment.findMany({
        where: { id: { in: idsOf('COMMUNITY_COMMENT') } },
        select: {
          id: true,
          body: true,
          status: true,
          postId: true,
          author: member,
          post: { select: { title: true } },
        },
      }),
      this.prisma.marketplaceListing.findMany({
        where: { id: { in: idsOf('MARKETPLACE_LISTING') } },
        select: { id: true, title: true, description: true, status: true, seller: member },
      }),
      this.prisma.user.findMany({
        where: { id: { in: idsOf('USER') } },
        select: { id: true, name: true, status: true },
      }),
    ]);

    const map = new Map<string, Target>();
    for (const post of posts) {
      map.set(`COMMUNITY_POST:${post.id}`, {
        type: 'COMMUNITY_POST',
        id: post.id,
        label: post.title ?? excerpt(post.body),
        excerpt: excerpt(post.body),
        status: post.status,
        owner: post.author,
        link: `/community/posts/${post.id}`,
      });
    }
    for (const comment of comments) {
      map.set(`COMMUNITY_COMMENT:${comment.id}`, {
        type: 'COMMUNITY_COMMENT',
        id: comment.id,
        label: `Comment on "${comment.post.title ?? 'a message'}"`,
        excerpt: excerpt(comment.body),
        status: comment.status,
        owner: comment.author,
        link: `/community/posts/${comment.postId}`,
      });
    }
    for (const listing of listings) {
      map.set(`MARKETPLACE_LISTING:${listing.id}`, {
        type: 'MARKETPLACE_LISTING',
        id: listing.id,
        label: listing.title,
        excerpt: excerpt(listing.description),
        status: listing.status,
        owner: listing.seller,
        link: `/marketplace/${listing.id}`,
      });
    }
    for (const user of users) {
      map.set(`USER:${user.id}`, {
        type: 'USER',
        id: user.id,
        label: user.name,
        excerpt: null,
        status: user.status,
        owner: { id: user.id, name: user.name },
        link: `/members/${user.id}`,
      });
    }
    return map;
  }
}
