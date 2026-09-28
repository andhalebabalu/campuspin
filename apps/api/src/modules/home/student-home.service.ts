import { Injectable } from '@nestjs/common';
import type { StudentHome, StudentHomeQuery } from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OffersService } from '../offers/offers.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { MenusService } from '../services/menus.service.js';
import {
  SERVICE_CARD_SELECT,
  ServiceTypesService,
  cardWithDistance,
  pointOf,
} from '../services/service-types.service.js';

const HOME_MENUS = 6;
const HOME_SAVED = 10;
const HOME_ACTIVE = 5;
const HOME_RECENT = 6;
const HOME_OFFERS = 8;

/**
 * The student home screen in one request: the daily-use dashboard (what can I do, what is on the
 * way, what is on the mess menu today, my places), so the app does not fan out on every open.
 */
@Injectable()
export class StudentHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly types: ServiceTypesService,
    private readonly menus: MenusService,
    private readonly orders: OrdersService,
    private readonly requests: RequestsService,
    private readonly offers: OffersService,
  ) {}

  async home(actor: AuthenticatedUser, query: StudentHomeQuery): Promise<StudentHome> {
    const point = pointOf(query);
    const [quickActions, active, requests, offers, todaysMenus, savedRows, recentRows] =
      await Promise.all([
        this.types.quickActions(),
        this.orders.myOrders(actor, { page: 1, limit: HOME_ACTIVE, active: true }),
        this.requests.mine(actor, { page: 1, limit: HOME_ACTIVE, active: true }),
        this.offers.nearby({ ...query, limit: HOME_OFFERS }),
        this.menus.todaysMenus({ ...query, saved: false, limit: HOME_MENUS }, actor.id),
        this.prisma.savedPlace.findMany({
          where: { userId: actor.id, place: { status: 'ACTIVE' } },
          orderBy: { createdAt: 'desc' },
          take: HOME_SAVED,
          select: { place: { select: SERVICE_CARD_SELECT } },
        }),
        this.prisma.serviceOrder.findMany({
          where: { userId: actor.id, place: { status: 'ACTIVE' } },
          orderBy: { createdAt: 'desc' },
          distinct: ['placeId'],
          take: HOME_RECENT,
          select: { place: { select: SERVICE_CARD_SELECT } },
        }),
      ]);
    return {
      quickActions,
      activeOrders: [...active.items],
      activeRequests: [...requests.items],
      nearbyOffers: offers,
      todaysMenus,
      saved: savedRows.map((row) => cardWithDistance(row.place, point)),
      recentPlaces: recentRows.map((row) => cardWithDistance(row.place, point)),
    };
  }
}
