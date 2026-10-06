import { Injectable } from '@nestjs/common';
import {
  COLLEGE_MANAGEMENT,
  COLLEGE_MANAGEMENT_LABELS,
  COLLEGE_STREAMS,
  COLLEGE_STREAM_LABELS,
  type CollegeCard,
  type CollegeDetail,
  type CollegeFacets,
  type CollegeManagement,
  type CollegeNearby,
  type CollegeStream,
  type ListCollegesQuery,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { type CardRow, toCollegeCard, toCollegeDetail } from './college-mappers.js';
import {
  CARD_SELECT,
  DETAIL_SELECT,
  countActivePlaces,
  idOrSlugFilter,
  searchFilter,
} from './college-queries.js';
import { collegeProfile, metersFrom, sortCards, summarizeNearby } from './college-rules.js';
import { rankColleges } from './college-search.js';

/**
 * The public college directory. Only ACTIVE colleges exist here: drafts and deactivated colleges
 * are invisible (a 404, not a 403, so their existence is not revealed).
 */
@Injectable()
export class CollegesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCollegesQuery): Promise<Paginated<CollegeCard>> {
    // `q` is matched in memory (see college-search.ts); the database only narrows by city.
    const where: Prisma.CollegeWhereInput = {
      status: 'ACTIVE',
      ...searchFilter({ city: query.city }),
    };
    const point =
      query.lat !== undefined && query.lng !== undefined
        ? { latitude: query.lat, longitude: query.lng }
        : undefined;
    const card = (
      row: CardRow & { latitude: number; longitude: number },
      counts: Map<string, number>,
    ) => toCollegeCard(row, counts.get(row.id) ?? 0, metersFrom(point, row));

    const term = query.q?.trim();
    if (term) return this.search(term, query, where, card);
    // Without a search there is nothing to rank by: relevance means by name.
    const sort = query.sort === 'relevance' ? 'name' : query.sort;

    // Streams and management are derived from each college's name and description, so they can only
    // be filtered after reading: every match is read, filtered, ordered and then cut into a page (a
    // directory has hundreds of colleges, not millions).
    if (query.stream.length > 0 || query.management.length > 0) {
      const rows = await this.prisma.college.findMany({
        where,
        select: { ...CARD_SELECT, latitude: true, longitude: true, createdAt: true },
      });
      const counts = await countActivePlaces(
        this.prisma,
        rows.map((row) => row.id),
      );
      const created = new Map(rows.map((row) => [row.id, row.createdAt.getTime()]));
      const matching = rows
        .map((row) => card(row, counts))
        .filter(
          (college) =>
            (query.stream.length === 0 ||
              college.streams.some((stream) => query.stream.includes(stream))) &&
            (query.management.length === 0 ||
              (college.management !== null && query.management.includes(college.management))),
        );
      const ordered =
        sort === 'nearest' || sort === 'popular'
          ? sortCards(matching, sort)
          : sort === 'newest'
            ? [...matching].sort(
                (a, b) =>
                  (created.get(b.id) ?? 0) - (created.get(a.id) ?? 0) || b.id.localeCompare(a.id),
              )
            : [...matching].sort(
                (a, b) =>
                  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
                  a.id.localeCompare(b.id),
              );
      const { skip, take } = pageWindow(query);
      return Paginated.of(ordered.slice(skip, skip + take), {
        page: query.page,
        limit: query.limit,
        total: ordered.length,
      });
    }

    // Name and newest are plain ORDER BYs, so the database can page.
    if (sort === 'name' || sort === 'newest') {
      const orderBy: Prisma.CollegeOrderByWithRelationInput[] =
        sort === 'name'
          ? [{ name: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];
      const [total, rows] = await Promise.all([
        this.prisma.college.count({ where }),
        this.prisma.college.findMany({
          where,
          orderBy,
          ...pageWindow(query),
          select: { ...CARD_SELECT, latitude: true, longitude: true },
        }),
      ]);
      const counts = await countActivePlaces(
        this.prisma,
        rows.map((row) => row.id),
      );
      return Paginated.of(
        rows.map((row) => card(row, counts)),
        { page: query.page, limit: query.limit, total },
      );
    }

    // Nearest (distance from a point) and popular (a count) cannot be expressed as a portable ORDER
    // BY, so every match is read (a directory has hundreds of colleges, not millions), ordered here
    // and then cut into the requested page.
    const rows = await this.prisma.college.findMany({
      where,
      select: { ...CARD_SELECT, latitude: true, longitude: true },
    });
    const counts = await countActivePlaces(
      this.prisma,
      rows.map((row) => row.id),
    );
    const ordered = sortCards(
      rows.map((row) => card(row, counts)),
      sort,
    );
    const { skip, take } = pageWindow(query);
    return Paginated.of(ordered.slice(skip, skip + take), {
      page: query.page,
      limit: query.limit,
      total: ordered.length,
    });
  }

