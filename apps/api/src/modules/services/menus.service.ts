import { Injectable } from '@nestjs/common';
import {
  MEAL_SLOTS,
  type AdminDailyMenu,
  type AdminListMenusQuery,
  type DailyMenu,
  type ListOwnerMenusQuery,
  type Meals,
  type MessMenuCard,
  type ModerationRemoveRequest,
  type OwnerDailyMenu,
  type PlaceMenus,
  type SaveDailyMenuRequest,
  type TodaysMenusQuery,
  looksLikeUuid,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { daysBefore, dayKey } from '../analytics/activity-rules.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService, type OwnedPlace } from '../business/business-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  LIVE_SERVICE_WHERE,
  SERVICE_PLACE_WHERE,
  assertEditableMenuDate,
  dateFromKey,
  mealsOf,
  menuItemRows,
  todayAndTomorrow,
} from './service-rules.js';
import {
  SERVICE_CARD_SELECT,
  cardWithDistance,
  pointOf,
  sortByDistance,
} from './service-types.service.js';

const MENU_SELECT = {
  id: true,
  placeId: true,
  date: true,
  status: true,
  note: true,
  publishedAt: true,
  removedReason: true,
  updatedAt: true,
  items: { select: { meal: true, name: true, sortOrder: true } },
} satisfies Prisma.DailyMenuSelect;
type MenuRow = Prisma.DailyMenuGetPayload<{ select: typeof MENU_SELECT }>;

