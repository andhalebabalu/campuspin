import { Injectable } from '@nestjs/common';
import type {
  AdminAmenity,
  AmenityActionRequest,
  CreateAmenityRequest,
  UpdateAmenityRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { diffFields } from '../../common/utils/diff-fields.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { type AdminAmenityRow, toAdminAmenity } from './category-mappers.js';
import { planActiveStatusChange } from './category-rules.js';
import { ADMIN_AMENITY_SELECT, AMENITY_ORDER_BY } from './category-queries.js';

const keyTaken = () =>
  AppException.conflict('CONFLICT', 'This key is already used by another amenity.');
const staleWrite = () =>
  AppException.conflict(
    'CONFLICT',
    'This amenity was changed by someone else. Reload it and try again.',
  );

function reasonOf(body: AmenityActionRequest): Prisma.InputJsonObject {
  return body?.reason ? { reason: body.reason } : {};
}

/**
 * Everything staff can do to the amenity list. The dataset is small (a few dozen rows at most), so
 * the only read is the full list; there is no per-amenity detail beyond what the list already shows.
 * Amenities are never deleted, only deactivated: a place may already offer one.
 */
@Injectable()
export class AdminAmenitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminAmenity[]> {
    const rows = await this.prisma.amenity.findMany({
      orderBy: AMENITY_ORDER_BY,
      select: ADMIN_AMENITY_SELECT,
    });
    return rows.map(toAdminAmenity);
  }

  async create(
    dto: CreateAmenityRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminAmenity> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const amenity = await tx.amenity.create({
          data: { key: dto.key, name: dto.name, icon: dto.icon ?? null, sortOrder: dto.sortOrder },
          select: ADMIN_AMENITY_SELECT,
        });
        await this.record('AMENITY_CREATED', amenity.id, actor, client, { key: dto.key }, tx);
        return toAdminAmenity(amenity);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw keyTaken();
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateAmenityRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminAmenity> {
    const current = await this.load(id);
    const changed = diffFields(current, dto);
    if (changed.length === 0) return toAdminAmenity(current);

    const updated = await this.prisma.$transaction(async (tx) => {
      const amenity = await tx.amenity.update({
        where: { id },
        data: dto,
        select: ADMIN_AMENITY_SELECT,
      });
      await this.record('AMENITY_UPDATED', id, actor, client, { changedFields: changed }, tx);
      return amenity;
    });
    return toAdminAmenity(updated);
  }

  async setStatus(
    id: string,
    action: 'activate' | 'deactivate',
    body: AmenityActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminAmenity> {
    const current = await this.load(id);
    const plan = planActiveStatusChange(action, current.status);
    if (plan.kind === 'noop') return toAdminAmenity(current);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.amenity.updateMany({
        where: { id, status: current.status },
        data: { status: plan.to },
      });
      if (claimed.count !== 1) throw staleWrite();
      await this.record(
        action === 'activate' ? 'AMENITY_ACTIVATED' : 'AMENITY_DEACTIVATED',
        id,
        actor,
        client,
        { from: current.status, to: plan.to, ...reasonOf(body) },
        tx,
      );
    });
    return this.load(id).then(toAdminAmenity);
  }

  private async load(id: string): Promise<AdminAmenityRow> {
    const amenity = await this.prisma.amenity.findUnique({
      where: { id },
      select: ADMIN_AMENITY_SELECT,
    });
    if (!amenity) throw AppException.notFound('Amenity not found');
    return amenity;
  }

  private record(
    action: AuditAction,
    amenityId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      { action, actorId: actor.id, entityType: 'Amenity', entityId: amenityId, metadata, client },
      tx,
    );
  }
}
