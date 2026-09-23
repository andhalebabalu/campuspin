import { Injectable } from '@nestjs/common';
import {
  MAX_PLACE_IMAGES,
  RESERVED_PLACE_SLUGS,
  type AddPlaceImageRequest,
  type AdminPlace,
  type AdminPlaceListItem,
  type AdminListPlacesQuery,
  type CreatePlaceRequest,
  type PlaceActionRequest,
  type PlaceHourInput,
  type PlacePriceOptionInput,
  type PriceUnit,
  type UpdatePlaceImageRequest,
  type UpdatePlaceRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { pickFreeSlug, randomizedSlug, slugRoot } from '../../common/utils/slug.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CollegeProximityService } from '../colleges/college-proximity.service.js';
import { planVerificationChange } from '../colleges/college-rules.js';
import { type AdminRow, toAdminListItem, toAdminPlace } from './place-mappers.js';
import { ADMIN_ORDER_BY, ADMIN_SELECT, searchFilter } from './place-queries.js';
import {
  type PriceSummary,
  affectsProximity,
  diffFields,
  planStatusChange,
  summarizePrices,
} from './place-rules.js';

/** Recomputing links for a dense area can take a moment; the default 5 s would be too tight. */
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/** The scalar columns a staff edit may change. Status, verification and ownership are absent on purpose. */
type PlacePatch = Partial<
  Pick<
    AdminRow,
    | 'name'
    | 'slug'
    | 'description'
    | 'address'
    | 'city'
    | 'state'
    | 'country'
    | 'latitude'
    | 'longitude'
    | 'phone'
    | 'email'
    | 'website'
    | 'googleMapsUrl'
  >
>;

interface CategoryCheck {
  parentId: string | null;
  status: string;
  defaultPriceUnit: PriceUnit | null;
}

const NULL_ISLAND_MESSAGE = 'Coordinates 0, 0 are not a real location';

const slugTaken = () =>
  AppException.conflict('CONFLICT', 'This slug is already used by another place.');
const staleWrite = () =>
  AppException.conflict(
    'CONFLICT',
    'This place was changed by someone else. Reload it and try again.',
  );

/**
 * Everything staff can do to the place directory. Every change is one database transaction that
 * also writes its `audit_logs` row, so an action and its record commit or fail together.
 */
@Injectable()
export class AdminPlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proximity: CollegeProximityService,
    private readonly audit: AuditService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────────────────────────

  async list(query: AdminListPlacesQuery): Promise<Paginated<AdminPlaceListItem>> {
    const where: Prisma.PlaceWhereInput = {
      ...searchFilter(query),
      ...(query.status ? { status: query.status } : {}),
      ...(query.verification ? { verificationStatus: query.verification } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.place.count({ where }),
      this.prisma.place.findMany({
        where,
        orderBy: ADMIN_ORDER_BY[query.sort],
        ...pageWindow(query),
        select: ADMIN_SELECT,
      }),
    ]);
    return Paginated.of(rows.map(toAdminListItem), { page: query.page, limit: query.limit, total });
  }

  async get(id: string): Promise<AdminPlace> {
    return toAdminPlace(await this.load(id));
  }

  // ── Creating and editing ───────────────────────────────────────────────────────────────────────

  async create(
    dto: CreatePlaceRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    const categories = await this.loadAndValidateCategories(dto.categoryIds);
    await this.assertAmenitiesExist(dto.amenityIds);
    if (isNullIsland(dto.latitude, dto.longitude)) {
      throw AppException.validation({ latitude: [NULL_ISLAND_MESSAGE] });
    }

    const [primaryCategoryId] = dto.categoryIds;
    const primaryCategory = primaryCategoryId ? categories.get(primaryCategoryId) : undefined;
    if (!primaryCategory) {
      throw new Error(
        'createPlaceRequestSchema guarantees categoryIds has at least one valid entry',
      );
    }
    const priceSummary = summarizePrices(dto.priceOptions, primaryCategory.defaultPriceUnit);

    if (dto.slug && (await this.isSlugTaken(dto.slug))) throw slugTaken();
    let slug = dto.slug ?? (await this.freeSlug(dto.name));

    for (let attempt = 0; ; attempt += 1) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const place = await tx.place.create({
            data: {
              name: dto.name,
              slug,
              description: dto.description ?? null,
              address: dto.address,
              city: dto.city,
              state: dto.state,
              country: dto.country,
              latitude: dto.latitude,
              longitude: dto.longitude,
              phone: dto.phone ?? null,
              email: dto.email ?? null,
              website: dto.website ?? null,
              googleMapsUrl: dto.googleMapsUrl ?? null,
              status: dto.status,
              publishedAt: dto.status === 'ACTIVE' ? new Date() : null,
              ...priceSummary,
              // Verification and the demo flag are never set by the caller.
              createdById: actor.id,
              categories: {
                create: dto.categoryIds.map((categoryId, index) => ({
                  categoryId,
                  isPrimary: index === 0,
                })),
              },
              amenities: { create: dto.amenityIds.map((amenityId) => ({ amenityId })) },
              hours: { create: dto.hours.map(toHourData) },
              priceOptions: { create: dto.priceOptions.map(toPriceOptionData) },
            },
            select: { id: true },
          });
          const proximity = await this.proximity.recomputeForPlace(place.id, tx);
          await this.record(
            'PLACE_CREATED',
            place.id,
            actor,
            client,
            {
              status: dto.status,
              slug,
              categoriesLinked: dto.categoryIds.length,
              ...proximityMetadata(proximity),
            },
            tx,
          );
          return place.id;
        }, TX_OPTIONS);
        return toAdminPlace(await this.load(id));
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // Only `slug` is unique. A slug the caller chose is theirs to change; a generated one lost a
        // race with another request, so try another.
        if (dto.slug || attempt >= 2) throw slugTaken();
        slug = randomizedSlug(
          slugRoot(dto.name, { reservedWords: RESERVED_PLACE_SLUGS, fallback: 'place' }),
        );
      }
    }
  }

  async update(
    id: string,
    dto: UpdatePlaceRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    const current = await this.load(id);
    const { slug, categoryIds, amenityIds, hours, priceOptions, ...fields } = dto;
    const patch: PlacePatch = { ...fields };

    if (slug !== undefined && slug !== current.slug) {
      if (current.status !== 'DRAFT') {
        throw AppException.conflict(
          'CONFLICT',
          'The slug of a published place cannot be changed: it is part of its public link.',
        );
      }
      if (await this.isSlugTaken(slug)) throw slugTaken();
      patch.slug = slug;
    }

    const latitude = patch.latitude ?? current.latitude;
    const longitude = patch.longitude ?? current.longitude;
    if (isNullIsland(latitude, longitude))
      throw AppException.validation({ latitude: [NULL_ISLAND_MESSAGE] });

    let categories: Map<string, CategoryCheck> | undefined;
    if (categoryIds !== undefined) {
      categories = await this.loadAndValidateCategories(categoryIds);
    }
    if (amenityIds !== undefined) await this.assertAmenitiesExist(amenityIds);

    const priceSummary = await this.priceSummaryIfNeeded(
      current,
      categoryIds,
      categories,
      priceOptions,
    );

    const changed = diffFields(current, patch);
    const listChanges = [
      ...(categoryIds !== undefined ? ['categoryIds'] : []),
      ...(amenityIds !== undefined ? ['amenityIds'] : []),
      ...(hours !== undefined ? ['hours'] : []),
      ...(priceOptions !== undefined ? ['priceOptions'] : []),
    ];
    if (changed.length === 0 && listChanges.length === 0) return toAdminPlace(current); // nothing to save

    try {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(patch).length > 0 || priceSummary) {
          await tx.place.update({ where: { id }, data: { ...patch, ...priceSummary } });
        }
        if (categoryIds !== undefined) {
          await tx.placeCategory.deleteMany({ where: { placeId: id } });
          await tx.placeCategory.createMany({
            data: categoryIds.map((categoryId, index) => ({
              placeId: id,
              categoryId,
              isPrimary: index === 0,
            })),
          });
        }
        if (amenityIds !== undefined) {
          await tx.placeAmenity.deleteMany({ where: { placeId: id } });
          if (amenityIds.length > 0) {
            await tx.placeAmenity.createMany({
              data: amenityIds.map((amenityId) => ({ placeId: id, amenityId })),
            });
          }
        }
        if (hours !== undefined) {
          await tx.placeHour.deleteMany({ where: { placeId: id } });
          if (hours.length > 0) {
            await tx.placeHour.createMany({
              data: hours.map((hour) => ({ placeId: id, ...toHourData(hour) })),
            });
          }
        }
        if (priceOptions !== undefined) {
          await tx.placePriceOption.deleteMany({ where: { placeId: id } });
          if (priceOptions.length > 0) {
            await tx.placePriceOption.createMany({
              data: priceOptions.map((price, index) => ({
                placeId: id,
                ...toPriceOptionData(price, index),
              })),
            });
          }
        }

        const proximity = affectsProximity(changed)
          ? await this.proximity.recomputeForPlace(id, tx)
          : undefined;
        await this.record(
          'PLACE_UPDATED',
          id,
          actor,
          client,
          {
            changedFields: [...changed, ...listChanges],
            ...(changed.includes('latitude') || changed.includes('longitude')
              ? {
                  coordinates: {
                    from: { latitude: current.latitude, longitude: current.longitude },
                    to: { latitude, longitude },
                  },
                }
              : {}),
            ...(proximity ? proximityMetadata(proximity) : {}),
          },
          tx,
        );
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw slugTaken();
      throw error;
    }
    return toAdminPlace(await this.load(id));
  }

  // ── Publishing and verification ────────────────────────────────────────────────────────────────

  async setStatus(
    id: string,
    action: 'activate' | 'deactivate',
    body: PlaceActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    const current = await this.load(id);
    const plan = planStatusChange(action, current.status);
    if (plan.kind === 'invalid') throw AppException.conflict('CONFLICT', plan.message);
    if (plan.kind === 'noop') return toAdminPlace(current);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.place.updateMany({
        where: { id, status: current.status },
        data: {
          status: plan.to,
          ...(plan.to === 'ACTIVE' && !current.publishedAt ? { publishedAt: new Date() } : {}),
        },
      });
      if (claimed.count !== 1) throw staleWrite();
      await this.record(
        action === 'activate' ? 'PLACE_ACTIVATED' : 'PLACE_DEACTIVATED',
        id,
        actor,
        client,
        { from: current.status, to: plan.to, ...reasonOf(body) },
        tx,
      );
    }, TX_OPTIONS);
    return toAdminPlace(await this.load(id));
  }

  async setVerification(
    id: string,
    action: 'verify' | 'unverify',
    body: PlaceActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    const current = await this.load(id);
    const plan = planVerificationChange(action, current.verificationStatus);
    if (plan.kind === 'noop') return toAdminPlace(current);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.place.updateMany({
        where: { id, verificationStatus: current.verificationStatus },
        data: {
          verificationStatus: plan.to,
          lastVerifiedAt: plan.to === 'VERIFIED' ? new Date() : current.lastVerifiedAt,
          verifiedById: plan.to === 'VERIFIED' ? actor.id : null,
        },
      });
      if (claimed.count !== 1) throw staleWrite();
      await this.record(
        action === 'verify' ? 'PLACE_VERIFIED' : 'PLACE_UNVERIFIED',
        id,
        actor,
        client,
        { from: current.verificationStatus, to: plan.to, ...reasonOf(body) },
        tx,
      );
    }, TX_OPTIONS);
    return toAdminPlace(await this.load(id));
  }

  // ── Images (links only: the bytes live elsewhere) ──────────────────────────────────────────────

  async addImage(
    id: string,
    dto: AddPlaceImageRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.placeImage.count({ where: { placeId: id } });
      if (count >= MAX_PLACE_IMAGES) {
        throw AppException.conflict(
          'CONFLICT',
          `A place can have at most ${MAX_PLACE_IMAGES} images. Remove one first.`,
        );
      }
      const isCover = dto.isCover ?? count === 0;
      if (isCover)
        await tx.placeImage.updateMany({
          where: { placeId: id, isCover: true },
          data: { isCover: false },
        });
      const sortOrder =
        dto.sortOrder ??
        ((await tx.placeImage.aggregate({ where: { placeId: id }, _max: { sortOrder: true } }))._max
          .sortOrder ?? -1) + 1;
      const image = await tx.placeImage.create({
        data: {
          placeId: id,
          imageUrl: dto.imageUrl,
          altText: dto.altText ?? null,
          isCover,
          sortOrder,
        },
        select: { id: true },
      });
      await this.record('PLACE_IMAGE_ADDED', id, actor, client, { imageId: image.id, isCover }, tx);
    }, TX_OPTIONS);
    return toAdminPlace(await this.load(id));
  }

  async updateImage(
    id: string,
    imageId: string,
    dto: UpdatePlaceImageRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    const image = await this.findImage(id, imageId);
    const changed = diffFields(image, dto);
    if (changed.length === 0) return toAdminPlace(await this.load(id));

    await this.prisma.$transaction(async (tx) => {
      if (dto.isCover === true) {
        await tx.placeImage.updateMany({
          where: { placeId: id, isCover: true, id: { not: imageId } },
          data: { isCover: false },
        });
      }
      await tx.placeImage.update({ where: { id: imageId }, data: dto });
      await this.record(
        'PLACE_IMAGE_UPDATED',
        id,
        actor,
        client,
        { imageId, changedFields: changed },
        tx,
      );
    }, TX_OPTIONS);
    return toAdminPlace(await this.load(id));
  }

  async removeImage(
    id: string,
    imageId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminPlace> {
    await this.findImage(id, imageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.placeImage.delete({ where: { id: imageId } });
      await this.record('PLACE_IMAGE_REMOVED', id, actor, client, { imageId }, tx);
    }, TX_OPTIONS);
    return toAdminPlace(await this.load(id));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async load(id: string): Promise<AdminRow> {
    const place = await this.prisma.place.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!place) throw AppException.notFound('Place not found');
    return place;
  }

  private async findImage(placeId: string, imageId: string) {
    // Scoped to the place in the URL: an image id from another place is a 404, not an edit.
    const image = await this.prisma.placeImage.findFirst({
      where: { id: imageId, placeId },
      select: { id: true, altText: true, isCover: true, sortOrder: true },
    });
    if (!image) throw AppException.notFound('Image not found');
    return image;
  }

  private async isSlugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.place.count({ where: { slug } })) > 0;
  }

  private async freeSlug(name: string): Promise<string> {
    const root = slugRoot(name, { reservedWords: RESERVED_PLACE_SLUGS, fallback: 'place' });
    const rows = await this.prisma.place.findMany({
      where: { slug: { startsWith: root } },
      select: { slug: true },
    });
    return pickFreeSlug(root, new Set(rows.map((row) => row.slug)));
  }

  /** Every id must exist, be a LEAF category (not a group) and be ACTIVE. */
  private async loadAndValidateCategories(
    categoryIds: readonly string[],
  ): Promise<Map<string, CategoryCheck>> {
    const rows = await this.prisma.category.findMany({
      where: { id: { in: [...categoryIds] } },
      select: { id: true, parentId: true, status: true, defaultPriceUnit: true },
    });
    const found = new Map(rows.map((row) => [row.id, row]));
    for (const categoryId of categoryIds) {
      const row = found.get(categoryId);
      if (!row)
        throw AppException.validation({ categoryIds: [`Category ${categoryId} does not exist`] });
      if (row.parentId === null) {
        throw AppException.validation({
          categoryIds: [`Category ${categoryId} is a group; pick one of its categories`],
        });
      }
      if (row.status !== 'ACTIVE') {
        throw AppException.validation({ categoryIds: [`Category ${categoryId} is not active`] });
      }
    }
    return found;
  }

  private async assertAmenitiesExist(amenityIds: readonly string[]): Promise<void> {
    if (amenityIds.length === 0) return;
    const count = await this.prisma.amenity.count({
      where: { id: { in: [...amenityIds] }, status: 'ACTIVE' },
    });
    if (count !== amenityIds.length) {
      throw AppException.validation({
        amenityIds: ['One or more amenities do not exist or are not active'],
      });
    }
  }

  /** Recomputes priceMin/Max/Unit only when the primary category or the price options may have changed. */
  private async priceSummaryIfNeeded(
    current: AdminRow,
    categoryIds: readonly string[] | undefined,
    validatedCategories: Map<string, CategoryCheck> | undefined,
    priceOptions: readonly PlacePriceOptionInput[] | undefined,
  ): Promise<PriceSummary | undefined> {
    if (categoryIds === undefined && priceOptions === undefined) return undefined;

    const primaryCategoryId = categoryIds
      ? categoryIds[0]
      : current.categories.find((row) => row.isPrimary)?.category.id;
    const defaultUnit = primaryCategoryId
      ? (validatedCategories?.get(primaryCategoryId)?.defaultPriceUnit ??
        (
          await this.prisma.category.findUnique({
            where: { id: primaryCategoryId },
            select: { defaultPriceUnit: true },
          })
        )?.defaultPriceUnit ??
        null)
      : null;
    const effectivePrices =
      priceOptions ??
      current.priceOptions.map((price) => ({ amount: price.amount, unit: price.unit }));
    return summarizePrices(effectivePrices, defaultUnit);
  }

  private record(
    action: AuditAction,
    placeId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      { action, actorId: actor.id, entityType: 'Place', entityId: placeId, metadata, client },
      tx,
    );
  }
}

function isNullIsland(latitude: number, longitude: number): boolean {
  return latitude === 0 && longitude === 0;
}

function toHourData(hour: PlaceHourInput) {
  return {
    dayOfWeek: hour.dayOfWeek,
    openTime: hour.openTime ?? null,
    closeTime: hour.closeTime ?? null,
    isClosed: hour.isClosed,
    is24Hours: hour.is24Hours,
    slotLabel: hour.slotLabel ?? null,
    sortOrder: hour.sortOrder,
  };
}

function toPriceOptionData(price: PlacePriceOptionInput, sortOrder: number) {
  return {
    label: price.label,
    amount: price.amount,
    unit: price.unit,
    note: price.note ?? null,
    sortOrder,
  };
}

function proximityMetadata(result: { collegesAffected: number }): Prisma.InputJsonObject {
  return { collegesAffected: result.collegesAffected };
}

function reasonOf(body: PlaceActionRequest): Prisma.InputJsonObject {
  return body?.reason ? { reason: body.reason } : {};
}
