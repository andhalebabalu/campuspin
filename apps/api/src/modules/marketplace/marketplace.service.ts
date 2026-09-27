import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LISTING_LIFETIME_DAYS,
  type CreateListingRequest,
  type ListListingsQuery,
  type ListMyListingsQuery,
  type Listing,
  type ListingCard,
  type ListingSellerAction,
  type MarketplaceReportRequest,
  type ReportReceipt,
  type UpdateListingRequest,
} from '@platform/contracts';
import { boundingBox } from '../../common/geo/bounding-box.js';
import { distanceMeters } from '../../common/geo/haversine.js';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppConfig } from '../../infra/config/app-config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { ImageStorage } from '../../infra/storage/image-storage.js';
import { BlocksService } from '../safety/blocks.service.js';
import { ReportsService } from '../safety/reports.service.js';
import { DEFAULT_SETTINGS } from '../students/profile.service.js';
import { StudentAccessService, toMemberSummary } from '../students/student-access.service.js';
import { ListingCreditsService } from './listing-credits.service.js';
import {
  BROWSABLE_STATUSES,
  type Shopper,
  audienceWhere,
  effectiveStatus,
  inAudience,
  nextStatus,
  roundedKm,
} from './marketplace-rules.js';

/** A seller may post at most this many listings in any 24 hours (spam brake). */
export const LISTINGS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const COLLEGE_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  latitude: true,
  longitude: true,
} as const;

const LISTING_INCLUDE = {
  college: { select: COLLEGE_SELECT },
  images: { orderBy: { sortOrder: 'asc' }, select: { imageUrl: true } },
  seller: {
    select: {
      id: true,
      name: true,
      studentVerifiedUntil: true,
      verifiedCollege: { select: { id: true, slug: true, name: true } },
    },
  },
} as const satisfies Prisma.MarketplaceListingInclude;

type ListingRow = Prisma.MarketplaceListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

const expiryFrom = (now: Date) => new Date(now.getTime() + LISTING_LIFETIME_DAYS * DAY_MS);

/**
 * The cross-college marketplace. Only verified students buy and sell. A listing's college is the
 * seller's verified college (never the request's), and who sees it follows the seller's choice:
 * their college, colleges within the nearby radius, or the whole city.
 */
