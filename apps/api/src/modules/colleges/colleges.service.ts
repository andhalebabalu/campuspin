import { Injectable } from '@nestjs/common';
import type { CollegeCard, CollegeDetail, ListCollegesQuery } from '@platform/contracts';
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
import { metersFrom, sortCards } from './college-rules.js';

/**
 * The public college directory. Only ACTIVE colleges exist here: drafts and deactivated colleges
 * are invisible (a 404, not a 403, so their existence is not revealed).
 */
@Injectable()
export class CollegesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCollegesQuery): Promise<Paginated<CollegeCard>> {
    const where: Prisma.CollegeWhereInput = { status: 'ACTIVE', ...searchFilter(query) };
    const point =
      query.lat !== undefined && query.lng !== undefined
        ? { latitude: query.lat, longitude: query.lng }
        : undefined;
    const card = (
      row: CardRow & { latitude: number; longitude: number },
      counts: Map<string, number>,
    ) => toCollegeCard(row, counts.get(row.id) ?? 0, metersFrom(point, row));

    // Name and newest are plain ORDER BYs, so the database can page.
    if (query.sort === 'name' || query.sort === 'newest') {
      const orderBy: Prisma.CollegeOrderByWithRelationInput[] =
        query.sort === 'name'
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
      query.sort,
    );
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
}
