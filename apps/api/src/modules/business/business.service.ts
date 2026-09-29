import { Injectable } from '@nestjs/common';
import type {
  BusinessDashboard,
  BusinessLead,
  BusinessListing,
  BusinessProfile,
  BusinessReview,
  CreateSubmissionRequest,
  ListBusinessLeadsQuery,
  ListBusinessReviewsQuery,
  PlaceSubmission,
  UpdateBusinessProfileRequest,
  UpdateLeadRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { diffFields } from '../../common/utils/diff-fields.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { toPublicReview } from '../reviews/review-mappers.js';
import { PUBLIC_REVIEW_SELECT, visibleOnly } from '../reviews/review-queries.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import {
  LEAD_SELECT,
  LISTING_SELECT,
  PROFILE_SELECT,
  toBusinessLead,
  toBusinessListing,
  toBusinessProfile,
} from './business-mappers.js';

const noBusiness = () =>
  AppException.notFound('No business profile is linked to this account yet.');
const leadNotFound = () => AppException.notFound('Enquiry not found');

/** A listing counts as "under review" while its place waits for staff (or is still a draft). */
const UNDER_REVIEW_STATUSES = new Set(['PENDING', 'DRAFT']);

/**
 * The business owner's dashboard. Every method first resolves the caller's OWN business (owner or
 * member) and scopes all reads and writes to it: an id from another business is simply "not found".
 */
@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submissions: SubmissionsService,
    private readonly audit: AuditService,
  ) {}

  async dashboard(actor: AuthenticatedUser): Promise<BusinessDashboard> {
    const businessProfileId = await this.businessIdOf(actor);
    const [profile, places, enquiriesTotal, enquiriesNew] = await Promise.all([
      this.prisma.businessProfile.findUniqueOrThrow({
        where: { id: businessProfileId },
        select: PROFILE_SELECT,
      }),
      this.prisma.place.findMany({
        where: { businessProfileId },
        select: { status: true, ratingAverage: true, ratingCount: true },
      }),
      this.prisma.lead.count({ where: { businessProfileId } }),
      this.prisma.lead.count({ where: { businessProfileId, status: 'NEW' } }),
    ]);

    const live = places.filter((place) => place.status === 'ACTIVE');
    const reviewCount = live.reduce((sum, place) => sum + place.ratingCount, 0);
    const ratingSum = live.reduce((sum, place) => sum + place.ratingAverage * place.ratingCount, 0);

    return {
      profile: toBusinessProfile(profile),
      stats: {
        listings: {
          total: places.length,
          live: live.length,
          underReview: places.filter((place) => UNDER_REVIEW_STATUSES.has(place.status)).length,
          rejected: places.filter((place) => place.status === 'REJECTED').length,
        },
        enquiries: { total: enquiriesTotal, new: enquiriesNew },
        reviews: {
          count: reviewCount,
          averageRating: reviewCount > 0 ? Math.round((ratingSum / reviewCount) * 10) / 10 : 0,
        },
      },
    };
  }

  async updateProfile(
    dto: UpdateBusinessProfileRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BusinessProfile> {
    const businessProfileId = await this.businessIdOf(actor);
    const current = await this.prisma.businessProfile.findUniqueOrThrow({
      where: { id: businessProfileId },
      select: PROFILE_SELECT,
    });
    // The slug never follows a rename: links already shared on WhatsApp must keep working.
    const changed = diffFields({ ...current, categoryId: current.category?.id ?? null }, dto);
    if (changed.length === 0) return toBusinessProfile(current);
    if (dto.categoryId && changed.includes('categoryId')) {
      const found = await this.prisma.category.count({
        where: { id: dto.categoryId, status: 'ACTIVE' },
      });
      if (found === 0) {
        throw AppException.validation({ categoryId: ['Choose a category from the list'] });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.businessProfile.update({
        where: { id: businessProfileId },
        data: dto,
        select: PROFILE_SELECT,
      });
      await this.audit.record(
        {
          action: 'BUSINESS_PROFILE_UPDATED',
          actorId: actor.id,
          entityType: 'BusinessProfile',
          entityId: businessProfileId,
          metadata: { fields: changed },
          client,
        },
        tx,
      );
      return row;
    });
    return toBusinessProfile(updated);
  }

  /** Every place of the business, whatever its status, newest first. */
  async listings(actor: AuthenticatedUser): Promise<BusinessListing[]> {
    const businessProfileId = await this.businessIdOf(actor);
    const [rows, leadCounts] = await Promise.all([
      this.prisma.place.findMany({
        where: { businessProfileId },
        select: LISTING_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.lead.groupBy({
        by: ['placeId', 'status'],
        where: { businessProfileId },
        _count: { _all: true },
      }),
    ]);

    const counts = new Map<string, { total: number; new: number }>();
    for (const group of leadCounts) {
      const entry = counts.get(group.placeId) ?? { total: 0, new: 0 };
      entry.total += group._count._all;
      if (group.status === 'NEW') entry.new += group._count._all;
      counts.set(group.placeId, entry);
    }
    return rows.map((row) => toBusinessListing(row, counts.get(row.id) ?? { total: 0, new: 0 }));
  }

  /**
   * A new listing goes through exactly the same pipeline as a student's suggestion (duplicate
   * detection, a PENDING place, staff review), linked to the business: owners cannot bypass review.
   */
  async createListing(
    dto: CreateSubmissionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<PlaceSubmission> {
    const businessProfileId = await this.businessIdOf(actor);
    return this.submissions.create(dto, actor, client, { businessProfileId });
  }

  async leads(
    query: ListBusinessLeadsQuery,
    actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessLead>> {
    const businessProfileId = await this.businessIdOf(actor);
    const where: Prisma.LeadWhereInput = {
      businessProfileId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.placeId ? { placeId: query.placeId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select: LEAD_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.lead.count({ where }),
    ]);
    return Paginated.of(rows.map(toBusinessLead), { ...query, total });
  }

  async updateLead(
    id: string,
    dto: UpdateLeadRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BusinessLead> {
    const businessProfileId = await this.businessIdOf(actor);
    const current = await this.prisma.lead.findFirst({
      where: { id, businessProfileId },
      select: { status: true },
    });
    if (!current) throw leadNotFound();
    if (current.status === dto.status) {
      return toBusinessLead(
        await this.prisma.lead.findUniqueOrThrow({ where: { id }, select: LEAD_SELECT }),
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { status: dto.status },
        select: LEAD_SELECT,
      });
      await this.audit.record(
        {
          action: 'LEAD_STATUS_CHANGED',
          actorId: actor.id,
          entityType: 'Lead',
          entityId: id,
          metadata: { from: current.status, to: dto.status },
          client,
        },
        tx,
      );
      return updated;
    });
    return toBusinessLead(row);
  }

  /** Published reviews of the business's places, newest first. */
  async reviews(
    query: ListBusinessReviewsQuery,
    actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessReview>> {
    const businessProfileId = await this.businessIdOf(actor);
    const where: Prisma.ReviewWhereInput = {
      ...visibleOnly,
      place: { businessProfileId },
      ...(query.placeId ? { placeId: query.placeId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: {
          ...PUBLIC_REVIEW_SELECT,
          place: { select: { id: true, slug: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.review.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({
        ...toPublicReview(row),
        place: { id: row.place.id, slug: row.place.slug, name: row.place.name },
      })),
      { ...query, total },
    );
  }

  /** The business the caller owns or belongs to (the oldest one, should there be several). */
  private async businessIdOf(actor: AuthenticatedUser): Promise<string> {
    const business = await this.prisma.businessProfile.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!business) throw noBusiness();
    return business.id;
  }
}