@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly students: StudentAccessService,
    private readonly blocks: BlocksService,
    private readonly reports: ReportsService,
    private readonly images: ImageStorage,
    private readonly credits: ListingCreditsService,
  ) {}

  /** The verified student behind a request, with the colleges near theirs. */
  async shopper(userId: string): Promise<Shopper & { latitude: number; longitude: number }> {
    const student = await this.students.requireVerified(userId);
    const center = { latitude: student.collegeLatitude, longitude: student.collegeLongitude };
    const radiusMeters = this.config.students.marketplaceNearbyKm * 1000;
    const box = boundingBox(center, radiusMeters);
    const [college, candidates, hidden] = await Promise.all([
      this.prisma.college.findUniqueOrThrow({
        where: { id: student.college.id },
        select: { city: true },
      }),
      this.prisma.college.findMany({
        where: {
          latitude: { gte: box.minLatitude, lte: box.maxLatitude },
          ...(box.minLongitude !== null && box.maxLongitude !== null
            ? { longitude: { gte: box.minLongitude, lte: box.maxLongitude } }
            : {}),
        },
        select: { id: true, latitude: true, longitude: true },
      }),
      this.blocks.hiddenFrom(userId),
    ]);
    const nearbyCollegeIds = candidates
      .filter((candidate) => distanceMeters(center, candidate) <= radiusMeters)
      .map((candidate) => candidate.id);
    return {
      userId,
      collegeId: student.college.id,
      city: college.city,
      nearbyCollegeIds: [...new Set([student.college.id, ...nearbyCollegeIds])],
      hidden,
      ...center,
    };
  }

  // ── Browsing ───────────────────────────────────────────────────────────────────────────────────

  async browse(userId: string, query: ListListingsQuery): Promise<Paginated<ListingCard>> {
    const shopper = await this.shopper(userId);
    const where: Prisma.MarketplaceListingWhereInput = {
      AND: [
        audienceWhere(shopper, query.scope),
        { status: { in: [...BROWSABLE_STATUSES] }, expiresAt: { gt: new Date() } },
        ...(shopper.hidden.length > 0 ? [{ sellerId: { notIn: shopper.hidden } }] : []),
        ...(query.category ? [{ category: query.category }] : []),
        ...(query.condition ? [{ condition: query.condition }] : []),
        ...(query.q ? [{ title: { contains: query.q } }] : []),
        ...(query.minPrice !== undefined ? [{ price: { gte: query.minPrice } }] : []),
        ...(query.maxPrice !== undefined ? [{ price: { lte: query.maxPrice } }] : []),
      ],
    };
    const orderBy: Prisma.MarketplaceListingOrderByWithRelationInput[] =
      query.sort === 'price_asc'
        ? [{ price: 'asc' }, { id: 'desc' }]
        : query.sort === 'price_desc'
          ? [{ price: 'desc' }, { id: 'desc' }]
          : [{ id: 'desc' }];
    const [total, rows] = await Promise.all([
      this.prisma.marketplaceListing.count({ where }),
      this.prisma.marketplaceListing.findMany({
        where,
        include: LISTING_INCLUDE,
        orderBy,
        ...pageWindow(query),
      }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toCard(row, shopper)),
      { ...query, total },
    );
  }

  async get(userId: string, listingId: string): Promise<Listing> {
    const row = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: LISTING_INCLUDE,
    });
    if (!row || row.status === 'REMOVED') throw AppException.notFound('Listing not found');

    if (row.sellerId === userId) return this.toListing(row, null, { mine: true });

    const shopper = await this.shopper(userId);
    const status = effectiveStatus(row.status, row.expiresAt);
    const visible =
      (status === 'ACTIVE' || status === 'RESERVED' || status === 'SOLD') &&
      inAudience(row, shopper);
    if (!visible) throw AppException.notFound('Listing not found');

    const [settings, conversation] = await Promise.all([
      this.prisma.userSettings.findUnique({
        where: { userId: row.sellerId },
        select: { allowMarketplaceMessages: true },
      }),
      this.prisma.conversation.findUnique({
        where: { listingId_buyerId: { listingId, buyerId: userId } },
        select: { id: true },
      }),
    ]);
    const allows = (settings ?? DEFAULT_SETTINGS).allowMarketplaceMessages;
    return this.toListing(row, shopper, {
      mine: false,
      canMessage: allows && status !== 'SOLD',
      conversationId: conversation?.id ?? null,
    });
  }

  async mine(userId: string, query: ListMyListingsQuery): Promise<Paginated<ListingCard>> {
    const now = new Date();
    // EXPIRED is mostly computed from the end date, so the filter has to say the same thing.
    const statusWhere: Prisma.MarketplaceListingWhereInput =
      query.status === 'EXPIRED'
        ? {
            OR: [
              { status: 'EXPIRED' },
              { status: { in: ['ACTIVE', 'RESERVED'] }, expiresAt: { lte: now } },
            ],
          }
        : query.status === 'ACTIVE' || query.status === 'RESERVED'
          ? { status: query.status, expiresAt: { gt: now } }
          : query.status
            ? { status: query.status }
            : { status: { not: 'REMOVED' } };
    const where: Prisma.MarketplaceListingWhereInput = { sellerId: userId, ...statusWhere };
    const [total, rows] = await Promise.all([
      this.prisma.marketplaceListing.count({ where }),
      this.prisma.marketplaceListing.findMany({
        where,
        include: LISTING_INCLUDE,
        orderBy: { id: 'desc' },
        ...pageWindow(query),
      }),
    ]);
    return Paginated.of(
      rows.map((row) => this.toCard(row, null)),
      { ...query, total },
    );
  }

  // ── Selling ────────────────────────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateListingRequest): Promise<Listing> {
    const student = await this.students.requireVerified(userId);
    const now = new Date();
    const recent = await this.prisma.marketplaceListing.count({
      where: { sellerId: userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
    if (recent >= LISTINGS_PER_DAY) {
      throw new AppException(
        'RATE_LIMITED',
        `You can list ${LISTINGS_PER_DAY} items a day. Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.assertOwnImages(dto.images);

    // Free listings first, then credits (when a super admin has switched limits on).
    const row = await this.prisma.$transaction(async (tx) => {
      const creditsSpent = await this.credits.chargeFor(tx, userId, now);
      const created = await tx.marketplaceListing.create({
        data: {
          sellerId: userId,
          collegeId: student.college.id,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          condition: dto.condition,
          price: dto.price,
          negotiable: dto.negotiable,
          quantity: dto.quantity,
          location: dto.location ?? null,
          visibility: dto.visibility,
          expiresAt: expiryFrom(now),
          creditsSpent,
          images: {
            create: dto.images.map((imageUrl, sortOrder) => ({ imageUrl, sortOrder })),
          },
        },
        include: LISTING_INCLUDE,
      });
      await this.credits.spend(tx, userId, created.id, creditsSpent);
      return created;
    });
    return this.toListing(row, null, { mine: true });
  }

  async update(userId: string, listingId: string, dto: UpdateListingRequest): Promise<Listing> {
    const current = await this.ownListing(userId, listingId);
    if (current.status === 'HIDDEN') {
      throw AppException.conflict('CONFLICT', 'A moderator is reviewing this listing.');
    }
    if (dto.images) this.assertOwnImages(dto.images);

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.images) {
        await tx.marketplaceListingImage.deleteMany({ where: { listingId } });
        await tx.marketplaceListingImage.createMany({
          data: dto.images.map((imageUrl, sortOrder) => ({ listingId, imageUrl, sortOrder })),
        });
      }
      return tx.marketplaceListing.update({
        where: { id: listingId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.negotiable !== undefined ? { negotiable: dto.negotiable } : {}),
          ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
        },
        include: LISTING_INCLUDE,
      });
    });
    return this.toListing(row, null, { mine: true });
  }

  /** reserve / unreserve / sold / renew. */
  async act(userId: string, listingId: string, action: ListingSellerAction): Promise<Listing> {
    const current = await this.ownListing(userId, listingId);
    const status = effectiveStatus(current.status, current.expiresAt);
    const next = nextStatus(status, action);
    if (!next) {
      throw AppException.conflict('CONFLICT', `A ${status.toLowerCase()} listing cannot do that.`);
    }
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      // Bringing back an expired free listing takes a free slot again when limits count live
      // listings; a listing that was paid for stays paid.
      const renewCharge =
        action === 'renew' && status === 'EXPIRED' && current.creditsSpent === 0
          ? await this.credits.renewalCharge(tx, userId, now)
          : 0;
      const updated = await tx.marketplaceListing.update({
        where: { id: listingId },
        data: {
          status: next,
          ...(action === 'renew' ? { expiresAt: expiryFrom(now) } : {}),
          ...(action === 'sold' ? { soldAt: now } : {}),
          ...(renewCharge > 0 ? { creditsSpent: renewCharge } : {}),
        },
        include: LISTING_INCLUDE,
      });
      await this.credits.spend(tx, userId, listingId, renewCharge);
      return updated;
    });
    return this.toListing(row, null, { mine: true });
  }

  /** The seller takes the listing down. Final; it stays in the table for chats and reports. */
  async remove(userId: string, listingId: string): Promise<void> {
    await this.ownListing(userId, listingId);
    await this.prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { status: 'REMOVED' },
    });
  }

  async report(
    userId: string,
    listingId: string,
    dto: MarketplaceReportRequest,
    client: ClientContext,
  ): Promise<ReportReceipt> {
    const listing = await this.get(userId, listingId);
    if (listing.mine) {
      throw AppException.badRequest('BAD_REQUEST', 'You cannot report your own listing.');
    }
    return this.reports.create(
      { reporterId: userId, targetType: 'MARKETPLACE_LISTING', targetId: listingId, ...dto },
      client,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  /** Listing photos must be files this platform stored, never arbitrary outside URLs. */
  private assertOwnImages(urls: readonly string[]) {
    const bad = urls.findIndex((url) => !this.images.owns(url));
    if (bad !== -1) {
      throw AppException.validation({
        [`images.${bad}`]: ['Upload the photo here first (POST /uploads/images)'],
      });
    }
  }

  private async ownListing(userId: string, listingId: string) {
    const row = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { sellerId: true, status: true, expiresAt: true, creditsSpent: true },
    });
    if (!row || row.sellerId !== userId || row.status === 'REMOVED') {
      throw AppException.notFound('Listing not found');
    }
    return row;
  }

  private distanceKm(
    row: ListingRow,
    shopper: { collegeId: string; latitude: number; longitude: number } | null,
  ) {
    if (!shopper || row.collegeId === shopper.collegeId) return null;
    return roundedKm(distanceMeters(shopper, row.college));
  }

  private toCard(
    row: ListingRow,
    shopper: (Shopper & { latitude: number; longitude: number }) | null,
  ): ListingCard {
    const { id, slug, name, city } = row.college;
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      condition: row.condition,
      price: row.price,
      negotiable: row.negotiable,
      status: effectiveStatus(row.status, row.expiresAt),
      coverImageUrl: row.images[0]?.imageUrl ?? null,
      college: { id, slug, name },
      city,
      distanceKm: this.distanceKm(row, shopper),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toListing(
    row: ListingRow,
    shopper: (Shopper & { latitude: number; longitude: number }) | null,
    extra: { mine: boolean; canMessage?: boolean; conversationId?: string | null },
  ): Listing {
    return {
      ...this.toCard(row, shopper),
      description: row.description,
      quantity: row.quantity,
      location: row.location,
      visibility: row.visibility,
      images: row.images.map((image) => image.imageUrl),
      seller: toMemberSummary(row.seller),
      mine: extra.mine,
      canMessage: extra.canMessage ?? false,
      conversationId: extra.conversationId ?? null,
      moderationNote: extra.mine ? row.moderationNote : null,
      expiresAt: row.expiresAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
