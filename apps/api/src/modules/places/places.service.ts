import { Injectable } from '@nestjs/common';
import type { ListPlacesQuery, PlaceCard, PlaceDetail } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { CapabilitiesService } from '../capabilities/capabilities.service.js';
import { type CardRow, toPlaceCard, toPlaceDetail } from './place-mappers.js';
import {
  CARD_ORDER_BY,
  CARD_SELECT,
  DETAIL_SELECT,
  NEARBY_COLLEGES_SELECT,
  PLACE_BUSINESS_SELECT,
  NEWEST_ORDER_BY,
  idOrSlugFilter,
  priceFilter,
  ratingFilter,
  relevanceOrderBy,
  searchFilter,
  verifiedFilter,
} from './place-queries.js';
import { metersFrom, rankByRelevance, sortCards } from './place-rules.js';

interface Point {
  latitude: number;
  longitude: number;
}

/**
 * The public place directory. Only ACTIVE places exist here: drafts, pending, rejected and
 * deactivated places are invisible (a 404, not a 403, so their existence is not revealed).
 */
@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async list(query: ListPlacesQuery): Promise<Paginated<PlaceCard>> {
    const college = query.collegeSlug ? await this.activeCollege(query.collegeSlug) : null;
    const categoryIds = query.categorySlug ? await this.categoryIds(query.categorySlug) : undefined;

    const where: Prisma.PlaceWhereInput = {
      status: 'ACTIVE',
      ...searchFilter(query),
      ...priceFilter(query),
      ...verifiedFilter(query.verified),
      ...ratingFilter(query.minRating),
      ...(categoryIds ? { categories: { some: { categoryId: { in: categoryIds } } } } : {}),
      ...(college
        ? { colleges: { some: { collegeId: college.id, mode: { not: 'EXCLUDED' } } } }
        : {}),
    };
    // Explicit lat/lng always wins; otherwise a college context supplies "distance from there".
    const point: Point | undefined =
      query.lat !== undefined && query.lng !== undefined
        ? { latitude: query.lat, longitude: query.lng }
        : (college ?? undefined);
    const card = (row: CardRow & Point) => toPlaceCard(row, metersFrom(point, row));

    // Name and newest are plain ORDER BYs, so the database can page.
    if (query.sort === 'name' || query.sort === 'newest') {
      const orderBy = query.sort === 'name' ? CARD_ORDER_BY : NEWEST_ORDER_BY;
      const [total, rows] = await Promise.all([
        this.prisma.place.count({ where }),
        this.prisma.place.findMany({
          where,
          orderBy,
          ...pageWindow(query),
          select: { ...CARD_SELECT, latitude: true, longitude: true },
        }),
      ]);
      return Paginated.of(rows.map(card), { page: query.page, limit: query.limit, total });
    }

    if (query.sort === 'relevance') {
      // `q` is required by the schema for this sort. MySQL's native FULLTEXT relevance gives the
      // base order (a portable ORDER BY, but not one whose score Prisma can hand back as a value to
      // blend with distance), so every match is read in that order and `rankByRelevance` blends it
      // with proximity and verified status before the page is cut.
      if (!query.q) throw new Error('listPlacesQuerySchema guarantees q when sort=relevance');
      const rows = await this.prisma.place.findMany({
        where,
        orderBy: relevanceOrderBy(query.q),
        select: { ...CARD_SELECT, latitude: true, longitude: true },
      });
      const ranked = rankByRelevance(rows.map(card), point !== undefined);
      const { skip, take } = pageWindow(query);
      return Paginated.of(ranked.slice(skip, skip + take), {
        page: query.page,
        limit: query.limit,
        total: ranked.length,
      });
    }

    // Nearest (distance from a point), cheapest (comparing across a nullable column) and rating (a
    // Bayesian score computed from two columns) cannot be expressed as a portable ORDER BY, so every match is read (a directory has hundreds to a few
    // thousand places, not millions), ordered here and then cut into the requested page.
    const rows = await this.prisma.place.findMany({
      where,
      select: { ...CARD_SELECT, latitude: true, longitude: true },
    });
    const ordered = sortCards(rows.map(card), query.sort);
    const { skip, take } = pageWindow(query);
    return Paginated.of(ordered.slice(skip, skip + take), {
      page: query.page,
      limit: query.limit,
      total: ordered.length,
    });
  }

  async getOne(idOrSlug: string): Promise<PlaceDetail> {
    const place = await this.prisma.place.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(idOrSlug) },
      select: {
        ...DETAIL_SELECT,
        businessProfile: PLACE_BUSINESS_SELECT,
        colleges: NEARBY_COLLEGES_SELECT,
      },
    });
    if (!place) throw AppException.notFound('Place not found');
    const detail = toPlaceDetail(place, place.businessProfile, place.colleges);
    // Enquiries only for businesses that take them (their type or staff decide).
    if (detail.acceptsEnquiries && place.businessProfileId) {
      detail.acceptsEnquiries = await this.capabilities.has(place.businessProfileId, ['ENQUIRY']);
    }
    return detail;
  }

  private async activeCollege(slug: string): Promise<Point & { id: string }> {
    const college = await this.prisma.college.findFirst({
      where: { status: 'ACTIVE', slug: slug.trim().toLowerCase() },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!college) throw AppException.notFound('College not found');
    return college;
  }

  /**
   * The category to filter by. A group (e.g. `services`) stands for all its active children, since
   * places only link to leaf categories.
   */
  private async categoryIds(slug: string): Promise<string[]> {
    const category = await this.prisma.category.findFirst({
      where: { status: 'ACTIVE', slug: slug.trim().toLowerCase() },
      select: { id: true, children: { where: { status: 'ACTIVE' }, select: { id: true } } },
    });
    if (!category) throw AppException.notFound('Category not found');
    return [category.id, ...category.children.map((child) => child.id)];
  }
}
