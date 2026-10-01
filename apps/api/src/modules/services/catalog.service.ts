import { Injectable } from '@nestjs/common';
import type {
  ItemSection,
  ListServiceItemsQuery,
  SaveServiceItemRequest,
  ServiceItem,
  UpdateServiceItemRequest,
} from '@platform/contracts';
import { CapabilitiesService } from '../capabilities/capabilities.service.js';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { optionsOf } from '../orders/order-rules.js';

/** At most this many catalogue items per place (a long restaurant menu fits comfortably). */
export const MAX_ITEMS_PER_PLACE = 500;

export const ITEM_SELECT = {
  id: true,
  placeId: true,
  section: true,
  name: true,
  description: true,
  price: true,
  isVeg: true,
  options: true,
  available: true,
  sortOrder: true,
  durationMinutes: true,
  capacity: true,
  serviceType: { select: { key: true, kind: true } },
} satisfies Prisma.ServiceItemSelect;
export type ItemRow = Prisma.ServiceItemGetPayload<{ select: typeof ITEM_SELECT }>;

export const toServiceItem = (row: ItemRow): ServiceItem => ({
  id: row.id,
  serviceKey: row.serviceType.key,
  section: row.section,
  name: row.name,
  description: row.description,
  price: row.price,
  isVeg: row.isVeg,
  options: optionsOf(row.options),
  available: row.available,
  sortOrder: row.sortOrder,
  durationMinutes: row.durationMinutes,
  capacity: row.capacity,
});

/** Items grouped by section, sections in the order their first item appears. */
export function sectionsOf(items: readonly ServiceItem[]): ItemSection[] {
  const sections = new Map<string, ServiceItem[]>();
  for (const item of items) {
    const list = sections.get(item.section) ?? [];
    list.push(item);
    sections.set(item.section, list);
  }
  return [...sections].map(([name, list]) => ({ name, items: list }));
}

/**
 * The price list of a place per service (food menu, repairs, haircuts, ...): one reusable catalogue.
 * The owner manages it; students only ever see available items of live services.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly capabilities: CapabilitiesService,
    private readonly audit: AuditService,
  ) {}

  async ownerList(
    actor: AuthenticatedUser,
    placeId: string,
    query: ListServiceItemsQuery,
  ): Promise<ServiceItem[]> {
    const place = await this.access.placeOf(actor, placeId);
    const rows = await this.prisma.serviceItem.findMany({
      where: {
        placeId: place.id,
        ...(query.service ? { serviceType: { key: query.service } } : {}),
      },
      select: ITEM_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toServiceItem);
  }

  async create(
    actor: AuthenticatedUser,
    placeId: string,
    dto: SaveServiceItemRequest,
    client: ClientContext,
  ): Promise<ServiceItem> {
    const place = await this.access.placeOf(actor, placeId);
    const type = await this.prisma.serviceType.findFirst({
      where: { key: dto.serviceKey, status: 'ACTIVE' },
      select: { id: true, kind: true },
    });
    if (!type) throw AppException.validation({ serviceKey: ['Unknown service'] });
    await this.capabilities.require(
      place.businessProfileId,
      CapabilitiesService.forServiceKind(type.kind),
    );
    const count = await this.prisma.serviceItem.count({ where: { placeId: place.id } });
    if (count >= MAX_ITEMS_PER_PLACE) {
      throw AppException.validation({
        name: [`A place can list at most ${MAX_ITEMS_PER_PLACE} items`],
      });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceItem.create({
        data: {
          placeId: place.id,
          serviceTypeId: type.id,
          section: dto.section,
          name: dto.name,
          description: dto.description ?? null,
          price: dto.price,
          isVeg: dto.isVeg ?? null,
          options: dto.options,
          available: dto.available,
          sortOrder: dto.sortOrder,
          durationMinutes: dto.durationMinutes ?? null,
          capacity: dto.capacity ?? null,
        },
        select: ITEM_SELECT,
      });
      await this.audit.record(
        {
          action: 'SERVICE_ITEM_CREATED',
          actorId: actor.id,
          entityType: 'ServiceItem',
          entityId: created.id,
          metadata: { placeId: place.id, name: created.name, price: created.price },
          client,
        },
        tx,
      );
      return created;
    });
    return toServiceItem(row);
  }

  async update(
    actor: AuthenticatedUser,
    placeId: string,
    itemId: string,
    dto: UpdateServiceItemRequest,
    client: ClientContext,
  ): Promise<ServiceItem> {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.prisma.serviceItem.findFirst({
      where: { id: itemId, placeId: place.id },
      select: { id: true, price: true },
    });
    if (!current) throw AppException.notFound('Item not found');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceItem.update({
        where: { id: itemId },
        data: {
          ...(dto.section !== undefined ? { section: dto.section } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.isVeg !== undefined ? { isVeg: dto.isVeg } : {}),
          ...(dto.options !== undefined ? { options: dto.options } : {}),
          ...(dto.available !== undefined ? { available: dto.available } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        },
        select: ITEM_SELECT,
      });
      await this.audit.record(
        {
          action: 'SERVICE_ITEM_UPDATED',
          actorId: actor.id,
          entityType: 'ServiceItem',
          entityId: itemId,
          metadata: { fields: Object.keys(dto), fromPrice: current.price, toPrice: updated.price },
          client,
        },
        tx,
      );
      return updated;
    });
    return toServiceItem(row);
  }

  async remove(
    actor: AuthenticatedUser,
    placeId: string,
    itemId: string,
    client: ClientContext,
  ): Promise<void> {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.prisma.serviceItem.findFirst({
      where: { id: itemId, placeId: place.id },
      select: { id: true, name: true },
    });
    if (!current) throw AppException.notFound('Item not found');
    await this.prisma.$transaction(async (tx) => {
      // Past orders keep their copied name and price; the link to the item is cleared.
      await tx.serviceItem.delete({ where: { id: itemId } });
      await this.audit.record(
        {
          action: 'SERVICE_ITEM_DELETED',
          actorId: actor.id,
          entityType: 'ServiceItem',
          entityId: itemId,
          metadata: { placeId: place.id, name: current.name },
          client,
        },
        tx,
      );
    });
  }

  /** Available items of the given service keys, grouped by section, for students. */
  async publicCatalog(
    placeId: string,
    serviceKeys: readonly string[],
  ): Promise<Record<string, ItemSection[]>> {
    if (serviceKeys.length === 0) return {};
    const rows = await this.prisma.serviceItem.findMany({
      where: { placeId, available: true, serviceType: { key: { in: [...serviceKeys] } } },
      select: ITEM_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const byKey: Record<string, ItemSection[]> = {};
    for (const key of serviceKeys) {
      byKey[key] = sectionsOf(rows.filter((row) => row.serviceType.key === key).map(toServiceItem));
    }
    return byKey;
  }
}
