import { Injectable } from '@nestjs/common';
import {
  type AdminListPlaceServicesQuery,
  type AdminPlaceService,
  type AdminUpdatePlaceServiceRequest,
  type PlaceService,
  type PlaceServices,
  type PublicPlaceService,
  type UpdatePlaceServiceRequest,
  DEFAULT_TABLE_REQUESTS,
  looksLikeUuid,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { istDay } from '../analytics/activity-rules.js';
import { OFFER_SELECT, toStudentOffer } from '../offers/offers.service.js';
import { visibleOfferWhere } from '../offers/offer-rules.js';
import { CatalogService } from './catalog.service.js';
import { MenusService } from './menus.service.js';
import {
  CATALOG_KINDS,
  LIVE_SERVICE_WHERE,
  configOf,
  isSupportedKind,
  parseSubmittedConfig,
} from './service-rules.js';

const SERVICE_SELECT = {
  id: true,
  enabled: true,
  config: true,
  disabledByAdmin: true,
  adminNote: true,
  updatedAt: true,
  serviceType: {
    select: { id: true, key: true, name: true, icon: true, kind: true, description: true },
  },
} satisfies Prisma.PlaceServiceSelect;

/**
 * Which services a place offers. The owner switches supported kinds on and off with their settings;
 * staff can switch any of them off (which wins); students see only live ones.
 */
@Injectable()
export class PlaceServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly menus: MenusService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  /** Every service type the owner can switch on for the place, with its current state. */
  async ownerList(actor: AuthenticatedUser, placeId: string): Promise<PlaceService[]> {
    const place = await this.access.placeOf(actor, placeId);
    const [types, rows] = await Promise.all([
      this.prisma.serviceType.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, key: true, name: true, icon: true, kind: true, description: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.placeService.findMany({ where: { placeId: place.id }, select: SERVICE_SELECT }),
    ]);
    const byType = new Map(rows.map((row) => [row.serviceType.id, row]));
    return types
      .filter((type) => isSupportedKind(type.kind))
      .map((type) => {
        const row = byType.get(type.id);
        return {
          serviceType: {
            key: type.key,
            name: type.name,
            icon: type.icon,
            kind: type.kind,
            description: type.description,
          },
          enabled: row?.enabled ?? false,
          config: configOf(type.kind, row?.config),
          disabledByAdmin: row?.disabledByAdmin ?? false,
          adminNote: row?.adminNote ?? null,
          updatedAt: row?.updatedAt.toISOString() ?? null,
        };
      });
  }

  async ownerUpdate(
    actor: AuthenticatedUser,
    placeId: string,
    key: string,
    dto: UpdatePlaceServiceRequest,
    client: ClientContext,
  ): Promise<PlaceService> {
    const place = await this.access.placeOf(actor, placeId);
    const type = await this.prisma.serviceType.findFirst({
      where: { key, status: 'ACTIVE' },
      select: { id: true, key: true, name: true, icon: true, kind: true, description: true },
    });
    if (!type || !isSupportedKind(type.kind)) throw AppException.notFound('Service not found');

    const existing = await this.prisma.placeService.findUnique({
      where: { placeId_serviceTypeId: { placeId: place.id, serviceTypeId: type.id } },
      select: { config: true, enabled: true },
    });
    // A partial config is merged over what is stored, then validated as a whole.
    const config = dto.config
      ? parseSubmittedConfig(type.kind, { ...configOf(type.kind, existing?.config), ...dto.config })
      : configOf(type.kind, existing?.config);
    const enabled = dto.enabled ?? existing?.enabled ?? true;
    // Switching Table Service on for the first time adds the usual requests (Water, Bill, ...).
    if (type.kind === 'TABLE_SERVICE' && enabled) {
      const count = await this.prisma.tableRequestType.count({ where: { placeId: place.id } });
      if (count === 0) {
        await this.prisma.tableRequestType.createMany({
          data: DEFAULT_TABLE_REQUESTS.map((item, index) => ({
            placeId: place.id,
            label: item.label,
            icon: item.icon,
            sortOrder: index,
          })),
        });
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.placeService.upsert({
        where: { placeId_serviceTypeId: { placeId: place.id, serviceTypeId: type.id } },
        create: {
          placeId: place.id,
          serviceTypeId: type.id,
          enabled,
          config: config as Prisma.InputJsonValue,
        },
        update: { enabled, config: config as Prisma.InputJsonValue },
        select: SERVICE_SELECT,
      });
      await this.audit.record(
        {
          action: 'PLACE_SERVICE_UPDATED',
          actorId: actor.id,
          entityType: 'PlaceService',
          entityId: saved.id,
          metadata: {
            placeId: place.id,
            service: type.key,
            enabled,
            fields: Object.keys(dto.config ?? {}),
          },
          client,
        },
        tx,
      );
      return saved;
    });
    return {
      serviceType: {
        key: row.serviceType.key,
        name: row.serviceType.name,
        icon: row.serviceType.icon,
        kind: row.serviceType.kind,
        description: row.serviceType.description,
      },
      enabled: row.enabled,
      config,
      disabledByAdmin: row.disabledByAdmin,
      adminNote: row.adminNote,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** What a student sees on a place: its live services and today's / tomorrow's menu. */
  async publicServices(idOrSlug: string): Promise<PlaceServices> {
    const place = await this.prisma.place.findFirst({
      where: {
        status: 'ACTIVE',
        ...(looksLikeUuid(idOrSlug) ? { id: idOrSlug.toLowerCase() } : { slug: idOrSlug }),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        businessProfile: { select: { status: true } },
        services: {
          where: LIVE_SERVICE_WHERE,
          select: SERVICE_SELECT,
          orderBy: { serviceType: { sortOrder: 'asc' } },
        },
      },
    });
    if (!place) throw AppException.notFound('Place not found');
    // A suspended business offers nothing through CampusPin.
    const live = place.businessProfile?.status === 'ACTIVE' ? place.services : [];
    const services: PublicPlaceService[] = live
      .filter((row) => isSupportedKind(row.serviceType.kind))
      .map((row) => ({
        key: row.serviceType.key,
        name: row.serviceType.name,
        icon: row.serviceType.icon,
        kind: row.serviceType.kind,
        description: row.serviceType.description,
        config: configOf(row.serviceType.kind, row.config),
      }));
    const hasMenu = services.some((service) => service.kind === 'DAILY_MENU');
    const catalogKeys = services
      .filter((service) => CATALOG_KINDS.has(service.kind))
      .map((service) => service.key);
    const hasTableService = services.some((service) => service.kind === 'TABLE_SERVICE');
    const today = istDay(new Date());
    const [menus, catalog, requestTypes, offerRows] = await Promise.all([
      hasMenu ? this.menus.placeMenus(place.id) : Promise.resolve({ today: null, tomorrow: null }),
      this.catalog.publicCatalog(place.id, catalogKeys),
      hasTableService
        ? this.prisma.tableRequestType.findMany({
            where: { placeId: place.id, status: 'ACTIVE' },
            select: { id: true, label: true, icon: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          })
        : Promise.resolve([]),
      place.businessProfile?.status === 'ACTIVE'
        ? this.prisma.studentOffer.findMany({
            where: { ...visibleOfferWhere(today), placeId: place.id },
            select: OFFER_SELECT,
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
    ]);
    return {
      placeId: place.id,
      slug: place.slug,
      name: place.name,
      services,
      menus,
      catalog,
      tableRequests: requestTypes,
      offers: offerRows
        .map((row) => toStudentOffer(row, today))
        .filter((offer) => offer.availableToday),
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────────────────────

  async adminList(query: AdminListPlaceServicesQuery): Promise<Paginated<AdminPlaceService>> {
    const where: Prisma.PlaceServiceWhereInput = {
      ...(query.serviceType ? { serviceType: { key: query.serviceType } } : {}),
      ...(query.q ? { place: { name: { contains: query.q } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.placeService.findMany({
        where,
        select: {
          ...SERVICE_SELECT,
          place: {
            select: {
              id: true,
              slug: true,
              name: true,
              businessProfile: { select: { id: true, businessName: true } },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.placeService.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toAdmin(row)),
      { ...query, total },
    );
  }

  async adminUpdate(
    id: string,
    dto: AdminUpdatePlaceServiceRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlaceService> {
    const current = await this.prisma.placeService.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw AppException.notFound('Service not found');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.placeService.update({
        where: { id },
        data: { disabledByAdmin: dto.disabledByAdmin, adminNote: dto.adminNote ?? null },
        select: {
          ...SERVICE_SELECT,
          place: {
            select: {
              id: true,
              slug: true,
              name: true,
              businessProfile: { select: { id: true, businessName: true } },
            },
          },
        },
      });
      await this.audit.record(
        {
          action: dto.disabledByAdmin
            ? 'PLACE_SERVICE_DISABLED_BY_ADMIN'
            : 'PLACE_SERVICE_RESTORED_BY_ADMIN',
          actorId: actor.id,
          entityType: 'PlaceService',
          entityId: id,
          metadata: { note: dto.adminNote ?? null },
          client,
        },
        tx,
      );
      return updated;
    });
    return this.toAdmin(row);
  }

  private toAdmin(
    row: Prisma.PlaceServiceGetPayload<{
      select: typeof SERVICE_SELECT & {
        place: {
          select: {
            id: true;
            slug: true;
            name: true;
            businessProfile: { select: { id: true; businessName: true } };
          };
        };
      };
    }>,
  ): AdminPlaceService {
    return {
      id: row.id,
      place: { id: row.place.id, slug: row.place.slug, name: row.place.name },
      business: row.place.businessProfile
        ? { id: row.place.businessProfile.id, name: row.place.businessProfile.businessName }
        : null,
      serviceType: {
        key: row.serviceType.key,
        name: row.serviceType.name,
        icon: row.serviceType.icon,
        kind: row.serviceType.kind,
      },
      enabled: row.enabled,
      disabledByAdmin: row.disabledByAdmin,
      adminNote: row.adminNote,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
