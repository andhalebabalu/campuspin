import { Injectable } from '@nestjs/common';
import {
  FINAL_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  type BusinessOrder,
  type CreateFoodOrderRequest,
  type ListBusinessOrdersQuery,
  type ListMyOrdersQuery,
  type Order,
  type OrderStatus,
  type PaginationQuery,
  type UpdateOrderStatusRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { istDay } from '../analytics/activity-rules.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LIVE_SERVICE_WHERE, SERVICE_PLACE_WHERE, configOf } from '../services/service-rules.js';
import { TablesQrService } from '../services/tables-qr.service.js';
import {
  type CatalogItem,
  canMove,
  nextStatuses,
  optionsOf,
  orderCode,
  priceLines,
  studentCanCancel,
} from './order-rules.js';

export const ORDER_SELECT = {
  id: true,
  code: true,
  kind: true,
  status: true,
  placeId: true,
  businessProfileId: true,
  userId: true,
  tableLabel: true,
  subtotal: true,
  discount: true,
  total: true,
  paymentMethod: true,
  note: true,
  statusReason: true,
  createdAt: true,
  updatedAt: true,
  place: { select: { id: true, slug: true, name: true } },
  user: { select: { name: true } },
  items: {
    select: { name: true, unitPrice: true, quantity: true, options: true, lineTotal: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.ServiceOrderSelect;
export type OrderRow = Prisma.ServiceOrderGetPayload<{ select: typeof ORDER_SELECT }>;

/** Student notifications for the moves they care about. */
const STUDENT_NOTICE: Partial<Record<OrderStatus, (code: string, place: string) => string>> = {
  ACCEPTED: (code, place) => `${place} accepted order ${code}.`,
  PREPARING: (code, place) => `${place} is working on order ${code}.`,
  READY: (code, place) => `Order ${code} is ready at ${place}.`,
  REJECTED: (code, place) => `${place} could not take order ${code}.`,
  CANCELLED: (code, place) => `${place} cancelled order ${code}.`,
};

const ACTIVE_WHERE = {
  status: { notIn: [...FINAL_ORDER_STATUSES] },
} satisfies Prisma.ServiceOrderWhereInput;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Orders from students to businesses (food now; print uses the same lifecycle). */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly tablesQr: TablesQrService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Students ───────────────────────────────────────────────────────────────────────────────────

  /**
   * Places a food order. Everything that costs money is worked out here from the place's own menu;
   * a retry with the same idempotency key returns the first order instead of a second one.
   */
  async createFood(
    actor: AuthenticatedUser,
    dto: CreateFoodOrderRequest,
    client: ClientContext,
  ): Promise<Order> {
    const repeat = await this.byIdempotencyKey(actor.id, dto.idempotencyKey);
    if (repeat) return repeat;

    const place = await this.prisma.place.findFirst({
      where: { id: dto.placeId, ...SERVICE_PLACE_WHERE },
      select: {
        id: true,
        name: true,
        businessProfileId: true,
        services: {
          where: { ...LIVE_SERVICE_WHERE, serviceType: { kind: 'FOOD_ORDER', status: 'ACTIVE' } },
          select: { config: true, serviceTypeId: true },
          take: 1,
        },
      },
    });
    if (!place?.businessProfileId) throw AppException.notFound('Place not found');
    const service = place.services[0];
    if (!service) {
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        `${place.name} does not take orders on CampusPin.`,
      );
    }
    const config = configOf('FOOD_ORDER', service.config) as {
      acceptingOrders: boolean;
      tableOrdering: boolean;
      pickupOrdering: boolean;
    };
    if (!config.acceptingOrders) {
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        `${place.name} has paused orders for now. Try again soon.`,
      );
    }
    const table = dto.qrToken ? await this.tablesQr.tableForToken(dto.qrToken, place.id) : null;
    if (table && !config.tableOrdering) {
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        'Ordering from the table is off here. Order at the counter.',
      );
    }
    if (!table && !config.pickupOrdering) {
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        'Scan the QR code on your table to order here.',
      );
    }
    if (dto.paymentMethod === 'CASH_AT_TABLE' && !table) {
      throw AppException.validation({ paymentMethod: ['Paying at the table needs a table'] });
    }

    const items = await this.prisma.serviceItem.findMany({
      where: {
        id: { in: dto.items.map((line) => line.itemId) },
        placeId: place.id,
        serviceTypeId: service.serviceTypeId,
      },
      select: { id: true, name: true, price: true, available: true, options: true },
    });
    const catalog = new Map<string, CatalogItem>(
      items.map((item) => [item.id, { ...item, options: optionsOf(item.options) }]),
    );
    const { lines, subtotal } = priceLines(dto.items, catalog);
    const discount = 0;
    const businessProfileId = place.businessProfileId;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const order = await this.prisma.$transaction(async (tx) => {
          const created = await tx.serviceOrder.create({
            data: {
              code: orderCode(),
              kind: 'FOOD',
              placeId: place.id,
              businessProfileId,
              userId: actor.id,
              tableId: table?.id ?? null,
              tableLabel: table?.label ?? null,
              subtotal,
              discount,
              total: subtotal - discount,
              paymentMethod: dto.paymentMethod,
              note: dto.note ?? null,
              idempotencyKey: dto.idempotencyKey,
              items: {
                create: lines.map((line) => ({
                  serviceItemId: line.serviceItemId,
                  name: line.name,
                  unitPrice: line.unitPrice,
                  quantity: line.quantity,
                  options: line.options,
                  lineTotal: line.lineTotal,
                })),
              },
            },
            select: ORDER_SELECT,
          });
          await this.audit.record(
            {
              action: 'ORDER_PLACED',
              actorId: actor.id,
              entityType: 'ServiceOrder',
              entityId: created.id,
              metadata: {
                to: 'PENDING',
                code: created.code,
                total: created.total,
                table: table?.label ?? null,
              },
              client,
            },
            tx,
          );
          return created;
        });
        await this.notifyBusiness(order, `New order ${order.code}`, this.orderSummary(order));
        return this.toOrder(order, await this.historyOf([order.id]));
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Either the same key raced in (return that order) or the random code collided (try again).
        const raced = await this.byIdempotencyKey(actor.id, dto.idempotencyKey);
        if (raced) return raced;
      }
    }
    throw new AppException('INTERNAL_ERROR', 'Could not place the order. Try again.', 500);
  }

  async myOrders(actor: AuthenticatedUser, query: ListMyOrdersQuery): Promise<Paginated<Order>> {
    const where: Prisma.ServiceOrderWhereInput = {
      userId: actor.id,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.active ? ACTIVE_WHERE : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where,
        select: ORDER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toOrder(row, new Map())),
      { ...query, total },
    );
  }

  /** Only the student's own order; anyone else's is "not found". */
  async myOrder(actor: AuthenticatedUser, id: string): Promise<Order> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, userId: actor.id },
      select: ORDER_SELECT,
    });
    if (!row) throw AppException.notFound('Order not found');
    return this.toOrder(row, await this.historyOf([row.id]));
  }

  async cancelMine(actor: AuthenticatedUser, id: string, client: ClientContext): Promise<Order> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, userId: actor.id },
      select: ORDER_SELECT,
    });
    if (!row) throw AppException.notFound('Order not found');
    if (!studentCanCancel(row.status)) {
      throw AppException.conflict(
        'STATUS_CHANGED',
        'The business already accepted this order. Ask the staff to cancel it.',
      );
    }
    const updated = await this.move(row, 'CANCELLED', 'Cancelled by the student', actor, client);
    await this.notifyBusiness(
      updated,
      `Order ${row.code} cancelled`,
      'The student cancelled it before you accepted.',
    );
    return this.toOrder(updated, await this.historyOf([id]));
  }

  // ── Business ───────────────────────────────────────────────────────────────────────────────────

  async businessOrders(
    actor: AuthenticatedUser,
    query: ListBusinessOrdersQuery,
  ): Promise<Paginated<BusinessOrder>> {
    const businessIds = await this.access.businessIdsOf(actor);
    const where: Prisma.ServiceOrderWhereInput = {
      businessProfileId: { in: businessIds },
      ...(query.placeId ? { placeId: query.placeId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope === 'active' ? ACTIVE_WHERE : {}),
      ...(query.scope === 'today' ? { createdAt: { gte: indiaDayStart() } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where,
        select: ORDER_SELECT,
        // The kitchen works oldest first; history reads newest first.
        orderBy:
          query.scope === 'active'
            ? [{ createdAt: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toBusinessOrder(row, new Map())),
      { ...query, total },
    );
  }

  async businessOrder(actor: AuthenticatedUser, id: string): Promise<BusinessOrder> {
    const row = await this.ownedByBusiness(actor, id);
    return this.toBusinessOrder(row, await this.historyOf([id]));
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateOrderStatusRequest,
    client: ClientContext,
  ): Promise<BusinessOrder> {
    const row = await this.ownedByBusiness(actor, id);
    if (!canMove(row.kind, row.status, dto.status)) {
      const labels = ORDER_STATUS_LABELS[row.kind];
      throw AppException.conflict(
        'STATUS_CHANGED',
        `An order that is "${labels[row.status]}" cannot become "${labels[dto.status]}".`,
      );
    }
    const updated = await this.move(row, dto.status, dto.reason ?? null, actor, client);
    const notice = STUDENT_NOTICE[dto.status];
    if (notice) {
      await this.notifications.notify({
        userId: row.userId,
        category: 'ORDERS',
        type: `order.${dto.status.toLowerCase()}`,
        title: `${ORDER_STATUS_LABELS[row.kind][dto.status]}: ${row.code}`,
        message: notice(row.code, row.place.name) + (dto.reason ? ` ${dto.reason}` : ''),
        link: `/orders/${row.id}`,
      });
    }
    return this.toBusinessOrder(updated, await this.historyOf([id]));
  }

  // ── Staff ──────────────────────────────────────────────────────────────────────────────────────

  async adminOrders(
    query: PaginationQuery & { status?: OrderStatus; q?: string },
  ): Promise<Paginated<BusinessOrder>> {
    const where: Prisma.ServiceOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ code: query.q.toUpperCase() }, { place: { name: { contains: query.q } } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where,
        select: ORDER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.serviceOrder.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({ ...this.toBusinessOrder(row, new Map()), nextStatuses: [] })),
      { ...query, total },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  /** Moves the order only if nobody moved it meanwhile (compare-and-set on the old status). */
  private async move(
    row: OrderRow,
    to: OrderStatus,
    reason: string | null,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<OrderRow> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.serviceOrder.updateMany({
        where: { id: row.id, status: row.status },
        data: { status: to, statusReason: reason, statusChangedAt: new Date() },
      });
      if (changed.count === 0) {
        throw AppException.conflict(
          'STATUS_CHANGED',
          'This order changed meanwhile. Refresh and try again.',
        );
      }
      await this.audit.record(
        {
          action: 'ORDER_STATUS_CHANGED',
          actorId: actor.id,
          entityType: 'ServiceOrder',
          entityId: row.id,
          metadata: { from: row.status, to, reason },
          client,
        },
        tx,
      );
      return tx.serviceOrder.findUniqueOrThrow({ where: { id: row.id }, select: ORDER_SELECT });
    });
  }

  private async ownedByBusiness(actor: AuthenticatedUser, id: string): Promise<OrderRow> {
    const businessIds = await this.access.businessIdsOf(actor);
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, businessProfileId: { in: businessIds } },
      select: ORDER_SELECT,
    });
    if (!row) throw AppException.notFound('Order not found');
    return row;
  }

  private async byIdempotencyKey(userId: string, key: string): Promise<Order | null> {
    const row = await this.prisma.serviceOrder.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      select: ORDER_SELECT,
    });
    return row ? this.toOrder(row, await this.historyOf([row.id])) : null;
  }

  /** Status timeline from the audit log (placed, then every move). */
  private async historyOf(
    ids: string[],
  ): Promise<Map<string, Array<{ status: OrderStatus; at: string }>>> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'ServiceOrder',
        entityId: { in: ids },
        action: { in: ['ORDER_PLACED', 'ORDER_STATUS_CHANGED'] },
      },
      select: { entityId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const history = new Map<string, Array<{ status: OrderStatus; at: string }>>();
    for (const row of rows) {
      const to = (row.metadata as { to?: OrderStatus } | null)?.to;
      if (!row.entityId || !to) continue;
      const list = history.get(row.entityId) ?? [];
      list.push({ status: to, at: row.createdAt.toISOString() });
      history.set(row.entityId, list);
    }
    return history;
  }

  toOrder(row: OrderRow, history: Map<string, Array<{ status: OrderStatus; at: string }>>): Order {
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      status: row.status,
      statusLabel: ORDER_STATUS_LABELS[row.kind][row.status],
      place: row.place,
      table: row.tableLabel,
      items: row.items.map((item) => ({
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        options: optionsOf(item.options),
        lineTotal: item.lineTotal,
      })),
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      paymentMethod: row.paymentMethod,
      note: row.note,
      statusReason: row.statusReason,
      print: null,
      cancellable: studentCanCancel(row.status),
      history: history.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toBusinessOrder(
    row: OrderRow,
    history: Map<string, Array<{ status: OrderStatus; at: string }>>,
  ): BusinessOrder {
    return {
      ...this.toOrder(row, history),
      student: { name: row.user.name },
      nextStatuses: [...nextStatuses(row.kind, row.status)],
    };
  }

  private orderSummary(order: OrderRow): string {
    const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
    return [
      order.tableLabel,
      `${count} ${count === 1 ? 'item' : 'items'}`,
      `₹${order.total}`,
      PAYMENT_LABELS[order.paymentMethod],
    ]
      .filter(Boolean)
      .join(' · ');
  }

  private async notifyBusiness(order: OrderRow, title: string, message: string): Promise<void> {
    const staff = await this.access.staffUserIds(order.businessProfileId);
    await this.notifications.notifyMany(staff, {
      category: 'ORDERS',
      type: 'order.business',
      title,
      message,
      link: '/dashboard?tab=orders',
    });
  }
}

/** The instant today began in India. */
export function indiaDayStart(now: Date = new Date()): Date {
  return new Date(istDay(now).getTime() - 330 * 60_000);
}
