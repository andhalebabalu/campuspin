import { Injectable } from '@nestjs/common';
import type {
  AdminCategory,
  AdminCategoryGroup,
  CategoryActionRequest,
  CreateCategoryAttributeRequest,
  CreateCategoryRatingDimensionRequest,
  CreateCategoryRequest,
  UpdateCategoryAttributeRequest,
  UpdateCategoryRatingDimensionRequest,
  UpdateCategoryRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { diffFields } from '../../common/utils/diff-fields.js';
import { pickFreeSlug, randomizedSlug, slugRoot } from '../../common/utils/slug.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  isForeignKeyRestrictError,
  isUniqueConstraintError,
} from '../../infra/database/prisma-errors.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { type AdminDetailRow, toAdminCategory, toAdminCategoryGroup } from './category-mappers.js';
import { checkOptionsMatchDataType, planActiveStatusChange } from './category-rules.js';
import {
  ADMIN_CHILDREN_SELECT,
  ADMIN_DETAIL_SELECT,
  ADMIN_SUMMARY_SELECT,
  ATTRIBUTE_SELECT,
  CATEGORY_ORDER_BY,
  RATING_DIMENSION_SELECT,
  fromOptions,
  toOptions,
} from './category-queries.js';

const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

const slugTaken = () =>
  AppException.conflict('CONFLICT', 'This slug is already used by another category.');
const staleWrite = () =>
  AppException.conflict(
    'CONFLICT',
    'This category was changed by someone else. Reload it and try again.',
  );
const invalidParent = () =>
  AppException.validation({
    parentId: ['This must be the id of an existing top-level category group.'],
  });
const groupsHaveNoAttributes = () =>
  AppException.badRequest(
    'BAD_REQUEST',
    'A group cannot have attributes or rating dimensions; use one of its categories.',
  );

function reasonOf(body: CategoryActionRequest): Prisma.InputJsonObject {
  return body?.reason ? { reason: body.reason } : {};
}

/** Only the fields a caller can patch, so `diffFields` never sees `attributes`/`ratingDimensions`. */
type CategoryPatch = Partial<
  Pick<AdminDetailRow, 'name' | 'slug' | 'description' | 'icon' | 'sortOrder' | 'defaultPriceUnit'>
>;

/**
 * Everything staff can do to the category catalogue: the tree itself, its attributes and its
 * rating dimensions. Every change is one transaction that also writes its `audit_logs` row.
 * Categories are never deleted, only deactivated, matching the college directory's philosophy.
 */
