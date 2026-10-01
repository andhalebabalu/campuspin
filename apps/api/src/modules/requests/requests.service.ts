import { Injectable } from '@nestjs/common';
import {
  DEFAULT_TABLE_REQUESTS,
  FINAL_REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  type BusinessServiceRequest,
  type CreateServiceRequest,
  type ListBusinessRequestsQuery,
  type ListMyRequestsQuery,
  type OwnerTableRequestType,
  type PaginationQuery,
  type RequestStatus,
  type SaveTableRequestTypeRequest,
  type ServiceRequest,
  type UpdateRequestStatusRequest,
  type UpdateTableRequestTypeRequest,
} from '@platform/contracts';
import { CapabilitiesService, capabilityRequired } from '../capabilities/capabilities.service.js';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { indiaDayStart } from '../orders/orders.service.js';
import { shortCode } from '../orders/order-rules.js';
import { LIVE_SERVICE_WHERE, SERVICE_PLACE_WHERE, configOf } from '../services/service-rules.js';
import { TablesQrService } from '../services/tables-qr.service.js';
import { DocumentsService } from '../uploads/documents.service.js';
import {
  businessCanMove,
  businessMoves,
  isOpenTableStatus,
  studentCanApprove,
  studentCanCancel,
} from './request-rules.js';

const REQUEST_SELECT = {
  id: true,
  code: true,
  kind: true,
  status: true,
  userId: true,
  businessProfileId: true,
  tableLabel: true,
  label: true,
  description: true,
  imageKey: true,
  preferredAt: true,
  estimateAmount: true,
  estimateNote: true,
  statusReason: true,
  createdAt: true,
  updatedAt: true,
  place: { select: { id: true, slug: true, name: true } },
  serviceType: { select: { key: true, name: true } },
  user: { select: { name: true } },
} satisfies Prisma.ServiceRequestSelect;
export type RequestRow = Prisma.ServiceRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

type History = Map<string, Array<{ status: RequestStatus; at: string }>>;

const ACTIVE_WHERE = {
  status: { notIn: [...FINAL_REQUEST_STATUSES] },
} satisfies Prisma.ServiceRequestWhereInput;

const TYPE_SELECT = {
  id: true,
  label: true,
  icon: true,
  status: true,
  sortOrder: true,
} satisfies Prisma.TableRequestTypeSelect;
const toType = (
  row: Prisma.TableRequestTypeGetPayload<{ select: typeof TYPE_SELECT }>,
): OwnerTableRequestType => ({
  id: row.id,
  label: row.label,
  icon: row.icon,
  active: row.status === 'ACTIVE',
  sortOrder: row.sortOrder,
});

