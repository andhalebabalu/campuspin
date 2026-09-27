import { Injectable } from '@nestjs/common';
import type {
  AdminPromotion,
  CreatePromotionRequest,
  Promotion,
  PromotionEvent,
  PromotionPlacement,
  UpdatePromotionRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { ImageStorage } from '../../infra/storage/image-storage.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { audiencesFor, promotionState, skipAfter } from './promotion-rules.js';

/** At most this many promotions go to an app per request (a splash shows one, the feed a few). */
const PUBLIC_LIMIT = 10;

type PromotionRow = Prisma.PromotionGetPayload<object>;

function toPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    placement: row.placement,
    kind: row.kind,
    title: row.title,
    body: row.body,
    imageUrl: row.imageUrl,
    ctaLabel: row.ctaLabel,
    ctaLink: row.ctaLink,
    displaySeconds: row.displaySeconds,
    skipAfterSeconds: skipAfter(row.displaySeconds, row.skipAfterSeconds),
  };
}

function toAdminPromotion(row: PromotionRow, now = new Date()): AdminPromotion {
  return {
    ...toPromotion(row),
    audience: row.audience,
    active: row.active,
    priority: row.priority,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    state: promotionState(row, now),
    views: row.views,
    clicks: row.clicks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const toDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

/**
 * In-app ads and announcements: what the apps show (filtered by audience and schedule) and how
 * staff manage them. Every staff change is audited.
 */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: ImageStorage,
  ) {}

  /** Live promotions for this viewer, highest priority first. */
  async live(placement: PromotionPlacement, roles: readonly string[] | null): Promise<Promotion[]> {
    const now = new Date();
    const rows = await this.prisma.promotion.findMany({
      where: {
        placement,
        active: true,
        audience: { in: audiencesFor(roles) },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: PUBLIC_LIMIT,
    });
    return rows.map(toPromotion);
  }

  /** Counts a view or a tap. Unknown or paused promotions are ignored, never reported. */
  async record(id: string, event: PromotionEvent): Promise<void> {
    await this.prisma.promotion.updateMany({
      where: { id, active: true },
      data: event === 'view' ? { views: { increment: 1 } } : { clicks: { increment: 1 } },
    });
  }

  // ── Staff ─────────────────────────────────────────────────────────────────────────────────────

  async list(): Promise<AdminPromotion[]> {
    const rows = await this.prisma.promotion.findMany({
      orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
    const now = new Date();
    return rows.map((row) => toAdminPromotion(row, now));
  }

  async create(dto: CreatePromotionRequest, actor: AuthenticatedUser, client: ClientContext): Promise<AdminPromotion> {
    this.assertOwnImage(dto.imageUrl);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.promotion.create({
        data: {
          placement: dto.placement,
          kind: dto.kind,
          audience: dto.audience,
          title: dto.title,
          body: dto.body ?? null,
          imageUrl: dto.imageUrl ?? null,
          ctaLabel: dto.ctaLabel ?? null,
          ctaLink: dto.ctaLink ?? null,
          displaySeconds: dto.displaySeconds,
          skipAfterSeconds: dto.skipAfterSeconds,
          active: dto.active,
          priority: dto.priority,
          startsAt: toDate(dto.startsAt) ?? null,
          endsAt: toDate(dto.endsAt) ?? null,
          createdById: actor.id,
        },
      });
      await this.recordAudit('PROMOTION_CREATED', row.id, actor, client, { placement: row.placement, title: row.title }, tx);
      return toAdminPromotion(row);
    });
  }

  async update(
    id: string,
    dto: UpdatePromotionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPromotion> {
    const current = await this.load(id);
    this.assertOwnImage(dto.imageUrl);

    // The pair rules also hold when only one side changes.
    const displaySeconds = dto.displaySeconds ?? current.displaySeconds;
    const skipAfterSeconds = dto.skipAfterSeconds ?? current.skipAfterSeconds;
    if (skipAfterSeconds > displaySeconds) {
      throw AppException.validation({ skipAfterSeconds: ['The close button must appear before the ad ends'] });
    }
    const startsAt = dto.startsAt === undefined ? current.startsAt : toDate(dto.startsAt);
    const endsAt = dto.endsAt === undefined ? current.endsAt : toDate(dto.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw AppException.validation({ endsAt: ['The end must be after the start'] });
    }

    const data: Prisma.PromotionUpdateInput = {
      ...dto,
      startsAt: toDate(dto.startsAt),
      endsAt: toDate(dto.endsAt),
    };
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.promotion.update({ where: { id }, data });
      await this.recordAudit('PROMOTION_UPDATED', id, actor, client, { changedFields: Object.keys(dto) }, tx);
      return toAdminPromotion(row);
    });
  }

  async remove(id: string, actor: AuthenticatedUser, client: ClientContext): Promise<void> {
    const current = await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.promotion.delete({ where: { id } });
      await this.recordAudit(
        'PROMOTION_DELETED',
        id,
        actor,
        client,
        { title: current.title, views: current.views, clicks: current.clicks },
        tx,
      );
    });
  }

  private async load(id: string): Promise<PromotionRow> {
    const row = await this.prisma.promotion.findUnique({ where: { id } });
    if (!row) throw AppException.notFound('Promotion not found');
    return row;
  }

  /** Ad images must be files this platform stored, never arbitrary outside URLs. */
  private assertOwnImage(url: string | null | undefined) {
    if (url && !this.images.owns(url)) {
      throw AppException.validation({ imageUrl: ['Upload the image here first (POST /uploads/images)'] });
    }
  }

  private recordAudit(
    action: AuditAction,
    promotionId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      { action, actorId: actor.id, entityType: 'Promotion', entityId: promotionId, metadata, client },
      tx,
    );
  }
}