  /**
   * A forgiving search: every active college (in the city, if one is given) is scored against the
   * words, best match first unless another order is asked for. Hundreds of rows, read once.
   */
  private async search(
    term: string,
    query: ListCollegesQuery,
    where: Prisma.CollegeWhereInput,
    card: (
      row: CardRow & { latitude: number; longitude: number },
      counts: Map<string, number>,
    ) => CollegeCard,
  ): Promise<Paginated<CollegeCard>> {
    const rows = await this.prisma.college.findMany({
      where,
      select: { ...CARD_SELECT, address: true, latitude: true, longitude: true, createdAt: true },
    });
    const ranked = rankColleges(term, rows);
    const counts = await countActivePlaces(
      this.prisma,
      ranked.map((match) => match.college.id),
    );
    const created = new Map(rows.map((row) => [row.id, row.createdAt.getTime()]));
    const matching = ranked
      .map((match) => card(match.college, counts))
      .filter(
        (college) =>
          (query.stream.length === 0 ||
            college.streams.some((stream) => query.stream.includes(stream))) &&
          (query.management.length === 0 ||
            (college.management !== null && query.management.includes(college.management))),
      );
    const ordered =
      query.sort === 'nearest' || query.sort === 'popular'
        ? sortCards(matching, query.sort)
        : query.sort === 'newest'
          ? [...matching].sort(
              (a, b) =>
                (created.get(b.id) ?? 0) - (created.get(a.id) ?? 0) || b.id.localeCompare(a.id),
            )
          : query.sort === 'name'
            ? [...matching].sort(
                (a, b) =>
                  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
                  a.id.localeCompare(b.id),
              )
            : matching; // relevance: already best first
    const { skip, take } = pageWindow(query);
    return Paginated.of(ordered.slice(skip, skip + take), {
      page: query.page,
      limit: query.limit,
      total: ordered.length,
    });
  }

  async getOne(idOrSlug: string): Promise<CollegeDetail> {
    const college = await this.prisma.college.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(idOrSlug) },
      select: DETAIL_SELECT,
    });
    if (!college) throw AppException.notFound('College not found');

    const counts = await countActivePlaces(this.prisma, [college.id]);
    return toCollegeDetail(college, counts.get(college.id) ?? 0);
  }

  /** Counts for the directory's filters and header, over every active college. */
  async facets(): Promise<CollegeFacets> {
    const rows = await this.prisma.college.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true, description: true, city: true, verificationStatus: true },
    });
    const cities = new Map<string, number>();
    const streams = new Map<CollegeStream, number>(COLLEGE_STREAMS.map((key) => [key, 0]));
    const management = new Map<CollegeManagement, number>(
      COLLEGE_MANAGEMENT.map((key) => [key, 0]),
    );
    for (const row of rows) {
      cities.set(row.city, (cities.get(row.city) ?? 0) + 1);
      const profile = collegeProfile(row.name, row.description);
      for (const stream of profile.streams) streams.set(stream, (streams.get(stream) ?? 0) + 1);
      if (profile.management) {
        management.set(profile.management, (management.get(profile.management) ?? 0) + 1);
      }
    }
    return {
      total: rows.length,
      verified: rows.filter((row) => row.verificationStatus === 'VERIFIED').length,
      cities: [...cities.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      streams: COLLEGE_STREAMS.map((key) => ({
        key,
        label: COLLEGE_STREAM_LABELS[key],
        count: streams.get(key) ?? 0,
      })),
      management: COLLEGE_MANAGEMENT.map((key) => ({
        key,
        label: COLLEGE_MANAGEMENT_LABELS[key],
        count: management.get(key) ?? 0,
      })),
    };
  }

  /** What is around the college, by category: the same links the college hub's place list uses. */
  async nearby(idOrSlug: string): Promise<CollegeNearby> {
    const college = await this.prisma.college.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(idOrSlug) },
      select: { id: true },
    });
    if (!college) throw AppException.notFound('College not found');

    const links = await this.prisma.collegePlace.findMany({
      where: { collegeId: college.id, mode: { not: 'EXCLUDED' }, place: { status: 'ACTIVE' } },
      select: {
        distanceMeters: true,
        place: {
          select: {
            slug: true,
            name: true,
            categories: {
              where: { isPrimary: true },
              take: 1,
              select: {
                category: {
                  select: {
                    slug: true,
                    name: true,
                    icon: true,
                    parent: { select: { slug: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return {
      categories: summarizeNearby(
        links.map((link) => {
          const category = link.place.categories[0]?.category ?? null;
          return {
            distanceMeters: link.distanceMeters,
            place: {
              slug: link.place.slug,
              name: link.place.name,
              category: category
                ? {
                    slug: category.slug,
                    name: category.name,
                    icon: category.icon,
                    parentSlug: category.parent?.slug ?? null,
                  }
                : null,
            },
          };
        }),
      ),
    };
  }
}
