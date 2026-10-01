import { Injectable } from '@nestjs/common';
import {
  ORDER_STATUS_LABELS,
  type BusinessCapability,
  type BusinessSummary,
  type SummaryQuery,
  type TableStatus,
} from '@platform/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { daysBefore, istDay } from '../analytics/activity-rules.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CapabilitiesService } from '../capabilities/capabilities.service.js';

const IST_MS = 330 * 60 * 1000;
const RANGE_DAYS = { today: 1, '7d': 7, '30d': 30 } as const;
const IN_PROGRESS = ['ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const;
const OPEN_ORDER = ['PENDING', ...IN_PROGRESS] as const;
const OPEN_REQUEST = [
  'NEW',
  'ACKNOWLEDGED',
  'ACCEPTED',
  'DIAGNOSING',
  'ESTIMATE_AVAILABLE',
  'APPROVED',
  'IN_PROGRESS',
  'READY',
] as const;

/**
 * The dashboard's numbers, assembled from the capabilities: a section is computed only when the
 * business can use it, so a PG never runs an order query and a mess never a booking one.
 */
@Injectable()
export class SummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async summary(actor: AuthenticatedUser, query: SummaryQuery): Promise<BusinessSummary> {
    const businessId = await this.capabilities.businessOf(actor);
    const { capabilities } = await this.capabilities.forBusiness(businessId);
    const has = (...anyOf: BusinessCapability[]) => anyOf.some((c) => capabilities.includes(c));
    const since = new Date(
      daysBefore(istDay(new Date()), RANGE_DAYS[query.range] - 1).getTime() - IST_MS,
    );
    const mine = { businessProfileId: businessId };
    const orders = has('ORDER_MANAGEMENT');

    const [
      orderGroups,
      revenue,
      paidRevenue,
      invoices,
      unpaidInvoices,
      paidOrders,
      unpaidCompleted,
      tables,
      enquiries,
      bookings,
      requests,
      recent,
    ] = await Promise.all([
      orders
        ? this.prisma.serviceOrder.groupBy({
            by: ['status'],
            where: { ...mine, createdAt: { gte: since } },
            _count: { _all: true },
          })
        : null,
      orders && has('REVENUE_ANALYTICS')
        ? this.prisma.serviceOrder.aggregate({
            where: { ...mine, status: 'COMPLETED', completedAt: { gte: since } },
            _sum: { total: true },
          })
        : null,
      orders && has('REVENUE_ANALYTICS')
        ? this.prisma.serviceOrder.aggregate({
            where: { ...mine, paymentStatus: 'PAID', paidAt: { gte: since } },
            _sum: { total: true },
          })
        : null,
      has('INVOICE')
        ? this.prisma.invoice.count({ where: { ...mine, issuedAt: { gte: since } } })
        : null,
      has('INVOICE') ? this.prisma.invoice.count({ where: { ...mine, status: 'ISSUED' } }) : null,
      orders && has('PAYMENT')
        ? this.prisma.serviceOrder.count({
            where: { ...mine, paymentStatus: 'PAID', paidAt: { gte: since } },
          })
        : null,
      orders && has('PAYMENT')
        ? this.prisma.serviceOrder.count({
            where: { ...mine, status: 'COMPLETED', paymentStatus: 'UNPAID' },
          })
        : null,
      has('TABLE_ORDER') ? this.tableRows(businessId) : null,
      has('ENQUIRY')
        ? Promise.all([
            this.prisma.lead.count({ where: { ...mine, createdAt: { gte: since } } }),
            this.prisma.lead.count({ where: { ...mine, status: 'NEW' } }),
          ])
        : null,
      has('BOOKING', 'APPOINTMENT')
        ? Promise.all([
            this.prisma.booking.count({
              where: {
                ...mine,
                startAt: { gte: new Date() },
                status: { in: ['PENDING', 'CONFIRMED'] },
              },
            }),
            this.prisma.booking.count({ where: { ...mine, status: 'PENDING' } }),
            this.prisma.booking.count({
              where: { ...mine, status: 'CONFIRMED', createdAt: { gte: since } },
            }),
            this.prisma.booking.count({
              where: { ...mine, status: 'COMPLETED', statusChangedAt: { gte: since } },
            }),
          ])
        : null,
      has('SERVICE_REQUEST')
        ? Promise.all([
            this.prisma.serviceRequest.count({
              where: { ...mine, kind: 'GENERAL', status: { in: [...OPEN_REQUEST] } },
            }),
            this.prisma.serviceRequest.count({
              where: { ...mine, kind: 'GENERAL', createdAt: { gte: since } },
            }),
          ])
        : null,
      orders
        ? this.prisma.serviceOrder.findMany({
            where: mine,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 8,
            select: {
              id: true,
              code: true,
              kind: true,
              total: true,
              status: true,
              paymentStatus: true,
              createdAt: true,
              user: { select: { name: true } },
              invoice: { select: { id: true, number: true } },
            },
          })
        : [],
    ]);

    const count = (statuses: readonly string[]) =>
      (orderGroups ?? [])
        .filter((g) => statuses.includes(g.status))
        .reduce((sum, g) => sum + g._count._all, 0);

    return {
      range: query.range,
      capabilities,
      orders: orderGroups
        ? {
            total: count(['PENDING', ...IN_PROGRESS, 'COMPLETED', 'CANCELLED', 'REJECTED']),
            pending: count(['PENDING']),
            inProgress: count(IN_PROGRESS),
            completed: count(['COMPLETED']),
            cancelled: count(['CANCELLED', 'REJECTED']),
          }
        : null,
      revenue:
        revenue && paidRevenue
          ? { completed: revenue._sum.total ?? 0, paid: paidRevenue._sum.total ?? 0 }
          : null,
      invoices:
        invoices !== null && unpaidInvoices !== null
          ? { issued: invoices, unpaid: unpaidInvoices }
          : null,
      payments:
        paidOrders !== null && unpaidCompleted !== null ? { paidOrders, unpaidCompleted } : null,
      tables: tables
        ? {
            total: tables.length,
            occupied: tables.filter((t) => t.status !== 'AVAILABLE').length,
            available: tables.filter((t) => t.status === 'AVAILABLE').length,
          }
        : null,
      enquiries: enquiries ? { total: enquiries[0], pending: enquiries[1] } : null,
      bookings: bookings
        ? {
            upcoming: bookings[0],
            pending: bookings[1],
            confirmed: bookings[2],
            completed: bookings[3],
          }
        : null,
      requests: requests ? { open: requests[0], total: requests[1] } : null,
      recentOrders: recent.map((row) => ({
        id: row.id,
        code: row.code,
        customer: row.user.name,
        total: row.total,
        status: row.status,
        statusLabel: ORDER_STATUS_LABELS[row.kind][row.status],
        paymentStatus: row.paymentStatus,
        invoice: row.invoice,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async tables(actor: AuthenticatedUser): Promise<TableStatus[]> {
    return this.tableRows(await this.capabilities.businessOf(actor));
  }

  /**
   * Every active table with what is happening at it: an order waiting to be accepted (ORDER_PENDING),
   * one being served (OCCUPIED), one completed in the last hour and not yet cleared
   * (ORDER_COMPLETED), or nothing (AVAILABLE). Derived from orders; nothing extra is stored.
   */
  private async tableRows(businessId: string): Promise<TableStatus[]> {
    const tables = await this.prisma.placeTable.findMany({
      where: { status: 'ACTIVE', place: { businessProfileId: businessId } },
      orderBy: [{ place: { name: 'asc' } }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, place: { select: { id: true, name: true } } },
    });
    if (tables.length === 0) return [];
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const orders = await this.prisma.serviceOrder.findMany({
      where: {
        tableId: { in: tables.map((t) => t.id) },
        OR: [
          { status: { in: [...OPEN_ORDER] } },
          { status: 'COMPLETED', completedAt: { gte: hourAgo } },
        ],
      } satisfies Prisma.ServiceOrderWhereInput,
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, total: true, status: true, tableId: true, kind: true },
    });
    return tables.map((table) => {
      const atTable = orders.filter((order) => order.tableId === table.id);
      const open = atTable.find((order) =>
        (OPEN_ORDER as readonly string[]).includes(order.status),
      );
      const done = atTable.find((order) => order.status === 'COMPLETED');
      const current = open ?? done;
      return {
        id: table.id,
        label: table.label,
        place: table.place,
        status: open
          ? open.status === 'PENDING'
            ? 'ORDER_PENDING'
            : 'OCCUPIED'
          : done
            ? 'ORDER_COMPLETED'
            : 'AVAILABLE',
        currentOrder: current
          ? {
              id: current.id,
              code: current.code,
              total: current.total,
              status: ORDER_STATUS_LABELS[current.kind][current.status],
            }
          : null,
      };
    });
  }
}
