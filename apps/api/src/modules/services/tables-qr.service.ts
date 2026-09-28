import { Injectable } from '@nestjs/common';
import {
  MAX_TABLES,
  type AdminListQrQuery,
  type AdminQrCode,
  looksLikeUuid,
  type CreateQrRequest,
  type CreateTablesRequest,
  type OwnerQrCode,
  type PlaceTable,
  type QrResolution,
  type UpdateTableRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { dayKey, istDay } from '../analytics/activity-rules.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { qrToken } from '../orders/order-rules.js';
import { SERVICE_PLACE_WHERE } from './service-rules.js';

const QR_SELECT = {
  id: true,
  token: true,
  kind: true,
  status: true,
  scanCount: true,
  lastScannedAt: true,
  createdAt: true,
  table: { select: { id: true, label: true } },
} satisfies Prisma.PlaceQrCodeSelect;
type QrRow = Prisma.PlaceQrCodeGetPayload<{ select: typeof QR_SELECT }>;

const toQr = (row: QrRow): OwnerQrCode => ({
  id: row.id,
  token: row.token,
  kind: row.kind,
  table: row.table,
  status: row.status,
  scanCount: row.scanCount,
  lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const activeKeyOf = (placeId: string, kind: string, tableId: string | null) =>
  `${placeId}:${kind}:${tableId ?? '-'}`;

/** "Table 01" … "Table 99", then "Table 100". */
const tableLabel = (n: number) => `Table ${String(n).padStart(2, '0')}`;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Tables and printed CampusPin QR codes. A QR code carries only a random token; scanning resolves it
 * to the place (and table) and counts the scan. Regenerating retires the old print; disabling stops
 * it working at all.
 */
@Injectable()
export class TablesQrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly audit: AuditService,
  ) {}

  // ── Tables ─────────────────────────────────────────────────────────────────────────────────────

  async tables(actor: AuthenticatedUser, placeId: string): Promise<PlaceTable[]> {
    const place = await this.access.placeOf(actor, placeId);
    return this.tableList(place.id);
  }

  async createTables(
    actor: AuthenticatedUser,
    placeId: string,
    dto: CreateTablesRequest,
    client: ClientContext,
  ): Promise<PlaceTable[]> {
    const place = await this.access.placeOf(actor, placeId);
    const existing = await this.prisma.placeTable.findMany({
      where: { placeId: place.id },
      select: { label: true, sortOrder: true },
    });
    const labels = new Set(existing.map((table) => table.label.toLowerCase()));
    let order = existing.reduce((max, table) => Math.max(max, table.sortOrder), 0);
    const wanted: string[] = [];
    if ('label' in dto) {
      if (labels.has(dto.label.toLowerCase())) {
        throw AppException.conflict('CONFLICT', `There is already a table called ${dto.label}`);
      }
      wanted.push(dto.label);
    } else {
      // Next free numbers: adding 5 tables to "Table 01..03" gives "Table 04..08".
      for (let n = 1; wanted.length < dto.count; n += 1) {
        if (!labels.has(tableLabel(n).toLowerCase())) wanted.push(tableLabel(n));
      }
    }
    if (existing.length + wanted.length > MAX_TABLES) {
      throw AppException.validation({ count: [`A place can have at most ${MAX_TABLES} tables`] });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.placeTable.createMany({
        data: wanted.map((label) => ({ placeId: place.id, label, sortOrder: (order += 1) })),
      });
      await this.audit.record(
        {
          action: 'PLACE_TABLES_CREATED',
          actorId: actor.id,
          entityType: 'Place',
          entityId: place.id,
          metadata: { labels: wanted },
          client,
        },
        tx,
      );
    });
    return this.tableList(place.id);
  }

  async updateTable(
    actor: AuthenticatedUser,
    placeId: string,
    tableId: string,
    dto: UpdateTableRequest,
    client: ClientContext,
  ): Promise<PlaceTable[]> {
    const place = await this.access.placeOf(actor, placeId);
    const table = await this.prisma.placeTable.findFirst({
      where: { id: tableId, placeId: place.id },
    });
    if (!table) throw AppException.notFound('Table not found');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.placeTable.update({
          where: { id: tableId },
          data: {
            ...(dto.label !== undefined ? { label: dto.label } : {}),
            ...(dto.active !== undefined ? { status: dto.active ? 'ACTIVE' : 'INACTIVE' } : {}),
            ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          },
        });
        await this.audit.record(
          {
            action: 'PLACE_TABLE_UPDATED',
            actorId: actor.id,
            entityType: 'PlaceTable',
            entityId: tableId,
            metadata: { fields: Object.keys(dto) },
            client,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict('CONFLICT', `There is already a table called ${dto.label}`);
      }
      throw error;
    }
    return this.tableList(place.id);
  }

  /** Deleting a table also retires its QR codes (they cascade); past orders keep the table name. */
  async deleteTable(
    actor: AuthenticatedUser,
    placeId: string,
    tableId: string,
    client: ClientContext,
  ) {
    const place = await this.access.placeOf(actor, placeId);
    const table = await this.prisma.placeTable.findFirst({
      where: { id: tableId, placeId: place.id },
    });
    if (!table) throw AppException.notFound('Table not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.placeTable.delete({ where: { id: tableId } });
      await this.audit.record(
        {
          action: 'PLACE_TABLE_DELETED',
          actorId: actor.id,
          entityType: 'PlaceTable',
          entityId: tableId,
          metadata: { placeId: place.id, label: table.label },
          client,
        },
        tx,
      );
    });
    return this.tableList(place.id);
  }

  // ── QR codes ───────────────────────────────────────────────────────────────────────────────────

  async qrCodes(actor: AuthenticatedUser, placeId: string): Promise<OwnerQrCode[]> {
    const place = await this.access.placeOf(actor, placeId);
    const rows = await this.prisma.placeQrCode.findMany({
      where: { placeId: place.id, status: { not: 'REPLACED' } },
      select: QR_SELECT,
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toQr);
  }

  /** Returns the live code for the target, creating it when there is none. */
  async createQr(
    actor: AuthenticatedUser,
    placeId: string,
    dto: CreateQrRequest,
    client: ClientContext,
  ): Promise<OwnerQrCode> {
    const place = await this.access.placeOf(actor, placeId);
    const tableId = dto.kind === 'TABLE' ? dto.tableId : null;
    if (tableId) {
      const table = await this.prisma.placeTable.findFirst({
        where: { id: tableId, placeId: place.id },
      });
      if (!table) throw AppException.notFound('Table not found');
    }
    const activeKey = activeKeyOf(place.id, dto.kind, tableId);
    const existing = await this.prisma.placeQrCode.findUnique({
      where: { activeKey },
      select: QR_SELECT,
    });
    if (existing) return toQr(existing);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.placeQrCode.create({
          data: {
            token: qrToken(),
            placeId: place.id,
            kind: dto.kind,
            tableId,
            activeKey,
            createdById: actor.id,
          },
          select: QR_SELECT,
        });
        await this.audit.record(
          {
            action: 'QR_CREATED',
            actorId: actor.id,
            entityType: 'PlaceQrCode',
            entityId: created.id,
            metadata: { placeId: place.id, kind: dto.kind, tableId },
            client,
          },
          tx,
        );
        return created;
      });
      return toQr(row);
    } catch (error) {
      // Two taps at once: the other request created it; return that one.
      if (isUniqueViolation(error)) {
        return toQr(
          await this.prisma.placeQrCode.findUniqueOrThrow({
            where: { activeKey },
            select: QR_SELECT,
          }),
        );
      }
      throw error;
    }
  }

  /** A fresh token for the same target; the old print stops working at once. */
  async regenerate(
    actor: AuthenticatedUser,
    qrId: string,
    client: ClientContext,
  ): Promise<OwnerQrCode> {
    const current = await this.ownedQr(actor, qrId);
    const activeKey = activeKeyOf(current.placeId, current.kind, current.tableId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.placeQrCode.update({
        where: { id: current.id },
        data: { status: 'REPLACED', activeKey: null },
      });
      const created = await tx.placeQrCode.create({
        data: {
          token: qrToken(),
          placeId: current.placeId,
          kind: current.kind,
          tableId: current.tableId,
          activeKey,
          createdById: actor.id,
        },
        select: QR_SELECT,
      });
      await this.audit.record(
        {
          action: 'QR_REGENERATED',
          actorId: actor.id,
          entityType: 'PlaceQrCode',
          entityId: created.id,
          metadata: { replaced: current.id },
          client,
        },
        tx,
      );
      return created;
    });
    return toQr(row);
  }

  async setEnabled(
    actor: AuthenticatedUser,
    qrId: string,
    enabled: boolean,
    client: ClientContext,
  ): Promise<OwnerQrCode> {
    const current = await this.ownedQr(actor, qrId);
    if (current.status === 'REPLACED')
      throw AppException.conflict('QR_INACTIVE', 'This code was replaced by a newer one.');
    const activeKey = enabled ? activeKeyOf(current.placeId, current.kind, current.tableId) : null;
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.placeQrCode.update({
          where: { id: current.id },
          data: { status: enabled ? 'ACTIVE' : 'DISABLED', activeKey },
          select: QR_SELECT,
        });
        await this.audit.record(
          {
            action: enabled ? 'QR_ENABLED' : 'QR_DISABLED',
            actorId: actor.id,
            entityType: 'PlaceQrCode',
            entityId: current.id,
            client,
          },
          tx,
        );
        return updated;
      });
      return toQr(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppException.conflict('CONFLICT', 'Another code is already live for this table.');
      }
      throw error;
    }
  }

  /** Staff: every code, newest first, searchable by place name. */
  async adminList(query: AdminListQrQuery): Promise<Paginated<AdminQrCode>> {
    const where: Prisma.PlaceQrCodeWhereInput = {
      status: { not: 'REPLACED' },
      ...(query.q ? { place: { name: { contains: query.q } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.placeQrCode.findMany({
        where,
        select: { ...QR_SELECT, place: { select: { id: true, slug: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.placeQrCode.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({ ...toQr(row), place: row.place })),
      { ...query, total },
    );
  }

  /** Staff: stop a code from working (e.g. printed on something inappropriate). */
  async adminDisable(qrId: string, actor: AuthenticatedUser, client: ClientContext): Promise<void> {
    const current = await this.prisma.placeQrCode.findUnique({ where: { id: qrId } });
    if (!current) throw AppException.notFound('QR code not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.placeQrCode.update({
        where: { id: qrId },
        data: { status: 'DISABLED', activeKey: null },
      });
      await this.audit.record(
        {
          action: 'QR_DISABLED',
          actorId: actor.id,
          entityType: 'PlaceQrCode',
          entityId: qrId,
          metadata: { byStaff: true },
          client,
        },
        tx,
      );
    });
  }

  // ── Scanning ───────────────────────────────────────────────────────────────────────────────────

  /**
   * Where a scanned code leads. Counts the scan. Unknown tokens are 404; disabled or replaced codes
   * are 410 so the app can say "this code is no longer in use" instead of "not found".
   */
  async resolve(token: string): Promise<QrResolution> {
    const row = await this.prisma.placeQrCode.findUnique({
      where: { token },
      select: {
        id: true,
        kind: true,
        status: true,
        placeId: true,
        table: { select: { label: true, status: true } },
        place: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            businessProfile: { select: { status: true } },
            images: {
              select: { imageUrl: true },
              orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });
    if (!row) throw AppException.notFound('This is not a CampusPin code');
    const placeLive =
      row.place.status === 'ACTIVE' && row.place.businessProfile?.status === 'ACTIVE';
    const tableLive = row.kind !== 'TABLE' || row.table?.status === 'ACTIVE';
    if (row.status !== 'ACTIVE' || !placeLive || !tableLive) {
      throw new AppException(
        'QR_INACTIVE',
        'This code is no longer in use. Ask the staff for a new one.',
        410,
      );
    }
    await Promise.all([
      this.prisma.placeQrCode.update({
        where: { id: row.id },
        data: { scanCount: { increment: 1 }, lastScannedAt: new Date() },
      }),
      this.bump(row.placeId, 'qrScans'),
    ]);
    return {
      kind: row.kind,
      place: {
        id: row.place.id,
        slug: row.place.slug,
        name: row.place.name,
        coverImageUrl: row.place.images[0]?.imageUrl ?? null,
      },
      table: row.kind === 'TABLE' && row.table ? { label: row.table.label } : null,
    };
  }

  /** The table a token seats an order at, or 409 when the code cannot take orders. */
  async tableForToken(token: string, placeId: string): Promise<{ id: string; label: string }> {
    const row = await this.prisma.placeQrCode.findUnique({
      where: { token },
      select: {
        status: true,
        placeId: true,
        kind: true,
        table: { select: { id: true, label: true, status: true } },
      },
    });
    if (!row || row.placeId !== placeId || row.kind !== 'TABLE' || !row.table) {
      throw AppException.validation({ qrToken: ['This code does not belong to a table here'] });
    }
    if (row.status !== 'ACTIVE' || row.table.status !== 'ACTIVE') {
      throw new AppException(
        'QR_INACTIVE',
        'This table code is no longer in use. Ask the staff.',
        410,
      );
    }
    return { id: row.table.id, label: row.table.label };
  }

  /** Counts a view of a live place page (the app calls this when it opens one). */
  async recordView(idOrSlug: string): Promise<void> {
    const place = await this.prisma.place.findFirst({
      where: {
        ...SERVICE_PLACE_WHERE,
        ...(looksLikeUuid(idOrSlug) ? { id: idOrSlug.toLowerCase() } : { slug: idOrSlug }),
      },
      select: { id: true },
    });
    // Views of places without a business are not reported anywhere, so they are not stored.
    if (place) await this.bump(place.id, 'views');
  }

  /** +1 on today's counter; one statement, so concurrent scans never lose a count. */
  private async bump(placeId: string, column: 'views' | 'qrScans'): Promise<void> {
    const day = dayKey(istDay(new Date()));
    if (column === 'views') {
      await this.prisma
        .$executeRaw`INSERT INTO place_daily_stats (placeId, day, views, qrScans) VALUES (${placeId}, ${day}, 1, 0) ON DUPLICATE KEY UPDATE views = views + 1`;
    } else {
      await this.prisma
        .$executeRaw`INSERT INTO place_daily_stats (placeId, day, views, qrScans) VALUES (${placeId}, ${day}, 0, 1) ON DUPLICATE KEY UPDATE qrScans = qrScans + 1`;
    }
  }

  private async ownedQr(actor: AuthenticatedUser, qrId: string) {
    const businessIds = await this.access.businessIdsOf(actor);
    const row = await this.prisma.placeQrCode.findFirst({
      where: { id: qrId, place: { businessProfileId: { in: businessIds } } },
    });
    if (!row) throw AppException.notFound('QR code not found');
    return row;
  }

  private async tableList(placeId: string): Promise<PlaceTable[]> {
    const rows = await this.prisma.placeTable.findMany({
      where: { placeId },
      select: {
        id: true,
        label: true,
        status: true,
        sortOrder: true,
        qrCodes: { where: { status: 'ACTIVE' }, select: { token: true }, take: 1 },
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      active: row.status === 'ACTIVE',
      sortOrder: row.sortOrder,
      qrToken: row.qrCodes[0]?.token ?? null,
    }));
  }
}
