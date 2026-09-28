import { Injectable } from '@nestjs/common';
import type { StudentHome, StudentHomeQuery } from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { MenusService } from './menus.service.js';
import {
  SERVICE_CARD_SELECT,
  ServiceTypesService,
  cardWithDistance,
  pointOf,
} from './service-types.service.js';

const HOME_MENUS = 6;
const HOME_SAVED = 10;

/**
 * The student home screen in one request: the daily-use dashboard (what can I do, what is on the
 * mess menu today, my places), so the app does not fan out into many calls on every open.
 */
@Injectable()
export class StudentHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly types: ServiceTypesService,
    private readonly menus: MenusService,
  ) {}

  async home(actor: AuthenticatedUser, query: StudentHomeQuery): Promise<StudentHome> {
    const point = pointOf(query);
    const [quickActions, todaysMenus, savedRows] = await Promise.all([
      this.types.quickActions(),
      this.menus.todaysMenus({ ...query, saved: false, limit: HOME_MENUS }, actor.id),
      this.prisma.savedPlace.findMany({
        where: { userId: actor.id, place: { status: 'ACTIVE' } },
        orderBy: { createdAt: 'desc' },
        take: HOME_SAVED,
        select: { place: { select: SERVICE_CARD_SELECT } },
      }),
    ]);
    return {
      quickActions,
      todaysMenus,
      saved: savedRows.map((row) => cardWithDistance(row.place, point)),
    };
  }
}
