import { Injectable } from '@nestjs/common';
import {
  BOOKING_DAYS_AHEAD,
  BOOKING_STATUS_LABELS,
  type Availability,
  type AvailabilityQuery,
  type Booking,
  type BookingConfig,
  type BookingStatus,
  type BusinessBooking,
  type CreateBookingRequest,
  type ListBusinessBookingsQuery,
  type ListMyBookingsQuery,
  type PaginationQuery,
  type SaveScheduleRequest,
  type ScheduleWindow,
  type UpdateBookingStatusRequest,
  looksLikeUuid,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { dayKey, daysBefore, istDay } from '../analytics/activity-rules.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { shortCode } from '../orders/order-rules.js';
import {
  LIVE_SERVICE_WHERE,
  SERVICE_PLACE_WHERE,
  configOf,
  dateFromKey,
} from '../services/service-rules.js';
import {
  bookingMoves,
  isLive,
  isoWeekday,
  slotKeyOf,
  slotsFor,
  studentCanCancel,
  studentKeyOf,
} from './booking-rules.js';

const BOOKING_SELECT = {
  id: true,
  code: true,
  status: true,
  userId: true,
  businessProfileId: true,
  serviceItemId: true,
  itemName: true,
  date: true,
  startAt: true,
  endAt: true,
  seatNo: true,
  price: true,
  note: true,
  statusReason: true,
  createdAt: true,
  place: { select: { id: true, slug: true, name: true } },
  serviceType: { select: { key: true, name: true } },
  serviceItem: { select: { durationMinutes: true } },
  user: { select: { name: true } },
} satisfies Prisma.BookingSelect;
type BookingRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** A bookable item with everything needed to work out its slots. */
interface BookableItem {
  id: string;
  name: string;
  price: number;
  durationMinutes: number | null;
  capacity: number;
  placeId: string;
  businessProfileId: string;
  placeName: string;
  serviceTypeId: string;
  config: BookingConfig;
}

/**
 * Bookings for any bookable service (salon, clinic, study seat, court). The owner sets weekly
 * windows; items carry a slot length (or a whole day) and seats per slot. The server lays out the
 * slots, and a unique key per (item, start, seat) makes double-booking impossible.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Owner ──────────────────────────────────────────────────────────────────────────────────────

  async schedule(
    actor: AuthenticatedUser,
    placeId: string,
    key: string,
  ): Promise<ScheduleWindow[]> {
    const place = await this.access.placeOf(actor, placeId);
    const type = await this.bookingType(key);
    const rows = await this.prisma.bookingSchedule.findMany({
      where: { placeId: place.id, serviceTypeId: type.id },
      select: { dayOfWeek: true, openTime: true, closeTime: true },
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });
    return rows;
  }

  async saveSchedule(
    actor: AuthenticatedUser,
    placeId: string,
    key: string,
    dto: SaveScheduleRequest,
    client: ClientContext,
  ): Promise<ScheduleWindow[]> {
    const place = await this.access.placeOf(actor, placeId);
    const type = await this.bookingType(key);
    // Overlapping windows on one day would make overlapping slots.
    for (const day of new Set(dto.windows.map((w) => w.dayOfWeek))) {
      const list = dto.windows
        .filter((w) => w.dayOfWeek === day)
        .sort((a, b) => a.openTime.localeCompare(b.openTime));
      for (let i = 1; i < list.length; i += 1) {
        if (list[i]!.openTime < list[i - 1]!.closeTime) {
          throw AppException.validation({
            windows: ['Opening windows on the same day must not overlap'],
          });
        }
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSchedule.deleteMany({ where: { placeId: place.id, serviceTypeId: type.id } });
      await tx.bookingSchedule.createMany({
        data: dto.windows.map((w) => ({ placeId: place.id, serviceTypeId: type.id, ...w })),
      });
      await this.audit.record(
        {
          action: 'BOOKING_SCHEDULE_SAVED',
          actorId: actor.id,
          entityType: 'Place',
          entityId: place.id,
          metadata: { service: key, windows: dto.windows.length },
          client,
        },
        tx,
      );
    });
    return this.schedule(actor, placeId, key);
  }

  async businessList(
    actor: AuthenticatedUser,
    query: ListBusinessBookingsQuery,
  ): Promise<Paginated<BusinessBooking>> {
    const businessIds = await this.access.businessIdsOf(actor);
    const today = istDay(new Date());
    const where: Prisma.BookingWhereInput = {
      businessProfileId: { in: businessIds },
      ...(query.placeId ? { placeId: query.placeId } : {}),
      ...(query.scope === 'upcoming'
        ? { status: { in: ['PENDING', 'CONFIRMED'] }, endAt: { gte: new Date() } }
        : {}),
      ...(query.scope === 'today' ? { date: today } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        select: BOOKING_SELECT,
        orderBy: query.scope === 'all' ? [{ startAt: 'desc' }] : [{ startAt: 'asc' }],
        ...pageWindow(query),
      }),
      this.prisma.booking.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toBusiness(row)),
      { ...query, total },
    );
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateBookingStatusRequest,
    client: ClientContext,
  ): Promise<BusinessBooking> {
    const businessIds = await this.access.businessIdsOf(actor);
    const row = await this.prisma.booking.findFirst({
      where: { id, businessProfileId: { in: businessIds } },
      select: BOOKING_SELECT,
    });
    if (!row) throw AppException.notFound('Booking not found');
    if (!bookingMoves(row.status).includes(dto.status)) {
      throw AppException.conflict(
        'STATUS_CHANGED',
        `A booking that is "${BOOKING_STATUS_LABELS[row.status]}" cannot become "${BOOKING_STATUS_LABELS[dto.status]}".`,
      );
    }
    const updated = await this.move(row, dto.status, dto.reason ?? null, actor, client);
    if (dto.status === 'CONFIRMED' || dto.status === 'CANCELLED') {
      await this.notifications.notify({
        userId: row.userId,
        category: 'ORDERS',
        type: `booking.${dto.status.toLowerCase()}`,
        title:
          dto.status === 'CONFIRMED'
            ? `Booking confirmed: ${row.itemName}`
            : `Booking cancelled: ${row.itemName}`,
        message: `${row.place.name}, ${this.when(row)}.${dto.reason ? ` ${dto.reason}` : ''}`,
        link: '/orders',
      });
    }
    return this.toBusiness(updated);
  }

  // ── Students ───────────────────────────────────────────────────────────────────────────────────

  /** Free seats per slot of one item on one India day. */
  async availability(idOrSlug: string, query: AvailabilityQuery): Promise<Availability> {
    const item = await this.bookable(query.item, idOrSlug);
    const day = dateFromKey(query.date);
    this.assertBookableDay(day);
    const slots = await this.slotsOf(item, day);
    const taken = await this.prisma.booking.groupBy({
      by: ['startAt'],
      where: { serviceItemId: item.id, status: { in: ['PENDING', 'CONFIRMED'] }, date: day },
      _count: { _all: true },
    });
    const count = new Map(taken.map((row) => [row.startAt.getTime(), row._count._all]));
    return {
      date: query.date,
      item: {
        id: item.id,
        name: item.name,
        price: item.price,
        durationMinutes: item.durationMinutes,
        capacity: item.capacity,
      },
      slots: slots.map((slot) => ({
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        remaining: Math.max(0, item.capacity - (count.get(slot.startAt.getTime()) ?? 0)),
      })),
    };
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateBookingRequest,
    client: ClientContext,
  ): Promise<Booking> {
    const repeat = await this.prisma.booking.findUnique({
      where: { userId_idempotencyKey: { userId: actor.id, idempotencyKey: dto.idempotencyKey } },
      select: BOOKING_SELECT,
    });
    if (repeat) return this.toBooking(repeat);

    const item = await this.bookable(dto.itemId);
    if (!item.config.bookingEnabled) {
      throw AppException.conflict(
        'SERVICE_UNAVAILABLE_NOW',
        `${item.placeName} takes bookings in person, not on CampusPin.`,
      );
    }
    const startAt = new Date(dto.startAt);
    const day = istDay(startAt);
    this.assertBookableDay(day);
    const slot = (await this.slotsOf(item, day)).find(
      (candidate) => candidate.startAt.getTime() === startAt.getTime(),
    );
    if (!slot) throw AppException.validation({ startAt: ['Choose one of the available times'] });

    const studentKey = studentKeyOf(actor.id, item.id, startAt);
    if (await this.prisma.booking.findUnique({ where: { studentKey }, select: { id: true } })) {
      throw AppException.conflict('CONFLICT', 'You already booked this time.');
    }
    const status: BookingStatus = item.config.autoConfirm ? 'CONFIRMED' : 'PENDING';
    // Try each seat; the unique slot key makes a seat that was just taken fail, so try the next.
    for (let seat = 1; seat <= item.capacity; seat += 1) {
      try {
        const row = await this.prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              code: shortCode(6, 'BK'),
              placeId: item.placeId,
              businessProfileId: item.businessProfileId,
              userId: actor.id,
              serviceTypeId: item.serviceTypeId,
              serviceItemId: item.id,
              itemName: item.name,
              date: day,
              startAt: slot.startAt,
              endAt: slot.endAt,
              seatNo: seat,
              price: item.price,
              status,
              note: dto.note ?? null,
              slotKey: slotKeyOf(item.id, slot.startAt, seat),
              studentKey,
              idempotencyKey: dto.idempotencyKey,
            },
            select: BOOKING_SELECT,
          });
          await this.audit.record(
            {
              action: 'BOOKING_CREATED',
              actorId: actor.id,
              entityType: 'Booking',
              entityId: created.id,
              metadata: { to: status, item: item.name, startAt: slot.startAt.toISOString(), seat },
              client,
            },
            tx,
          );
          return created;
        });
        const staff = await this.access.staffUserIds(item.businessProfileId);
        await this.notifications.notifyMany(staff, {
          category: 'ORDERS',
          type: 'booking.business',
          title: `New booking ${row.code}: ${item.name}`,
          message: `${row.user.name}, ${this.when(row)}${status === 'PENDING' ? '. Confirm it on your dashboard.' : '.'}`,
          link: '/dashboard?tab=bookings',
        });
        return this.toBooking(row);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const mine = await this.prisma.booking.findFirst({
          where: { OR: [{ studentKey }, { userId: actor.id, idempotencyKey: dto.idempotencyKey }] },
          select: BOOKING_SELECT,
        });
        if (mine) return this.toBooking(mine);
        // That seat went to someone else a moment ago: try the next one.
      }
    }
    throw AppException.conflict('SLOT_FULL', 'That time is fully booked. Choose another.');
  }

  async mine(actor: AuthenticatedUser, query: ListMyBookingsQuery): Promise<Paginated<Booking>> {
    const where: Prisma.BookingWhereInput = {
      userId: actor.id,
      ...(query.upcoming
        ? { status: { in: ['PENDING', 'CONFIRMED'] }, endAt: { gte: new Date() } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        select: BOOKING_SELECT,
        orderBy: query.upcoming ? [{ startAt: 'asc' }] : [{ startAt: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.booking.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toBooking(row)),
      { ...query, total },
    );
  }

  async cancelMine(actor: AuthenticatedUser, id: string, client: ClientContext): Promise<Booking> {
    const row = await this.prisma.booking.findFirst({
      where: { id, userId: actor.id },
      select: BOOKING_SELECT,
    });
    if (!row) throw AppException.notFound('Booking not found');
    if (!studentCanCancel(row.status, row.startAt, new Date())) {
      throw AppException.conflict('STATUS_CHANGED', 'This booking can no longer be cancelled.');
    }
    const updated = await this.move(row, 'CANCELLED', 'Cancelled by the student', actor, client);
    const staff = await this.access.staffUserIds(row.businessProfileId);
    await this.notifications.notifyMany(staff, {
      category: 'ORDERS',
      type: 'booking.business',
      title: `Booking ${row.code} cancelled`,
      message: `${row.user.name} cancelled ${row.itemName}, ${this.when(row)}.`,
      link: '/dashboard?tab=bookings',
    });
    return this.toBooking(updated);
  }

  // ── Staff ──────────────────────────────────────────────────────────────────────────────────────

  async adminList(query: PaginationQuery & { q?: string }): Promise<Paginated<BusinessBooking>> {
    const where: Prisma.BookingWhereInput = query.q
      ? { OR: [{ code: query.q.toUpperCase() }, { place: { name: { contains: query.q } } }] }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        select: BOOKING_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.booking.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({ ...this.toBusiness(row), nextStatuses: [] })),
      { ...query, total },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async bookingType(key: string): Promise<{ id: string }> {
    const type = await this.prisma.serviceType.findFirst({
      where: { key, kind: 'BOOKING', status: 'ACTIVE' },
      select: { id: true },
    });
    if (!type) throw AppException.notFound('Service not found');
    return type;
  }

  /** A bookable item of a live BOOKING service at a live place (optionally checked against a place). */
  private async bookable(itemId: string, placeIdOrSlug?: string): Promise<BookableItem> {
    const row = await this.prisma.serviceItem.findFirst({
      where: {
        id: itemId,
        available: true,
        serviceType: { kind: 'BOOKING', status: 'ACTIVE' },
        place: {
          ...SERVICE_PLACE_WHERE,
          ...(placeIdOrSlug
            ? looksLikeUuid(placeIdOrSlug)
              ? { id: placeIdOrSlug.toLowerCase() }
              : { slug: placeIdOrSlug }
            : {}),
        },
      },
      select: {
        id: true,
        name: true,
        price: true,
        durationMinutes: true,
        capacity: true,
        placeId: true,
        serviceTypeId: true,
        place: {
          select: {
            name: true,
            businessProfileId: true,
            services: { where: LIVE_SERVICE_WHERE, select: { serviceTypeId: true, config: true } },
          },
        },
      },
    });
    const service = row?.place.services.find((item) => item.serviceTypeId === row.serviceTypeId);
    if (!row?.place.businessProfileId || !service)
      throw AppException.notFound('This is not bookable here');
    return {
      id: row.id,
      name: row.name,
      price: row.price,
      durationMinutes: row.durationMinutes,
      capacity: row.capacity ?? 1,
      placeId: row.placeId,
      businessProfileId: row.place.businessProfileId,
      placeName: row.place.name,
      serviceTypeId: row.serviceTypeId,
      config: configOf('BOOKING', service.config) as BookingConfig,
    };
  }

  private async slotsOf(item: BookableItem, day: Date) {
    const windows = await this.prisma.bookingSchedule.findMany({
      where: {
        placeId: item.placeId,
        serviceTypeId: item.serviceTypeId,
        dayOfWeek: isoWeekday(day),
      },
      select: { openTime: true, closeTime: true },
    });
    return slotsFor(day, windows, item.durationMinutes, new Date());
  }

  private assertBookableDay(day: Date): void {
    const today = istDay(new Date());
    if (day < today || day > daysBefore(today, -BOOKING_DAYS_AHEAD)) {
      throw AppException.validation({
        date: [`Book between today and ${BOOKING_DAYS_AHEAD} days ahead`],
      });
    }
  }

  /** Compare-and-set move; a booking that ends frees its seat and the student's slot. */
  private async move(
    row: BookingRow,
    to: BookingStatus,
    reason: string | null,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BookingRow> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: to,
          statusReason: reason,
          statusChangedAt: new Date(),
          ...(isLive(to) ? {} : to === 'CANCELLED' ? { slotKey: null, studentKey: null } : {}),
        },
      });
      if (changed.count === 0)
        throw AppException.conflict('STATUS_CHANGED', 'This booking changed meanwhile. Refresh.');
      await this.audit.record(
        {
          action: 'BOOKING_STATUS_CHANGED',
          actorId: actor.id,
          entityType: 'Booking',
          entityId: row.id,
          metadata: { from: row.status, to, reason },
          client,
        },
        tx,
      );
      return tx.booking.findUniqueOrThrow({ where: { id: row.id }, select: BOOKING_SELECT });
    });
  }

  private when(row: Pick<BookingRow, 'date' | 'startAt' | 'serviceItem'>): string {
    const date = new Date(row.startAt).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
    if (row.serviceItem && row.serviceItem.durationMinutes === null) return date;
    return `${date}, ${new Date(row.startAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`;
  }

  toBooking(row: BookingRow): Booking {
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      statusLabel: BOOKING_STATUS_LABELS[row.status],
      place: row.place,
      service: row.serviceType,
      itemName: row.itemName,
      date: dayKey(row.date),
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      wholeDay: row.serviceItem?.durationMinutes === null,
      seatNo: row.seatNo,
      price: row.price,
      note: row.note,
      statusReason: row.statusReason,
      cancellable: studentCanCancel(row.status, row.startAt, new Date()),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toBusiness(row: BookingRow): BusinessBooking {
    return {
      ...this.toBooking(row),
      student: { name: row.user.name },
      nextStatuses: [...bookingMoves(row.status)],
    };
  }
}
