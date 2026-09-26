import { Injectable } from '@nestjs/common';
import type {
  Conversation,
  CursorPage,
  ListConversationsQuery,
  ListMessagesQuery,
  MarketplaceReportRequest,
  Message,
  ReportReceipt,
  StartConversationRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BlocksService } from '../safety/blocks.service.js';
import { ReportsService } from '../safety/reports.service.js';
import { DEFAULT_SETTINGS } from '../students/profile.service.js';
import { toMemberSummary } from '../students/student-access.service.js';
import { cursorPage } from '../community/community-rules.js';
import { MarketplaceService } from './marketplace.service.js';
import { MESSAGEABLE_STATUSES } from './marketplace-rules.js';

const MEMBER = {
  select: {
    id: true,
    name: true,
    studentVerifiedUntil: true,
    verifiedCollege: { select: { id: true, slug: true, name: true } },
  },
} as const;

const CONVERSATION_INCLUDE = {
  listing: {
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true } },
    },
  },
  buyer: MEMBER,
  seller: MEMBER,
  messages: { orderBy: { id: 'desc' }, take: 1, select: { body: true } },
} as const satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

/**
 * Buyer–seller chat inside the platform, so neither side has to share a phone number. One
 * conversation per buyer per listing; only its two members can read or write it, and a block from
 * either side makes it read-only.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketplace: MarketplaceService,
    private readonly blocks: BlocksService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A buyer's first message about a listing (or the next one, if they already talk). */
  async start(
    buyerId: string,
    listingId: string,
    dto: StartConversationRequest,
  ): Promise<Conversation> {
    // Visibility, verification and blocks are all checked by reading the listing as this buyer.
    const listing = await this.marketplace.get(buyerId, listingId);
    if (listing.mine) {
      throw AppException.badRequest('BAD_REQUEST', 'This is your own listing.');
    }
    if (!listing.canMessage && !listing.conversationId) {
      throw AppException.forbidden(
        'FORBIDDEN',
        listing.status === 'SOLD'
          ? 'This item is sold.'
          : 'The seller is not taking messages right now.',
      );
    }

    const now = new Date();
    const conversation = await this.prisma.$transaction(async (tx) => {
      const row = await tx.conversation.upsert({
        where: { listingId_buyerId: { listingId, buyerId } },
        create: {
          listingId,
          buyerId,
          sellerId: listing.seller.id,
          lastMessageAt: now,
          buyerLastReadAt: now,
        },
        update: { lastMessageAt: now, buyerLastReadAt: now },
      });
      await tx.conversationMessage.create({
        data: { conversationId: row.id, senderId: buyerId, body: dto.message },
      });
      return row;
    });

    await this.notifyRecipient(conversation.id, buyerId, dto.message);
    return this.get(buyerId, conversation.id);
  }

  async list(userId: string, query: ListConversationsQuery): Promise<Paginated<Conversation>> {
    const where: Prisma.ConversationWhereInput = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };
    const [total, rows, hidden] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        include: CONVERSATION_INCLUDE,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.blocks.hiddenFrom(userId),
    ]);
    return Paginated.of(
      rows.map((row) => this.toConversation(row, userId, hidden)),
      { ...query, total },
    );
  }

  async get(userId: string, conversationId: string): Promise<Conversation> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    if (!row || (row.buyerId !== userId && row.sellerId !== userId)) {
      throw AppException.notFound('Conversation not found');
    }
    return this.toConversation(row, userId, await this.blocks.hiddenFrom(userId));
  }

  async messages(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ): Promise<CursorPage<Message>> {
    await this.participant(userId, conversationId);
    const rows = await this.prisma.conversationMessage.findMany({
      where: { conversationId, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = cursorPage(rows, query.limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        conversationId,
        body: row.body,
        mine: row.senderId === userId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async send(userId: string, conversationId: string, body: string): Promise<Message> {
    const conversation = await this.participant(userId, conversationId);
    const other = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    if (await this.blocks.eitherBlocked(userId, other)) {
      throw AppException.forbidden('BLOCKED', 'You cannot message this member.');
    }
    if (!(MESSAGEABLE_STATUSES as readonly string[]).includes(conversation.listing.status)) {
      throw AppException.conflict('CONFLICT', 'This listing is no longer available.');
    }

    const now = new Date();
    const buyer = conversation.buyerId === userId;
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversationMessage.create({
        data: { conversationId, senderId: userId, body },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          ...(buyer ? { buyerLastReadAt: now } : { sellerLastReadAt: now }),
        },
      });
      return created;
    });

    await this.notifyRecipient(conversationId, userId, body, conversation.lastMessageAt);
    return {
      id: message.id,
      conversationId,
      body: message.body,
      mine: true,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.participant(userId, conversationId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        conversation.buyerId === userId
          ? { buyerLastReadAt: new Date() }
          : { sellerLastReadAt: new Date() },
    });
  }

  /** How many of my conversations have something I have not read. */
  async unreadCount(userId: string): Promise<number> {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: {
        buyerId: true,
        lastMessageAt: true,
        buyerLastReadAt: true,
        sellerLastReadAt: true,
      },
      take: 500,
    });
    return rows.filter((row) => isUnread(row, userId)).length;
  }

  /** Reports the other member of a conversation (harassment, scam…). */
  async report(
    userId: string,
    conversationId: string,
    dto: MarketplaceReportRequest,
    client: ClientContext,
  ): Promise<ReportReceipt> {
    const conversation = await this.participant(userId, conversationId);
    const other = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    return this.reports.create(
      {
        reporterId: userId,
        targetType: 'USER',
        targetId: other,
        reason: dto.reason,
        description: [`Marketplace conversation ${conversationId}.`, dto.description]
          .filter(Boolean)
          .join(' '),
      },
      client,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async participant(userId: string, conversationId: string) {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        buyerId: true,
        sellerId: true,
        lastMessageAt: true,
        listing: { select: { status: true } },
      },
    });
    if (!row || (row.buyerId !== userId && row.sellerId !== userId)) {
      throw AppException.notFound('Conversation not found');
    }
    return row;
  }

  /**
   * One notification per unread stretch: the recipient hears about the first new message, not every
   * line of a quick back-and-forth.
   */
  private async notifyRecipient(
    conversationId: string,
    senderId: string,
    body: string,
    previousMessageAt?: Date,
  ) {
    const row = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: {
        buyerId: true,
        sellerId: true,
        buyerLastReadAt: true,
        sellerLastReadAt: true,
        listing: { select: { title: true } },
        buyer: { select: { name: true } },
        seller: { select: { name: true } },
      },
    });
    const toBuyer = row.sellerId === senderId;
    const recipientId = toBuyer ? row.buyerId : row.sellerId;
    const lastRead = toBuyer ? row.buyerLastReadAt : row.sellerLastReadAt;
    if (previousMessageAt && lastRead && lastRead < previousMessageAt) return; // already unread

    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: recipientId },
      select: { notifyMessages: true },
    });
    if (!(settings ?? DEFAULT_SETTINGS).notifyMessages) return;

    const sender = toMemberSummary({
      id: senderId,
      name: toBuyer ? row.seller.name : row.buyer.name,
      studentVerifiedUntil: null,
      verifiedCollege: null,
    });
    await this.notifications.notify({
      userId: recipientId,
      category: 'MESSAGES',
      type: 'marketplace.message',
      title: `${sender.displayName} about "${row.listing.title}"`,
      message: body.length > 140 ? `${body.slice(0, 137)}…` : body,
      link: `/messages/${conversationId}`,
    });
  }

  private toConversation(row: ConversationRow, userId: string, hidden: string[]): Conversation {
    const buyer = row.buyerId === userId;
    const other = buyer ? row.seller : row.buyer;
    return {
      id: row.id,
      listing: {
        id: row.listing.id,
        title: row.listing.title,
        price: row.listing.price,
        status: row.listing.status,
        coverImageUrl: row.listing.images[0]?.imageUrl ?? null,
      },
      other: toMemberSummary(other),
      role: buyer ? 'BUYER' : 'SELLER',
      lastMessage: row.messages[0]?.body ?? null,
      lastMessageAt: row.lastMessageAt.toISOString(),
      unread: isUnread(row, userId),
      blocked: hidden.includes(other.id),
    };
  }
}

function isUnread(
  row: {
    buyerId: string;
    lastMessageAt: Date;
    buyerLastReadAt: Date | null;
    sellerLastReadAt: Date | null;
  },
  userId: string,
): boolean {
  const lastRead = row.buyerId === userId ? row.buyerLastReadAt : row.sellerLastReadAt;
  return lastRead === null || lastRead < row.lastMessageAt;
}
