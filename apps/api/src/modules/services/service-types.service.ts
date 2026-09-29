import { Injectable } from '@nestjs/common';
import type {
  AdminServiceType,
  CreateServiceTypeRequest,
  PlaceCard,
  QuickAction,
  ServiceType,
  ServiceTypePlacesQuery,
  UpdateServiceTypeRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { diffFields } from '../../common/utils/diff-fields.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { toPlaceCard } from '../places/place-mappers.js';
import { CARD_SELECT } from '../places/place-queries.js';
import { metersFrom } from '../places/place-rules.js';
import { istDay } from '../analytics/activity-rules.js';
import { isAvailableOn, visibleOfferWhere } from '../offers/offer-rules.js';
import { SERVICE_PLACE_WHERE, placesWithService } from './service-rules.js';

export const TYPE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  icon: true,
  kind: true,
  showOnHome: true,
  categorySlug: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceTypeSelect;
type TypeRow = Prisma.ServiceTypeGetPayload<{ select: typeof TYPE_SELECT }>;

/** A place card plus its coordinates, to work out distance. */
export const SERVICE_CARD_SELECT = {
  ...CARD_SELECT,
  latitude: true,
  longitude: true,
} satisfies Prisma.PlaceSelect;
export type ServiceCardRow = Prisma.PlaceGetPayload<{ select: typeof SERVICE_CARD_SELECT }>;

export function cardWithDistance(
  row: ServiceCardRow,
  point: { latitude: number; longitude: number } | undefined,
): PlaceCard {
  return toPlaceCard(row, metersFrom(point, row));
}

export const pointOf = (query: { lat?: number; lng?: number }) =>
  query.lat !== undefined && query.lng !== undefined
    ? { latitude: query.lat, longitude: query.lng }
    : undefined;

/** Nearest first when there is a point, otherwise best rated first. */
export function sortByDistance<T extends { distanceMeters: number | null; ratingAverage: number }>(
  cards: T[],
): T[] {
  return cards.sort((a, b) =>
    a.distanceMeters !== null && b.distanceMeters !== null
      ? a.distanceMeters - b.distanceMeters
      : b.ratingAverage - a.ratingAverage,
  );
}

const toServiceType = (row: TypeRow): ServiceType => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  icon: row.icon,
  kind: row.kind,
  showOnHome: row.showOnHome,
  categorySlug: row.categorySlug,
  sortOrder: row.sortOrder,
});

/** At most this many places are ranked by distance for one service list. */
const RANK_POOL = 500;

/**
 * The catalogue of service types (quick actions) and the places that offer each. Service types are
 * data: staff add, rename, hide or reorder them without a release.
 */
@Injectable()
export class ServiceTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async active(): Promise<ServiceType[]> {
    const rows = await this.prisma.serviceType.findMany({
      where: { status: 'ACTIVE' },
      select: TYPE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toServiceType);
  }

