import { Injectable } from '@nestjs/common';
import type {
  ListNotificationsQuery,
  Notification,
  NotificationCategory,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  /** A dotted key such as `community.comment`; new kinds need no schema change. */
  type: string;
  title: string;
  message: string;
  /** An app path to open, e.g. `/community/posts/<id>`. */
  link?: string;
}

/** Which settings switch governs each category. ACCOUNT notices (verification) always send. */
const SETTING_FOR: Readonly<
  Record<Exclude<NotificationCategory, 'ACCOUNT'>, keyof Prisma.UserSettingsSelect>
> = {
  COMMUNITY: 'notifyCommunity',
  MARKETPLACE: 'notifyMarketplace',
  EVENTS: 'notifyEvents',
  JOBS: 'notifyJobs',
  MESSAGES: 'notifyMessages',
};

type Db = Prisma.TransactionClient | PrismaService;

/**
 * In-app notifications on the existing `notifications` table. A notification is only written if
 * the member has not switched its category off (no row in `user_settings` = everything on). Email
 * or push delivery can be added on top later without changing callers.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the notification unless the member opted out. Returns whether it was written. */
  async notify(input: NotifyInput, db: Db = this.prisma): Promise<boolean> {
    if (input.category !== 'ACCOUNT') {
      const field = SETTING_FOR[input.category];
      const settings = await db.userSettings.findUnique({
        where: { userId: input.userId },
        select: { [field]: true },
      });
      if (settings && (settings as Record<string, unknown>)[field] === false) return false;
    }
    await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 200),
        message: input.message,
        data: input.link
          ? { link: input.link, category: input.category }
          : { category: input.category },
      },
    });
    return true;
  }

  async list(userId: string, query: ListNotificationsQuery): Promise<Paginated<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
    ]);
    return Paginated.of(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        link: linkOf(row.data),
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      })),
      { page: query.page, limit: query.limit, total },
    );
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Only the owner's own notification; anyone else's is a 404. */
  async markRead(userId: string, id: string): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) throw AppException.notFound('Notification not found');
  }

  async markAllRead(userId: string): Promise<number> {
    const updated = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return updated.count;
  }
}

function linkOf(data: unknown): string | null {
  if (data && typeof data === 'object' && 'link' in data) {
    const link = data.link;
    // Only in-app paths: a stored value can never become an off-site redirect.
    if (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) return link;
  }
  return null;
}