/** What the student hears about a job, per new status. */
const STUDENT_NOTICE: Partial<Record<RequestStatus, string>> = {
  ACCEPTED: 'accepted your request',
  ESTIMATE_AVAILABLE: 'sent an estimate. Approve it to start the work',
  IN_PROGRESS: 'started on your request',
  READY: 'finished: your request is ready',
  REJECTED: 'could not take your request',
  CANCELLED: 'cancelled your request',
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Requests from students to businesses. Table requests ("Water for Table 07") are quick and
 * de-duplicated while open; jobs (repair, laundry) may go through an estimate the student approves.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly capabilities: CapabilitiesService,
    private readonly tablesQr: TablesQrService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  // ── Table request types (owner) ────────────────────────────────────────────────────────────────

  /** The place's table requests; the usual ones are created the first time. */
  async requestTypes(actor: AuthenticatedUser, placeId: string): Promise<OwnerTableRequestType[]> {
    const place = await this.access.placeOf(actor, placeId);
    const count = await this.prisma.tableRequestType.count({ where: { placeId: place.id } });
    if (count === 0) {
      await this.prisma.tableRequestType.createMany({
        data: DEFAULT_TABLE_REQUESTS.map((type, index) => ({
          placeId: place.id,
          label: type.label,
          icon: type.icon,
          sortOrder: index,
        })),
      });
    }
    const rows = await this.prisma.tableRequestType.findMany({
      where: { placeId: place.id },
      select: TYPE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toType);
  }

  async addRequestType(
    actor: AuthenticatedUser,
    placeId: string,
    dto: SaveTableRequestTypeRequest,
    client: ClientContext,
  ): Promise<OwnerTableRequestType[]> {
    const place = await this.access.placeOf(actor, placeId);
    if ((await this.prisma.tableRequestType.count({ where: { placeId: place.id } })) >= 20) {
      throw AppException.validation({ label: ['A place can offer at most 20 table requests'] });
    }
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.tableRequestType.create({
        data: {
          placeId: place.id,
          label: dto.label,
          icon: dto.icon ?? null,
          status: dto.active ? 'ACTIVE' : 'INACTIVE',
          sortOrder: dto.sortOrder,
        },
      });
      await this.audit.record(
        {
          action: 'TABLE_REQUEST_TYPE_SAVED',
          actorId: actor.id,
          entityType: 'TableRequestType',
          entityId: created.id,
          metadata: { label: dto.label },
          client,
        },
        tx,
      );
    });
    return this.requestTypes(actor, placeId);
  }

  async updateRequestType(
    actor: AuthenticatedUser,
    placeId: string,
    typeId: string,
    dto: UpdateTableRequestTypeRequest,
    client: ClientContext,
  ): Promise<OwnerTableRequestType[]> {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.prisma.tableRequestType.findFirst({
      where: { id: typeId, placeId: place.id },
    });
    if (!current) throw AppException.notFound('Request not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.tableRequestType.update({
        where: { id: typeId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.active !== undefined ? { status: dto.active ? 'ACTIVE' : 'INACTIVE' } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await this.audit.record(
        {
          action: 'TABLE_REQUEST_TYPE_SAVED',
          actorId: actor.id,
          entityType: 'TableRequestType',
          entityId: typeId,
          metadata: { fields: Object.keys(dto) },
          client,
        },
        tx,
      );
    });
    return this.requestTypes(actor, placeId);
  }

  async deleteRequestType(
    actor: AuthenticatedUser,
    placeId: string,
    typeId: string,
    client: ClientContext,
  ) {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.prisma.tableRequestType.findFirst({
      where: { id: typeId, placeId: place.id },
    });
    if (!current) throw AppException.notFound('Request not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.tableRequestType.delete({ where: { id: typeId } });
      await this.audit.record(
        {
          action: 'TABLE_REQUEST_TYPE_DELETED',
          actorId: actor.id,
          entityType: 'TableRequestType',
          entityId: typeId,
          metadata: { label: current.label },
          client,
        },
        tx,
      );
    });
    return this.requestTypes(actor, placeId);
  }

  // ── Students ───────────────────────────────────────────────────────────────────────────────────

  async create(
    actor: AuthenticatedUser,
    dto: CreateServiceRequest,
    client: ClientContext,
  ): Promise<ServiceRequest> {
    const repeat = await this.byIdempotencyKey(actor.id, dto.idempotencyKey);
    if (repeat) return repeat;
    return dto.kind === 'TABLE'
      ? this.createTable(actor, dto, client)
      : this.createGeneral(actor, dto, client);
  }

  async mine(
    actor: AuthenticatedUser,
    query: ListMyRequestsQuery,
  ): Promise<Paginated<ServiceRequest>> {
    const where: Prisma.ServiceRequestWhereInput = {
      userId: actor.id,
      ...(query.active ? ACTIVE_WHERE : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        select: REQUEST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toRequest(row, new Map())),
      { ...query, total },
    );
  }

  async myRequest(actor: AuthenticatedUser, id: string): Promise<ServiceRequest> {
    const row = await this.prisma.serviceRequest.findFirst({
      where: { id, userId: actor.id },
      select: REQUEST_SELECT,
    });
    if (!row) throw AppException.notFound('Request not found');
    return this.toRequest(row, await this.historyOf([id]));
  }

  async cancelMine(
    actor: AuthenticatedUser,
    id: string,
    client: ClientContext,
  ): Promise<ServiceRequest> {
    const row = await this.prisma.serviceRequest.findFirst({
      where: { id, userId: actor.id },
      select: REQUEST_SELECT,
    });
    if (!row) throw AppException.notFound('Request not found');
    if (!studentCanCancel(row.kind, row.status)) {
      throw AppException.conflict(
        'STATUS_CHANGED',
        'Work has started on this request. Talk to the business to stop it.',
      );
    }
    const updated = await this.move(
      row,
      'CANCELLED',
      { reason: 'Cancelled by the student' },
      actor,
      client,
    );
    await this.notifyBusiness(
      updated,
      `${row.code} cancelled`,
      `${row.label}: the student cancelled it.`,
    );
    return this.toRequest(updated, await this.historyOf([id]));
  }

  /** The student agrees to the business's estimate; work can start. */
  async approveEstimate(
    actor: AuthenticatedUser,
    id: string,
    client: ClientContext,
  ): Promise<ServiceRequest> {
    const row = await this.prisma.serviceRequest.findFirst({
      where: { id, userId: actor.id },
      select: REQUEST_SELECT,
    });
    if (!row) throw AppException.notFound('Request not found');
    if (!studentCanApprove(row.status))
      throw AppException.conflict('STATUS_CHANGED', 'There is no estimate waiting for you.');
    const updated = await this.move(row, 'APPROVED', {}, actor, client);
    await this.notifyBusiness(
      updated,
      `${row.code}: estimate approved`,
      `Go ahead with ${row.label} for ₹${row.estimateAmount ?? 0}.`,
    );
    return this.toRequest(updated, await this.historyOf([id]));
  }

  // ── Business ───────────────────────────────────────────────────────────────────────────────────

  async businessList(
    actor: AuthenticatedUser,
    query: ListBusinessRequestsQuery,
  ): Promise<Paginated<BusinessServiceRequest>> {
    const businessIds = await this.access.businessIdsOf(actor);
    const kinds = await this.handledKinds(actor);
    const where: Prisma.ServiceRequestWhereInput = {
      businessProfileId: { in: businessIds },
      ...(query.placeId ? { placeId: query.placeId } : {}),
      kind: query.kind ? (kinds.includes(query.kind) ? query.kind : { in: [] }) : { in: kinds },
      ...(query.scope === 'active' ? ACTIVE_WHERE : {}),
      ...(query.scope === 'today' ? { createdAt: { gte: indiaDayStart() } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        select: REQUEST_SELECT,
        orderBy:
          query.scope === 'active'
            ? [{ createdAt: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toBusiness(row, new Map())),
      { ...query, total },
    );
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateRequestStatusRequest,
    client: ClientContext,
  ): Promise<BusinessServiceRequest> {
    const businessIds = await this.access.businessIdsOf(actor);
    const row = await this.prisma.serviceRequest.findFirst({
      where: { id, businessProfileId: { in: businessIds } },
      select: REQUEST_SELECT,
    });
    if (!row) throw AppException.notFound('Request not found');
    if (!(await this.handledKinds(actor)).includes(row.kind)) {
      throw capabilityRequired(row.kind === 'TABLE' ? ['TABLE_ORDER'] : ['SERVICE_REQUEST']);
    }
    if (!businessCanMove(row.kind, row.status, dto.status)) {
      throw AppException.conflict(
        'STATUS_CHANGED',
        `A request that is "${REQUEST_STATUS_LABELS[row.status]}" cannot become "${REQUEST_STATUS_LABELS[dto.status]}".`,
      );
    }
    const updated = await this.move(row, dto.status, dto, actor, client);
    const notice = STUDENT_NOTICE[dto.status];
    if (row.kind === 'GENERAL' && notice) {
      await this.notifications.notify({
        userId: row.userId,
        category: 'ORDERS',
        type: `request.${dto.status.toLowerCase()}`,
        title: `${REQUEST_STATUS_LABELS[dto.status]}: ${row.label}`,
        message:
          `${row.place.name} ${notice}.` +
          (dto.status === 'ESTIMATE_AVAILABLE' ? ` Estimate: ₹${dto.estimateAmount}.` : '') +
          (dto.reason ? ` ${dto.reason}` : ''),
        link: `/requests/${row.id}`,
      });
    }
    return this.toBusiness(updated, await this.historyOf([id]));
  }

  /** Table requests need TABLE_ORDER; jobs (repair, laundry) need SERVICE_REQUEST. */
  private async handledKinds(actor: AuthenticatedUser): Promise<Array<'TABLE' | 'GENERAL'>> {
    const { capabilities } = await this.capabilities.forBusiness(
      await this.capabilities.businessOf(actor),
    );
    return [
      ...(capabilities.includes('TABLE_ORDER') ? (['TABLE'] as const) : []),
      ...(capabilities.includes('SERVICE_REQUEST') ? (['GENERAL'] as const) : []),
    ];
  }

  // ── Staff ──────────────────────────────────────────────────────────────────────────────────────

  async adminList(
    query: PaginationQuery & { q?: string },
  ): Promise<Paginated<BusinessServiceRequest>> {
    const where: Prisma.ServiceRequestWhereInput = query.q
      ? { OR: [{ code: query.q.toUpperCase() }, { place: { name: { contains: query.q } } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        select: REQUEST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({ ...this.toBusiness(row, new Map()), nextStatuses: [] })),
      { ...query, total },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async createTable(
    actor: AuthenticatedUser,
    dto: Extract<CreateServiceRequest, { kind: 'TABLE' }>,
    client: ClientContext,
  ): Promise<ServiceRequest> {
    const table = await this.tablesQr.tableOfToken(dto.qrToken);
    const place = await this.prisma.place.findFirst({
      where: { id: table.placeId, ...SERVICE_PLACE_WHERE },
      select: {
        id: true,
        name: true,
        businessProfileId: true,
        services: {
          where: {
            ...LIVE_SERVICE_WHERE,
            serviceType: { kind: 'TABLE_SERVICE', status: 'ACTIVE' },
          },
          select: { serviceTypeId: true },
          take: 1,
        },
      },
    });
    if (!place?.businessProfileId) throw AppException.notFound('Place not found');
    const service = place.services[0];
    if (!service)
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        `${place.name} does not take table requests on CampusPin.`,
      );
    const type = await this.prisma.tableRequestType.findFirst({
      where: { id: dto.requestTypeId, placeId: place.id, status: 'ACTIVE' },
      select: { id: true, label: true },
    });
    if (!type)
      throw AppException.validation({ requestTypeId: ['This request is not offered here'] });

    const activeKey = `${actor.id}:${table.id}:${type.id}`;
    const open = await this.prisma.serviceRequest.findUnique({
      where: { activeKey },
      select: REQUEST_SELECT,
    });
    if (open) return this.toRequest(open, await this.historyOf([open.id]));

    const row = await this.insert(
      {
        kind: 'TABLE',
        placeId: place.id,
        businessProfileId: place.businessProfileId,
        userId: actor.id,
        serviceTypeId: service.serviceTypeId,
        tableId: table.id,
        tableLabel: table.label,
        requestTypeId: type.id,
        label: type.label,
        activeKey,
        idempotencyKey: dto.idempotencyKey,
      },
      actor,
      client,
    );
    await this.notifyBusiness(
      row,
      `${table.label}: ${type.label}`,
      `${row.user.name} asked from ${table.label}.`,
    );
    return this.toRequest(row, await this.historyOf([row.id]));
  }

  private async createGeneral(
    actor: AuthenticatedUser,
    dto: Extract<CreateServiceRequest, { kind: 'GENERAL' }>,
    client: ClientContext,
  ): Promise<ServiceRequest> {
    const place = await this.prisma.place.findFirst({
      where: { id: dto.placeId, ...SERVICE_PLACE_WHERE },
      select: {
        id: true,
        name: true,
        businessProfileId: true,
        services: {
          where: {
            ...LIVE_SERVICE_WHERE,
            serviceType: { key: dto.serviceKey, kind: 'SERVICE_REQUEST', status: 'ACTIVE' },
          },
          select: { serviceTypeId: true, config: true, serviceType: { select: { name: true } } },
          take: 1,
        },
      },
    });
    if (!place?.businessProfileId) throw AppException.notFound('Place not found');
    const service = place.services[0];
    if (!service)
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        `${place.name} does not take this request on CampusPin.`,
      );
    const config = configOf('SERVICE_REQUEST', service.config) as {
      acceptingRequests: boolean;
      photosAllowed: boolean;
    };
    if (!config.acceptingRequests) {
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        `${place.name} is not taking new requests right now.`,
      );
    }
    let label = service.serviceType.name;
    if (dto.itemId) {
      const item = await this.prisma.serviceItem.findFirst({
        where: {
          id: dto.itemId,
          placeId: place.id,
          serviceTypeId: service.serviceTypeId,
          available: true,
        },
        select: { name: true },
      });
      if (!item)
        throw AppException.validation({ itemId: ['Choose one of the services listed here'] });
      label = item.name;
    }
    if (dto.imageId && !config.photosAllowed) {
      throw AppException.validation({
        imageId: [`${place.name} does not take photos with requests`],
      });
    }
    const row = await this.insert(
      {
        kind: 'GENERAL',
        placeId: place.id,
        businessProfileId: place.businessProfileId,
        userId: actor.id,
        serviceTypeId: service.serviceTypeId,
        serviceItemId: dto.itemId ?? null,
        label,
        description: dto.description,
        preferredAt: dto.preferredAt ? new Date(dto.preferredAt) : null,
        idempotencyKey: dto.idempotencyKey,
      },
      actor,
      client,
      dto.imageId,
    );
    await this.notifyBusiness(
      row,
      `New request ${row.code}: ${label}`,
      dto.description.slice(0, 140),
    );
    return this.toRequest(row, await this.historyOf([row.id]));
  }

  /** The student's photo of a problem (a private document), or a 404 for anyone else. */
  async myPhoto(actor: AuthenticatedUser, id: string, client: ClientContext) {
    const row = await this.prisma.serviceRequest.findFirst({
      where: { id, userId: actor.id },
      select: { imageKey: true },
    });
    if (!row?.imageKey) throw AppException.notFound('No photo for this request');
    return this.documents.read(row.imageKey, actor, client);
  }

  /** A request's photo, only for the business it was sent to. */
  async businessPhoto(actor: AuthenticatedUser, id: string, client: ClientContext) {
    const businessIds = await this.access.businessIdsOf(actor);
    const row = await this.prisma.serviceRequest.findFirst({
      where: { id, businessProfileId: { in: businessIds } },
      select: { imageKey: true },
    });
    if (!row?.imageKey) throw AppException.notFound('No photo for this request');
    return this.documents.read(row.imageKey, actor, client);
  }

  /** Writes the request; an attached photo is claimed in the same transaction (its id is kept in imageKey). */
  private async insert(
    data: Omit<Prisma.ServiceRequestUncheckedCreateInput, 'code'>,
    actor: AuthenticatedUser,
    client: ClientContext,
    imageId?: string,
  ): Promise<RequestRow> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const photo = imageId
            ? await this.documents.claim(tx, actor.id, imageId, 'REQUEST_PHOTO')
            : null;
          const created = await tx.serviceRequest.create({
            data: { ...data, imageKey: photo?.id ?? null, code: shortCode(6, 'RQ') },
            select: REQUEST_SELECT,
          });
          await this.audit.record(
            {
              action: 'SERVICE_REQUEST_CREATED',
              actorId: actor.id,
              entityType: 'ServiceRequest',
              entityId: created.id,
              metadata: { to: 'NEW', code: created.code, label: created.label },
              client,
            },
            tx,
          );
          return created;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // The same tap raced in, or the same open table request exists: return that one.
        const existing = await this.prisma.serviceRequest.findFirst({
          where: {
            OR: [
              { userId: actor.id, idempotencyKey: data.idempotencyKey },
              ...(data.activeKey ? [{ activeKey: data.activeKey }] : []),
            ],
          },
          select: REQUEST_SELECT,
        });
        if (existing) return existing;
      }
    }
    throw new AppException('INTERNAL_ERROR', 'Could not send the request. Try again.', 500);
  }

  /** Compare-and-set on the old status, so two staff tapping at once cannot both move it. */
  private async move(
    row: RequestRow,
    to: RequestStatus,
    extra: { reason?: string; estimateAmount?: number; estimateNote?: string },
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<RequestRow> {
    return this.prisma
      .$transaction(async (tx) => {
        const changed = await tx.serviceRequest.updateMany({
          where: { id: row.id, status: row.status },
          data: {
            status: to,
            statusChangedAt: new Date(),
            statusReason: extra.reason ?? null,
            ...(to === 'ESTIMATE_AVAILABLE'
              ? {
                  estimateAmount: extra.estimateAmount ?? null,
                  estimateNote: extra.estimateNote ?? null,
                }
              : {}),
            // A handled table request no longer blocks asking again.
            ...(isOpenTableStatus(to) ? {} : { activeKey: null }),
          },
        });
        if (changed.count === 0)
          throw AppException.conflict(
            'STATUS_CHANGED',
            'This request changed meanwhile. Refresh and try again.',
          );
        await this.audit.record(
          {
            action: 'SERVICE_REQUEST_STATUS_CHANGED',
            actorId: actor.id,
            entityType: 'ServiceRequest',
            entityId: row.id,
            metadata: {
              from: row.status,
              to,
              reason: extra.reason ?? null,
              estimate: extra.estimateAmount ?? null,
            },
            client,
          },
          tx,
        );
        return tx.serviceRequest.findUniqueOrThrow({
          where: { id: row.id },
          select: REQUEST_SELECT,
        });
      })
      .then(async (updated) => {
        // The photo is only needed while the job is open: delete it once finished.
        if (FINAL_REQUEST_STATUSES.includes(to)) await this.documents.discard(updated.imageKey);
        return updated;
      });
  }

  private async byIdempotencyKey(userId: string, key: string): Promise<ServiceRequest | null> {
    const row = await this.prisma.serviceRequest.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      select: REQUEST_SELECT,
    });
    return row ? this.toRequest(row, await this.historyOf([row.id])) : null;
  }

  private async historyOf(ids: string[]): Promise<History> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'ServiceRequest',
        entityId: { in: ids },
        action: { in: ['SERVICE_REQUEST_CREATED', 'SERVICE_REQUEST_STATUS_CHANGED'] },
      },
      select: { entityId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const history: History = new Map();
    for (const row of rows) {
      const to = (row.metadata as { to?: RequestStatus } | null)?.to;
      if (!row.entityId || !to) continue;
      history.set(row.entityId, [
        ...(history.get(row.entityId) ?? []),
        { status: to, at: row.createdAt.toISOString() },
      ]);
    }
    return history;
  }

  toRequest(row: RequestRow, history: History): ServiceRequest {
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      status: row.status,
      statusLabel: REQUEST_STATUS_LABELS[row.status],
      service: row.serviceType,
      place: row.place,
      table: row.tableLabel,
      label: row.label,
      description: row.description,
      hasImage: row.imageKey !== null,
      preferredAt: row.preferredAt?.toISOString() ?? null,
      estimateAmount: row.estimateAmount,
      estimateNote: row.estimateNote,
      statusReason: row.statusReason,
      canCancel: studentCanCancel(row.kind, row.status),
      canApprove: studentCanApprove(row.status),
      history: history.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toBusiness(row: RequestRow, history: History): BusinessServiceRequest {
    return {
      ...this.toRequest(row, history),
      student: { name: row.user.name },
      nextStatuses: [...businessMoves(row.kind, row.status)],
    };
  }

  private async notifyBusiness(row: RequestRow, title: string, message: string): Promise<void> {
    const staff = await this.access.staffUserIds(row.businessProfileId);
    await this.notifications.notifyMany(staff, {
      category: 'ORDERS',
      type: 'request.business',
      title,
      message,
      link: '/dashboard?tab=requests',
    });
  }
}