@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────────────────────────

  async tree(): Promise<AdminCategoryGroup[]> {
    const groups = await this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: CATEGORY_ORDER_BY,
      select: { ...ADMIN_SUMMARY_SELECT, children: ADMIN_CHILDREN_SELECT },
    });
    return groups.map(toAdminCategoryGroup);
  }

  async get(id: string): Promise<AdminCategory> {
    return toAdminCategory(await this.load(id));
  }

  // ── Creating and editing ───────────────────────────────────────────────────────────────────────

  async create(
    dto: CreateCategoryRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    if (dto.parentId) await this.assertIsTopLevelGroup(dto.parentId);
    await this.assertNameAvailable(dto.name, dto.parentId ?? null);
    if (dto.slug && (await this.isSlugTaken(dto.slug))) throw slugTaken();

    let slug = dto.slug ?? (await this.freeSlug(dto.name));
    for (let attempt = 0; ; attempt += 1) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const category = await tx.category.create({
            data: {
              name: dto.name,
              slug,
              description: dto.description ?? null,
              icon: dto.icon ?? null,
              parentId: dto.parentId ?? null,
              sortOrder: dto.sortOrder,
              defaultPriceUnit: dto.defaultPriceUnit ?? null,
            },
            select: { id: true },
          });
          await this.record(
            'CATEGORY_CREATED',
            category.id,
            actor,
            client,
            { slug, parentId: dto.parentId ?? null },
            tx,
          );
          return category.id;
        }, TX_OPTIONS);
        return this.get(id);
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        if (dto.slug || attempt >= 2) throw slugTaken();
        slug = randomizedSlug(
          slugRoot(dto.name, { reservedWords: [], fallback: 'category', minLength: 2 }),
        );
      }
    }
  }

  async update(
    id: string,
    dto: UpdateCategoryRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const current = await this.load(id);
    const { slug, ...fields } = dto;
    const patch: CategoryPatch = { ...fields };

    if (slug !== undefined && slug !== current.slug) {
      if (await this.isSlugTaken(slug)) throw slugTaken();
      patch.slug = slug;
    }

    const changed = diffFields(current, patch);
    if (changed.length === 0) return toAdminCategory(current);

    if (changed.includes('name'))
      await this.assertNameAvailable(patch.name ?? current.name, current.parentId, id);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.category.update({ where: { id }, data: patch });
        await this.record('CATEGORY_UPDATED', id, actor, client, { changedFields: changed }, tx);
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw slugTaken();
      throw error;
    }
    return this.get(id);
  }

  async setStatus(
    id: string,
    action: 'activate' | 'deactivate',
    body: CategoryActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const current = await this.load(id);
    const plan = planActiveStatusChange(action, current.status);
    if (plan.kind === 'noop') return toAdminCategory(current);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.category.updateMany({
        where: { id, status: current.status },
        data: { status: plan.to },
      });
      if (claimed.count !== 1) throw staleWrite();
      await this.record(
        action === 'activate' ? 'CATEGORY_ACTIVATED' : 'CATEGORY_DEACTIVATED',
        id,
        actor,
        client,
        { from: current.status, to: plan.to, ...reasonOf(body) },
        tx,
      );
    }, TX_OPTIONS);
    return this.get(id);
  }

  // ── Attributes ─────────────────────────────────────────────────────────────────────────────────

  async addAttribute(
    categoryId: string,
    dto: CreateCategoryAttributeRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const category = await this.load(categoryId);
    if (category.parentId === null) throw groupsHaveNoAttributes();

    try {
      await this.prisma.$transaction(async (tx) => {
        const attribute = await tx.categoryAttribute.create({
          data: {
            categoryId,
            key: dto.key,
            name: dto.name,
            dataType: dto.dataType,
            required: dto.required,
            filterable: dto.filterable,
            searchable: dto.searchable,
            unit: dto.unit ?? null,
            options: fromOptions(dto.options ?? null),
            helpText: dto.helpText ?? null,
            sortOrder: dto.sortOrder,
          },
          select: { id: true },
        });
        await this.record(
          'CATEGORY_ATTRIBUTE_ADDED',
          categoryId,
          actor,
          client,
          { attributeId: attribute.id, key: dto.key },
          tx,
        );
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppException.conflict(
          'CONFLICT',
          'This key is already used by another attribute of this category.',
        );
      }
      throw error;
    }
    return this.get(categoryId);
  }

  async updateAttribute(
    categoryId: string,
    attributeId: string,
    dto: UpdateCategoryAttributeRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const attribute = await this.findAttribute(categoryId, attributeId);

    const mergedOptions = dto.options === undefined ? toOptions(attribute.options) : dto.options;
    const problem = checkOptionsMatchDataType(attribute.dataType, mergedOptions);
    if (problem) throw AppException.validation({ options: [problem.message] });

    const scalarPatch = {
      name: dto.name,
      required: dto.required,
      filterable: dto.filterable,
      searchable: dto.searchable,
      unit: dto.unit,
      helpText: dto.helpText,
      sortOrder: dto.sortOrder,
    };
    const changed = diffFields(attribute, scalarPatch);
    if (dto.options !== undefined) changed.push('options');
    if (changed.length === 0) return this.get(categoryId);

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryAttribute.update({
        where: { id: attributeId },
        data: { ...scalarPatch, options: fromOptions(dto.options) },
      });
      await this.record(
        'CATEGORY_ATTRIBUTE_UPDATED',
        categoryId,
        actor,
        client,
        { attributeId, changedFields: changed },
        tx,
      );
    }, TX_OPTIONS);
    return this.get(categoryId);
  }

  async removeAttribute(
    categoryId: string,
    attributeId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const attribute = await this.findAttribute(categoryId, attributeId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.categoryAttribute.delete({ where: { id: attributeId } });
        await this.record(
          'CATEGORY_ATTRIBUTE_REMOVED',
          categoryId,
          actor,
          client,
          { attributeId, key: attribute.key },
          tx,
        );
      }, TX_OPTIONS);
    } catch (error) {
      if (isForeignKeyRestrictError(error)) {
        throw AppException.conflict(
          'CONFLICT',
          'This attribute has values on existing places and cannot be removed.',
        );
      }
      throw error;
    }
    return this.get(categoryId);
  }

  // ── Rating dimensions ──────────────────────────────────────────────────────────────────────────

  async addRatingDimension(
    categoryId: string,
    dto: CreateCategoryRatingDimensionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const category = await this.load(categoryId);
    if (category.parentId === null) throw groupsHaveNoAttributes();

    try {
      await this.prisma.$transaction(async (tx) => {
        const dimension = await tx.categoryRatingDimension.create({
          data: { categoryId, key: dto.key, label: dto.label, sortOrder: dto.sortOrder },
          select: { id: true },
        });
        await this.record(
          'CATEGORY_RATING_DIMENSION_ADDED',
          categoryId,
          actor,
          client,
          { dimensionId: dimension.id, key: dto.key },
          tx,
        );
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppException.conflict(
          'CONFLICT',
          'This key is already used by another rating dimension of this category.',
        );
      }
      throw error;
    }
    return this.get(categoryId);
  }

  async updateRatingDimension(
    categoryId: string,
    dimensionId: string,
    dto: UpdateCategoryRatingDimensionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const dimension = await this.findRatingDimension(categoryId, dimensionId);
    const changed = diffFields(dimension, dto);
    if (changed.length === 0) return this.get(categoryId);

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryRatingDimension.update({ where: { id: dimensionId }, data: dto });
      await this.record(
        'CATEGORY_RATING_DIMENSION_UPDATED',
        categoryId,
        actor,
        client,
        { dimensionId, changedFields: changed },
        tx,
      );
    }, TX_OPTIONS);
    return this.get(categoryId);
  }

  async removeRatingDimension(
    categoryId: string,
    dimensionId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCategory> {
    const dimension = await this.findRatingDimension(categoryId, dimensionId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.categoryRatingDimension.delete({ where: { id: dimensionId } });
        await this.record(
          'CATEGORY_RATING_DIMENSION_REMOVED',
          categoryId,
          actor,
          client,
          { dimensionId, key: dimension.key },
          tx,
        );
      }, TX_OPTIONS);
    } catch (error) {
      if (isForeignKeyRestrictError(error)) {
        throw AppException.conflict(
          'CONFLICT',
          'This rating dimension has reviews and cannot be removed.',
        );
      }
      throw error;
    }
    return this.get(categoryId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async load(id: string): Promise<AdminDetailRow> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: ADMIN_DETAIL_SELECT,
    });
    if (!category) throw AppException.notFound('Category not found');
    return category;
  }

  private async assertIsTopLevelGroup(id: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({
      where: { id },
      select: { parentId: true },
    });
    if (!parent || parent.parentId !== null) throw invalidParent();
  }

  private async findAttribute(categoryId: string, attributeId: string) {
    // Scoped to the category in the URL: an attribute id from another category is a 404, not an edit.
    const attribute = await this.prisma.categoryAttribute.findFirst({
      where: { id: attributeId, categoryId },
      select: ATTRIBUTE_SELECT,
    });
    if (!attribute) throw AppException.notFound('Attribute not found');
    return attribute;
  }

  private async findRatingDimension(categoryId: string, dimensionId: string) {
    const dimension = await this.prisma.categoryRatingDimension.findFirst({
      where: { id: dimensionId, categoryId },
      select: RATING_DIMENSION_SELECT,
    });
    if (!dimension) throw AppException.notFound('Rating dimension not found');
    return dimension;
  }

  private async isSlugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.category.count({ where: { slug } })) > 0;
  }

  private async freeSlug(name: string): Promise<string> {
    const root = slugRoot(name, { reservedWords: [], fallback: 'category', minLength: 2 });
    const rows = await this.prisma.category.findMany({
      where: { slug: { startsWith: root } },
      select: { slug: true },
    });
    return pickFreeSlug(root, new Set(rows.map((row) => row.slug)));
  }

  /** The same name in the same parent (or among top-level groups) is almost certainly a duplicate. */
  private async assertNameAvailable(
    name: string,
    parentId: string | null,
    exceptId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.category.findFirst({
      where: { name: { equals: name }, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (duplicate) {
      throw AppException.conflict(
        'CONFLICT',
        parentId
          ? `A category named "${name}" already exists in this group.`
          : `A group named "${name}" already exists.`,
      );
    }
  }

  private record(
    action: AuditAction,
    categoryId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      { action, actorId: actor.id, entityType: 'Category', entityId: categoryId, metadata, client },
      tx,
    );
  }
}