const toMenu = (row: MenuRow): DailyMenu => ({
  id: row.id,
  date: dayKey(row.date),
  status: row.status,
  note: row.note,
  meals: mealsOf(row.items),
  publishedAt: row.publishedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

const toOwnerMenu = (row: MenuRow): OwnerDailyMenu => ({
  ...toMenu(row),
  removedReason: row.removedReason,
});

/** A mess whose menu students may see: live place, active business, Daily Menu switched on. */
const MENU_PLACE_WHERE = {
  ...SERVICE_PLACE_WHERE,
  services: {
    some: { ...LIVE_SERVICE_WHERE, serviceType: { kind: 'DAILY_MENU', status: 'ACTIVE' } },
  },
} satisfies Prisma.PlaceWhereInput;

/** Messes considered for "today's menus near me". */
const NEARBY_POOL = 300;
/** The owner's menu list covers at most this many days. */
const OWNER_RANGE_MAX_DAYS = 62;

/** First few dishes, for a notification line: "Dal, Rice, Roti and 2 more". */
function dishesPreview(meals: Meals): string {
  const all = MEAL_SLOTS.flatMap((meal) => meals[meal]);
  if (all.length <= 3) return all.join(', ');
  return `${all.slice(0, 3).join(', ')} and ${all.length - 3} more`;
}

/**
 * Mess daily menus. The owner saves a day's dishes per meal (a draft), publishes it, copies
 * yesterday's or today's onto another day. Students see only published menus of live messes.
 */
@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Owner ──────────────────────────────────────────────────────────────────────────────────────

  async ownerList(
    actor: AuthenticatedUser,
    placeId: string,
    query: ListOwnerMenusQuery,
  ): Promise<OwnerDailyMenu[]> {
    const place = await this.access.placeOf(actor, placeId);
    const { today } = todayAndTomorrow();
    const from = query.from ? dateFromKey(query.from) : daysBefore(today, 7);
    const to = query.to ? dateFromKey(query.to) : daysBefore(today, -7);
    if (to < from || (to.getTime() - from.getTime()) / 86_400_000 > OWNER_RANGE_MAX_DAYS) {
      throw AppException.validation({
        to: [`Choose a range of at most ${OWNER_RANGE_MAX_DAYS} days`],
      });
    }
    const rows = await this.prisma.dailyMenu.findMany({
      where: { placeId: place.id, date: { gte: from, lte: to } },
      select: MENU_SELECT,
      orderBy: { date: 'desc' },
    });
    return rows.map(toOwnerMenu);
  }

  /** Replaces the day's dishes. `publish` publishes in the same step. */
  async save(
    actor: AuthenticatedUser,
    placeId: string,
    date: string,
    dto: SaveDailyMenuRequest,
    client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    const place = await this.access.placeOf(actor, placeId);
    const day = dateFromKey(date);
    assertEditableMenuDate(day);
    const existing = await this.prisma.dailyMenu.findUnique({
      where: { placeId_date: { placeId: place.id, date: day } },
      select: { status: true },
    });
    const publish = dto.publish === true || existing?.status === 'PUBLISHED';
    const firstPublish = publish && existing?.status !== 'PUBLISHED';

    const row = await this.prisma.$transaction(async (tx) => {
      const menu = await tx.dailyMenu.upsert({
        where: { placeId_date: { placeId: place.id, date: day } },
        create: {
          placeId: place.id,
          date: day,
          status: publish ? 'PUBLISHED' : 'DRAFT',
          note: dto.note ?? null,
          publishedAt: publish ? new Date() : null,
          createdById: actor.id,
        },
        update: {
          status: publish ? 'PUBLISHED' : 'DRAFT',
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(firstPublish ? { publishedAt: new Date(), removedReason: null } : {}),
        },
        select: { id: true },
      });
      await tx.dailyMenuItem.deleteMany({ where: { menuId: menu.id } });
      await tx.dailyMenuItem.createMany({
        data: menuItemRows(dto.meals).map((item) => ({ ...item, menuId: menu.id })),
      });
      if (publish) await this.ensureMenuServiceOn(tx, place.id);
      await this.audit.record(
        {
          action: firstPublish ? 'DAILY_MENU_PUBLISHED' : 'DAILY_MENU_SAVED',
          actorId: actor.id,
          entityType: 'DailyMenu',
          entityId: menu.id,
          metadata: { placeId: place.id, date },
          client,
        },
        tx,
      );
      return tx.dailyMenu.findUniqueOrThrow({ where: { id: menu.id }, select: MENU_SELECT });
    });
    if (firstPublish) await this.announce(place, row);
    return toOwnerMenu(row);
  }

  async publish(
    actor: AuthenticatedUser,
    placeId: string,
    date: string,
    client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.ownedMenu(place.id, date);
    if (current.items.length === 0)
      throw AppException.validation({ meals: ['Add at least one dish'] });
    if (current.status === 'PUBLISHED') return toOwnerMenu(current);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyMenu.update({
        where: { id: current.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), removedReason: null },
        select: MENU_SELECT,
      });
      await this.ensureMenuServiceOn(tx, place.id);
      await this.audit.record(
        {
          action: 'DAILY_MENU_PUBLISHED',
          actorId: actor.id,
          entityType: 'DailyMenu',
          entityId: current.id,
          metadata: { placeId: place.id, date },
          client,
        },
        tx,
      );
      return updated;
    });
    await this.announce(place, row);
    return toOwnerMenu(row);
  }

  /** Back to a draft: students no longer see it. */
  async unpublish(
    actor: AuthenticatedUser,
    placeId: string,
    date: string,
    client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.ownedMenu(place.id, date);
    if (current.status !== 'PUBLISHED') return toOwnerMenu(current);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyMenu.update({
        where: { id: current.id },
        data: { status: 'DRAFT' },
        select: MENU_SELECT,
      });
      await this.audit.record(
        {
          action: 'DAILY_MENU_UNPUBLISHED',
          actorId: actor.id,
          entityType: 'DailyMenu',
          entityId: current.id,
          metadata: { placeId: place.id, date },
          client,
        },
        tx,
      );
      return updated;
    });
    return toOwnerMenu(row);
  }

  /**
   * Copies another day's dishes onto `date` ("copy yesterday's menu", "copy today's to tomorrow").
   * The target keeps its status: a published day stays published with the copied dishes.
   */
  async copy(
    actor: AuthenticatedUser,
    placeId: string,
    date: string,
    fromDate: string,
    client: ClientContext,
  ): Promise<OwnerDailyMenu> {
    if (date === fromDate) throw AppException.validation({ fromDate: ['Choose a different day'] });
    const place = await this.access.placeOf(actor, placeId);
    const source = await this.prisma.dailyMenu.findUnique({
      where: { placeId_date: { placeId: place.id, date: dateFromKey(fromDate) } },
      select: MENU_SELECT,
    });
    if (!source || source.items.length === 0) {
      throw AppException.notFound(`There is no menu on ${fromDate} to copy`);
    }
    return this.save(
      actor,
      placeId,
      date,
      { meals: mealsOf(source.items), note: source.note },
      client,
    );
  }

  async remove(
    actor: AuthenticatedUser,
    placeId: string,
    date: string,
    client: ClientContext,
  ): Promise<void> {
    const place = await this.access.placeOf(actor, placeId);
    const current = await this.ownedMenu(place.id, date);
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyMenu.delete({ where: { id: current.id } });
      await this.audit.record(
        {
          action: 'DAILY_MENU_DELETED',
          actorId: actor.id,
          entityType: 'DailyMenu',
          entityId: current.id,
          metadata: { placeId: place.id, date },
          client,
        },
        tx,
      );
    });
  }

  // ── Students ───────────────────────────────────────────────────────────────────────────────────

  /** Today's and tomorrow's published menus of a place (the caller checked the place is live). */
  async placeMenus(placeId: string): Promise<PlaceMenus> {
    const { today, tomorrow } = todayAndTomorrow();
    const rows = await this.prisma.dailyMenu.findMany({
      where: { placeId, status: 'PUBLISHED', date: { in: [today, tomorrow] } },
      select: MENU_SELECT,
    });
    const byDay = new Map(rows.map((row) => [row.date.getTime(), toMenu(row)]));
    return {
      today: byDay.get(today.getTime()) ?? null,
      tomorrow: byDay.get(tomorrow.getTime()) ?? null,
    };
  }

  /** Public place menus, 404 when the place does not show menus. */
  async publicPlaceMenus(idOrSlug: string): Promise<PlaceMenus> {
    const place = await this.prisma.place.findFirst({
      where: {
        ...MENU_PLACE_WHERE,
        ...(looksLikeUuid(idOrSlug) ? { id: idOrSlug.toLowerCase() } : { slug: idOrSlug }),
      },
      select: { id: true },
    });
    if (!place) throw AppException.notFound('Place not found');
    return this.placeMenus(place.id);
  }

  /**
   * Messes with a menu published for today, nearest first (or saved ones only). Tomorrow's menu is
   * attached when it is out too.
   */
  async todaysMenus(query: TodaysMenusQuery, viewerId: string | null): Promise<MessMenuCard[]> {
    if (query.saved && !viewerId) return [];
    const { today, tomorrow } = todayAndTomorrow();
    const rows = await this.prisma.dailyMenu.findMany({
      where: {
        date: today,
        status: 'PUBLISHED',
        place: {
          ...MENU_PLACE_WHERE,
          ...(query.saved && viewerId ? { savedBy: { some: { userId: viewerId } } } : {}),
        },
      },
      select: { ...MENU_SELECT, place: { select: SERVICE_CARD_SELECT } },
      take: NEARBY_POOL,
    });
    if (rows.length === 0) return [];

    const placeIds = rows.map((row) => row.placeId);
    const [tomorrowRows, savedRows] = await Promise.all([
      this.prisma.dailyMenu.findMany({
        where: { placeId: { in: placeIds }, date: tomorrow, status: 'PUBLISHED' },
        select: MENU_SELECT,
      }),
      viewerId
        ? this.prisma.savedPlace.findMany({
            where: { userId: viewerId, placeId: { in: placeIds } },
            select: { placeId: true },
          })
        : Promise.resolve([]),
    ]);
    const tomorrowOf = new Map(tomorrowRows.map((row) => [row.placeId, toMenu(row)]));
    const saved = new Set(savedRows.map((row) => row.placeId));
    const point = pointOf(query);

    const cards = rows.map((row) => ({
      place: cardWithDistance(row.place, point),
      today: toMenu(row),
      tomorrow: tomorrowOf.get(row.placeId) ?? null,
      saved: saved.has(row.placeId),
    }));
    // Saved messes first, then nearest (or best rated without a point).
    const ranked = sortByDistance(cards.map((card) => ({ ...card.place, card }))).map(
      (entry) => entry.card,
    );
    return [...ranked.filter((card) => card.saved), ...ranked.filter((card) => !card.saved)].slice(
      0,
      query.limit,
    );
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────────────────────

  async adminList(query: AdminListMenusQuery): Promise<Paginated<AdminDailyMenu>> {
    const where: Prisma.DailyMenuWhereInput = {
      ...(query.date ? { date: dateFromKey(query.date) } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.dailyMenu.findMany({
        where,
        select: { ...MENU_SELECT, place: { select: { id: true, slug: true, name: true } } },
        orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.dailyMenu.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({ ...toOwnerMenu(row), place: row.place })),
      { ...query, total },
    );
  }

  /** Takes a menu down (inappropriate content). The owner sees the reason and can fix it. */
  async adminRemove(
    id: string,
    dto: ModerationRemoveRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminDailyMenu> {
    return this.adminSetStatus(
      id,
      'REMOVED',
      dto.reason,
      'DAILY_MENU_REMOVED_BY_ADMIN',
      actor,
      client,
    );
  }

  async adminRestore(
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminDailyMenu> {
    return this.adminSetStatus(
      id,
      'PUBLISHED',
      null,
      'DAILY_MENU_RESTORED_BY_ADMIN',
      actor,
      client,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async adminSetStatus(
    id: string,
    status: 'REMOVED' | 'PUBLISHED',
    reason: string | null,
    action: 'DAILY_MENU_REMOVED_BY_ADMIN' | 'DAILY_MENU_RESTORED_BY_ADMIN',
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminDailyMenu> {
    const current = await this.prisma.dailyMenu.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw AppException.notFound('Menu not found');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dailyMenu.update({
        where: { id },
        data: { status, removedReason: reason },
        select: { ...MENU_SELECT, place: { select: { id: true, slug: true, name: true } } },
      });
      await this.audit.record(
        {
          action,
          actorId: actor.id,
          entityType: 'DailyMenu',
          entityId: id,
          metadata: { reason },
          client,
        },
        tx,
      );
      return updated;
    });
    return { ...toOwnerMenu(row), place: row.place };
  }

  private async ownedMenu(placeId: string, date: string): Promise<MenuRow> {
    const row = await this.prisma.dailyMenu.findUnique({
      where: { placeId_date: { placeId, date: dateFromKey(date) } },
      select: MENU_SELECT,
    });
    if (!row) throw AppException.notFound(`There is no menu on ${date}`);
    return row;
  }

  /** Publishing a menu switches the Daily Menu service on, unless staff switched it off. */
  private async ensureMenuServiceOn(tx: Prisma.TransactionClient, placeId: string): Promise<void> {
    const type = await tx.serviceType.findFirst({
      where: { kind: 'DAILY_MENU', status: 'ACTIVE' },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!type) return;
    await tx.placeService.upsert({
      where: { placeId_serviceTypeId: { placeId, serviceTypeId: type.id } },
      create: { placeId, serviceTypeId: type.id, enabled: true },
      update: { enabled: true },
    });
  }

  /** Tells the students who saved this mess that today's (or tomorrow's) menu is out. */
  private async announce(place: OwnedPlace, row: MenuRow): Promise<void> {
    const { today, tomorrow } = todayAndTomorrow();
    const time = row.date.getTime();
    if (time !== today.getTime() && time !== tomorrow.getTime()) return;
    if (place.status !== 'ACTIVE') return;
    const [savers, staff] = await Promise.all([
      this.prisma.savedPlace.findMany({
        where: { placeId: place.id },
        select: { userId: true },
        take: 1000,
      }),
      this.access.staffUserIds(place.businessProfileId),
    ]);
    const skip = new Set(staff);
    const userIds = savers.map((saver) => saver.userId).filter((id) => !skip.has(id));
    const which = time === today.getTime() ? "Today's" : "Tomorrow's";
    await this.notifications.notifyMany(userIds, {
      category: 'PLACE_UPDATES',
      type: 'menu.published',
      title: `${which} menu at ${place.name}`,
      message: dishesPreview(mealsOf(row.items)),
      link: `/places/${place.slug}`,
    });
  }
}