  /**
   * The home screen's quick actions with how many live places offer each right now, so the app can
   * show an honest empty state instead of a button that leads nowhere.
   */
  async quickActions(): Promise<QuickAction[]> {
    const types = await this.prisma.serviceType.findMany({
      where: { status: 'ACTIVE', showOnHome: true },
      select: TYPE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = await Promise.all(types.map((type) => this.availability(type)));
    return types.map((type, index) => {
      return {
        key: type.key,
        name: type.name,
        description: type.description,
        icon: type.icon,
        kind: type.kind,
        categorySlug: type.categorySlug,
        sortOrder: type.sortOrder,
        available: counts[index] ?? 0,
      };
    });
  }

  /** Live places that offer a service type (or, for LISTING, that are in its category). */
  async places(key: string, query: ServiceTypePlacesQuery): Promise<Paginated<PlaceCard>> {
    const type = await this.prisma.serviceType.findFirst({
      where: { key, status: 'ACTIVE' },
      select: TYPE_SELECT,
    });
    if (!type) throw AppException.notFound('Service not found');
    const where = await this.placeFilter(type);
    const point = pointOf(query);
    const [rows, total] = await Promise.all([
      this.prisma.place.findMany({
        where,
        select: SERVICE_CARD_SELECT,
        orderBy: [{ ratingAverage: 'desc' }, { id: 'asc' }],
        take: RANK_POOL,
      }),
      this.prisma.place.count({ where }),
    ]);
    const ranked = sortByDistance(rows.map((row) => cardWithDistance(row, point)));
    const { skip, take } = pageWindow(query);
    return Paginated.of(ranked.slice(skip, skip + take), {
      ...query,
      total: Math.min(total, RANK_POOL),
    });
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────────────────────

  async adminList(): Promise<AdminServiceType[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.serviceType.findMany({
        select: TYPE_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.placeService.groupBy({
        by: ['serviceTypeId'],
        where: { enabled: true },
        _count: { _all: true },
      }),
    ]);
    const countOf = new Map(counts.map((row) => [row.serviceTypeId, row._count._all]));
    return rows.map((row) => this.toAdmin(row, countOf.get(row.id) ?? 0));
  }

  async create(
    dto: CreateServiceTypeRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminServiceType> {
    const taken = await this.prisma.serviceType.findUnique({ where: { key: dto.key } });
    if (taken)
      throw AppException.conflict('CONFLICT', 'A service type with this key already exists.');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceType.create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description ?? null,
          icon: dto.icon ?? null,
          kind: dto.kind,
          showOnHome: dto.showOnHome,
          categorySlug: dto.categorySlug ?? null,
          status: dto.status,
          sortOrder: dto.sortOrder,
        },
        select: TYPE_SELECT,
      });
      await this.audit.record(
        {
          action: 'SERVICE_TYPE_CREATED',
          actorId: actor.id,
          entityType: 'ServiceType',
          entityId: created.id,
          metadata: { key: created.key, kind: created.kind },
          client,
        },
        tx,
      );
      return created;
    });
    return this.toAdmin(row, 0);
  }

  async update(
    id: string,
    dto: UpdateServiceTypeRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminServiceType> {
    const current = await this.prisma.serviceType.findUnique({
      where: { id },
      select: TYPE_SELECT,
    });
    if (!current) throw AppException.notFound('Service type not found');
    const changed = diffFields(current, dto);
    const row = changed.length
      ? await this.prisma.$transaction(async (tx) => {
          const updated = await tx.serviceType.update({
            where: { id },
            data: dto,
            select: TYPE_SELECT,
          });
          await this.audit.record(
            {
              action: 'SERVICE_TYPE_UPDATED',
              actorId: actor.id,
              entityType: 'ServiceType',
              entityId: id,
              metadata: { fields: changed },
              client,
            },
            tx,
          );
          return updated;
        })
      : current;
    const placeCount = await this.prisma.placeService.count({
      where: { serviceTypeId: id, enabled: true },
    });
    return this.toAdmin(row, placeCount);
  }

  private toAdmin(row: TypeRow, placeCount: number): AdminServiceType {
    return {
      ...toServiceType(row),
      status: row.status,
      placeCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async availability(type: TypeRow): Promise<number> {
    if (type.kind === 'OFFERS') {
      const today = istDay(new Date());
      const offers = await this.prisma.studentOffer.findMany({
        where: visibleOfferWhere(today),
        select: {
          placeId: true,
          status: true,
          discountType: true,
          discountValue: true,
          maxDiscount: true,
          minOrderAmount: true,
          validFrom: true,
          validUntil: true,
          daysOfWeek: true,
          limitPeriod: true,
          totalLimit: true,
          redeemedCount: true,
        },
        take: 1000,
      });
      return new Set(
        offers.filter((offer) => isAvailableOn(offer, today)).map((offer) => offer.placeId),
      ).size;
    }
    return this.prisma.place.count({ where: await this.placeFilter(type) });
  }

  private async placeFilter(type: TypeRow): Promise<Prisma.PlaceWhereInput> {
    if (type.kind === 'OFFERS') {
      return { ...SERVICE_PLACE_WHERE, offers: { some: visibleOfferWhere(istDay(new Date())) } };
    }
    if (type.kind !== 'LISTING') return placesWithService(type.id);
    if (!type.categorySlug) return { id: { in: [] } };
    const category = await this.prisma.category.findUnique({
      where: { slug: type.categorySlug },
      select: { id: true, children: { select: { id: true } } },
    });
    if (!category) return { id: { in: [] } };
    const ids = [category.id, ...category.children.map((child) => child.id)];
    return { status: 'ACTIVE', categories: { some: { categoryId: { in: ids } } } };
  }
}
