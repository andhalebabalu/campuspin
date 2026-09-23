import { Injectable } from '@nestjs/common';
import type { CategoryDetail, CategoryGroup } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { toCategoryDetail, toCategoryGroup } from './category-mappers.js';
import {
  CATEGORY_ORDER_BY,
  DETAIL_SELECT,
  PUBLIC_CHILDREN_SELECT,
  SUMMARY_SELECT,
  idOrSlugFilter,
} from './category-queries.js';

/**
 * The public category catalogue. Only ACTIVE groups and ACTIVE children of an ACTIVE group are
 * visible: an inactive group hides its children too, exactly like a deactivated college hides its
 * places, so the tree a visitor sees never has a dead end.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(): Promise<CategoryGroup[]> {
    const groups = await this.prisma.category.findMany({
      where: { parentId: null, status: 'ACTIVE' },
      orderBy: CATEGORY_ORDER_BY,
      select: { ...SUMMARY_SELECT, children: PUBLIC_CHILDREN_SELECT },
    });
    return groups.map(toCategoryGroup);
  }

  async getOne(idOrSlug: string): Promise<CategoryDetail> {
    const category = await this.prisma.category.findFirst({
      where: {
        ...idOrSlugFilter(idOrSlug),
        status: 'ACTIVE',
        // A leaf whose group is hidden is hidden too.
        OR: [{ parentId: null }, { parent: { status: 'ACTIVE' } }],
      },
      select: DETAIL_SELECT,
    });
    if (!category) throw AppException.notFound('Category not found');
    return toCategoryDetail(category);
  }
}
