import { Injectable } from '@nestjs/common';
import {
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_LABELS,
  type Invoice,
  type InvoiceSummary,
  type ListInvoicesQuery,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { daysBefore, istDay } from '../analytics/activity-rules.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CapabilitiesService } from '../capabilities/capabilities.service.js';
import { optionsOf } from '../orders/order-rules.js';
import { invoicePdf } from './invoice-pdf.js';

type Tx = Prisma.TransactionClient;
const IST_MS = 330 * 60 * 1000;
const notFound = () => AppException.notFound('Invoice not found');

const INVOICE_SELECT = {
  id: true,
  number: true,
  status: true,
  businessName: true,
  businessAddress: true,
  businessPhone: true,
  businessEmail: true,
  customerName: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  issuedAt: true,
  paidAt: true,
  order: {
    select: {
      id: true,
      code: true,
      kind: true,
      tableLabel: true,
      createdAt: true,
      completedAt: true,
      paymentMethod: true,
      paymentStatus: true,
      paidVia: true,
      items: {
        select: { name: true, quantity: true, unitPrice: true, lineTotal: true, options: true },
        orderBy: { id: 'asc' },
      },
    },
  },
} satisfies Prisma.InvoiceSelect;
type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

/** "Shree Ganesh Student Mess" → "SGS": up to three initials, letters only. */
export function invoicePrefix(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return initials || 'INV';
}

export function invoiceNumber(name: string, issuedAt: Date, sequence: number): string {
  const year = new Date(issuedAt.getTime() + IST_MS).getUTCFullYear();
  return `${invoicePrefix(name)}-${year}-${String(sequence).padStart(4, '0')}`;
}

function toInvoice(row: InvoiceRow): Invoice {
  const { order } = row;
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    business: {
      name: row.businessName,
      address: row.businessAddress,
      phone: row.businessPhone,
      email: row.businessEmail,
    },
    customer: { name: row.customerName },
    order: {
      id: order.id,
      code: order.code,
      kind: order.kind,
      table: order.tableLabel,
      placedAt: order.createdAt.toISOString(),
      completedAt: order.completedAt?.toISOString() ?? null,
    },
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      options: optionsOf(item.options).map((option) => option.name),
    })),
    subtotal: row.subtotal,
    discount: row.discount,
    tax: row.tax,
    total: row.total,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paidVia
      ? PAYMENT_CHANNEL_LABELS[order.paidVia]
      : PAYMENT_LABELS[order.paymentMethod],
    paidVia: order.paidVia,
    issuedAt: row.issuedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

/**
 * Invoices for completed orders. Issued inside the transaction that completes the order, at most
 * once per order (orderId is unique), numbered per business without gaps.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  /**
   * Issues the invoice of a just-completed order when its business has INVOICE. Idempotent: an
   * order that already has one keeps it. Must run in the completing transaction.
   */
  async issueForOrder(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        businessProfileId: true,
        userId: true,
        subtotal: true,
        discount: true,
        total: true,
        paymentStatus: true,
        paidAt: true,
        invoice: { select: { id: true } },
        user: { select: { name: true } },
        place: { select: { address: true, city: true, state: true, phone: true, email: true } },
      },
    });
    if (order.invoice) return;
    if (!(await this.capabilities.has(order.businessProfileId, ['INVOICE'], tx))) return;

    // Taking the next number locks the business row until this transaction ends.
    const business = await tx.businessProfile.update({
      where: { id: order.businessProfileId },
      data: { invoiceSeq: { increment: 1 } },
      select: { businessName: true, invoiceSeq: true, phone: true, email: true },
    });
    const issuedAt = new Date();
    const { place } = order;
    await tx.invoice.create({
      data: {
        number: invoiceNumber(business.businessName, issuedAt, business.invoiceSeq),
        businessProfileId: order.businessProfileId,
        orderId: order.id,
        userId: order.userId,
        status: order.paymentStatus === 'PAID' ? 'PAID' : 'ISSUED',
        businessName: business.businessName,
        businessAddress: [place.address, place.city, place.state]
          .filter((part) => part?.trim())
          .join(', '),
        businessPhone: business.phone ?? place.phone,
        businessEmail: business.email ?? place.email,
        customerName: order.user.name,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: 0,
        total: order.total,
        issuedAt,
        paidAt: order.paymentStatus === 'PAID' ? (order.paidAt ?? issuedAt) : null,
      },
    });
  }

  /** Keeps the invoice in step when the order is paid. */
  async markPaid(tx: Tx, orderId: string, paidAt: Date): Promise<void> {
    await tx.invoice.updateMany({
      where: { orderId, status: 'ISSUED' },
      data: { status: 'PAID', paidAt },
    });
  }

  // ── Business ───────────────────────────────────────────────────────────────────────────────────

  async businessList(
    actor: AuthenticatedUser,
    query: ListInvoicesQuery,
  ): Promise<Paginated<InvoiceSummary>> {
    const businessId = await this.capabilities.businessOf(actor);
    const where: Prisma.InvoiceWhereInput = {
      businessProfileId: businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q.toUpperCase() } },
              { order: { code: query.q.toUpperCase() } },
            ],
          }
        : {}),
      ...this.periodWhere(query),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
        select: {
          id: true,
          number: true,
          status: true,
          customerName: true,
          total: true,
          issuedAt: true,
          order: { select: { id: true, code: true, paymentStatus: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        customer: { name: row.customerName },
        total: row.total,
        paymentStatus: row.order.paymentStatus,
        issuedAt: row.issuedAt.toISOString(),
        orderId: row.order.id,
        orderCode: row.order.code,
      })),
      { ...query, total },
    );
  }

  async businessInvoice(actor: AuthenticatedUser, id: string): Promise<Invoice> {
    const businessId = await this.capabilities.businessOf(actor);
    const row = await this.prisma.invoice.findFirst({
      where: { id, businessProfileId: businessId },
      select: INVOICE_SELECT,
    });
    if (!row) throw notFound();
    return toInvoice(row);
  }

  // ── Students ───────────────────────────────────────────────────────────────────────────────────

  /** A student's own invoice (only for their own orders). */
  async myInvoice(actor: AuthenticatedUser, id: string): Promise<Invoice> {
    const row = await this.prisma.invoice.findFirst({
      where: { id, order: { userId: actor.id } },
      select: INVOICE_SELECT,
    });
    if (!row) throw notFound();
    return toInvoice(row);
  }

  pdf(invoice: Invoice): Buffer {
    return invoicePdf(
      invoice,
      `${invoice.business.name} - Invoice ${invoice.number} - Generated with CampusPin`,
    );
  }

  private periodWhere(query: ListInvoicesQuery): Prisma.InvoiceWhereInput {
    const today = istDay(new Date());
    const start = (day: Date) => new Date(day.getTime() - IST_MS);
    if (query.period === 'today') return { issuedAt: { gte: start(today) } };
    if (query.period === 'week') return { issuedAt: { gte: start(daysBefore(today, 6)) } };
    if (query.period === 'month') return { issuedAt: { gte: start(daysBefore(today, 29)) } };
    if (query.period === 'custom' && (query.from || query.to)) {
      return {
        issuedAt: {
          ...(query.from ? { gte: start(new Date(`${query.from}T00:00:00Z`)) } : {}),
          ...(query.to
            ? { lt: new Date(start(new Date(`${query.to}T00:00:00Z`)).getTime() + 86_400_000) }
            : {}),
        },
      };
    }
    return {};
  }
}
