import { Injectable } from '@nestjs/common';
import {
  type AddCollegeImageRequest,
  type AdminCollege,
  type AdminCollegeListItem,
  type AdminListCollegesQuery,
  type CollegeActionRequest,
  type CreateCollegeRequest,
  MAX_COLLEGE_IMAGES,
  type UpdateCollegeImageRequest,
  type UpdateCollegeRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CollegeProximityService, type ProximityResult } from './college-proximity.service.js';
import { type AdminRow, toAdminCollege, toAdminListItem } from './college-mappers.js';
import { ADMIN_SELECT, countActivePlaces, searchFilter } from './college-queries.js';
import {
  affectsProximity,
  diffFields,
  planStatusChange,
  planVerificationChange,
} from './college-rules.js';
import { pickFreeSlug, randomizedSlug, slugRoot } from './college-slug.js';

/** Recomputing links for a dense area can take a moment; the default 5 s would be too tight. */
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;
/** The columns a staff edit may change. Status, verification, demo flag and ownership are absent on purpose. */
type CollegePatch = Partial<
  Pick<
    AdminRow,
    | 'name'
    | 'slug'
    | 'shortName'
    | 'description'
    | 'address'
    | 'city'
    | 'state'
    | 'country'
    | 'latitude'
    | 'longitude'
    | 'serviceRadiusMeters'
    | 'website'
    | 'logoUrl'
    | 'coverImageUrl'
  >
>;

const NULL_ISLAND_MESSAGE = 'Coordinates 0, 0 are not a real location';

const slugTaken = () =>
  AppException.conflict('CONFLICT', 'This slug is already used by another college.');
const staleWrite = () =>
  AppException.conflict(
    'CONFLICT',
    'This college was changed by someone else. Reload it and try again.',
  );

/**
 * Everything staff can do to the college directory. Every change is one database transaction that
 * also writes its `audit_logs` row, so an action and its record commit or fail together.
 */
@Injectable()
export class AdminCollegesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proximity: CollegeProximityService,
    private readonly audit: AuditService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────────────────────────

  async list(query: AdminListCollegesQuery): Promise<Paginated<AdminCollegeListItem>> {
    const where: Prisma.CollegeWhereInput = {
      ...searchFilter(query),
      ...(query.status ? { status: query.status } : {}),
      ...(query.verification ? { verificationStatus: query.verification } : {}),
    };
    const orderBy: Prisma.CollegeOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : query.sort === 'updated'
          ? [{ updatedAt: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];

    const [total, rows] = await Promise.all([
      this.prisma.college.count({ where }),
      this.prisma.college.findMany({ where, orderBy, ...pageWindow(query), select: ADMIN_SELECT }),
    ]);
    const counts = await countActivePlaces(
      this.prisma,
      rows.map((row) => row.id),
    );
    return Paginated.of(
      rows.map((row) => toAdminListItem(row, counts.get(row.id) ?? 0)),
      { page: query.page, limit: query.limit, total },
    );
  }

  async get(id: string): Promise<AdminCollege> {
    return this.present(await this.load(id));
  }

  // ── Creating and editing ───────────────────────────────────────────────────────────────────────

  async create(
    dto: CreateCollegeRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    await this.assertNameAvailable(dto.name, dto.city);
    if (dto.slug && (await this.isSlugTaken(dto.slug))) throw slugTaken();

    let slug = dto.slug ?? (await this.freeSlug(dto.name));
    for (let attempt = 0; ; attempt += 1) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const college = await tx.college.create({
            data: {
              name: dto.name,
              slug,
              shortName: dto.shortName ?? null,
              description: dto.description ?? null,
              address: dto.address,
              city: dto.city,
              state: dto.state,
              country: dto.country,
              latitude: dto.latitude,
              longitude: dto.longitude,
              serviceRadiusMeters: dto.serviceRadiusMeters,
              website: dto.website ?? null,
              logoUrl: dto.logoUrl ?? null,
              coverImageUrl: dto.coverImageUrl ?? null,
              status: dto.status,
              // Verification and the demo flag are never set by the caller.
              createdById: actor.id,
            },
            select: { id: true },
          });
          const links = await this.proximity.recompute(college.id, tx);
          await this.record(
            'COLLEGE_CREATED',
            college.id,
            actor,
            client,
            { status: dto.status, slug, placesLinked: links.total },
            tx,
          );
          return college.id;
        }, TX_OPTIONS);
        return this.present(await this.load(id));
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // Only `slug` is unique. A slug the caller chose is theirs to change; a generated one
        // lost a race with another request, so try another.
        if (dto.slug || attempt >= 2) throw slugTaken();
        slug = randomizedSlug(slugRoot(dto.name));
      }
    }
  }

  async update(
    id: string,
    dto: UpdateCollegeRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    const current = await this.load(id);
    const { slug, ...fields } = dto;
    const patch: CollegePatch = { ...fields };

    if (slug !== undefined && slug !== current.slug) {
      if (current.status !== 'DRAFT') {
        throw AppException.conflict(
          'CONFLICT',
          'The slug of a published college cannot be changed: it is part of its public link.',
        );
      }
      if (await this.isSlugTaken(slug)) throw slugTaken();
      patch.slug = slug;
    }

    const changed = diffFields(current, patch);
    if (changed.length === 0) return this.present(current); // nothing to save, nothing to audit

    const latitude = patch.latitude ?? current.latitude;
    const longitude = patch.longitude ?? current.longitude;
    if (latitude === 0 && longitude === 0) {
      throw AppException.validation({ latitude: [NULL_ISLAND_MESSAGE] });
    }
    if (changed.includes('name') || changed.includes('city')) {
      await this.assertNameAvailable(patch.name ?? current.name, patch.city ?? current.city, id);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.college.update({ where: { id }, data: patch });
        const links = affectsProximity(changed)
          ? await this.proximity.recompute(id, tx)
          : undefined;
        await this.record(
          'COLLEGE_UPDATED',
          id,
          actor,
          client,
          {
            changedFields: changed,
            ...(changed.includes('latitude') || changed.includes('longitude')
              ? {
                  coordinates: {
                    from: { latitude: current.latitude, longitude: current.longitude },
                    to: { latitude, longitude },
                  },
                }
              : {}),
            ...(links ? proximityMetadata(links) : {}),
          },
          tx,
        );
      }, TX_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw slugTaken();
      throw error;
    }
    return this.present(await this.load(id));
  }

  // ── Publishing and verification ────────────────────────────────────────────────────────────────

  async setStatus(
    id: string,
    action: 'activate' | 'deactivate',
    body: CollegeActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    const current = await this.load(id);
    const plan = planStatusChange(action, current.status);
    if (plan.kind === 'invalid') throw AppException.conflict('CONFLICT', plan.message);
    if (plan.kind === 'noop') return this.present(current);

    await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: only if nobody changed the status since it was read.
      const claimed = await tx.college.updateMany({
        where: { id, status: current.status },
        data: { status: plan.to },
      });
      if (claimed.count !== 1) throw staleWrite();
      await this.record(
        action === 'activate' ? 'COLLEGE_ACTIVATED' : 'COLLEGE_DEACTIVATED',
        id,
        actor,
        client,
        { from: current.status, to: plan.to, ...reasonOf(body) },
        tx,
      );
    }, TX_OPTIONS);
    return this.present(await this.load(id));
  }

  async setVerification(
    id: string,
    action: 'verify' | 'unverify',
    body: CollegeActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    const current = await this.load(id);
    const plan = planVerificationChange(action, current.verificationStatus);
    if (plan.kind === 'noop') return this.present(current);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.college.updateMany({
        where: { id, verificationStatus: current.verificationStatus },
        data: { verificationStatus: plan.to },
      });
      if (claimed.count !== 1) throw staleWrite();
      await this.record(
        action === 'verify' ? 'COLLEGE_VERIFIED' : 'COLLEGE_UNVERIFIED',
        id,
        actor,
        client,
        { from: current.verificationStatus, to: plan.to, ...reasonOf(body) },
        tx,
      );
    }, TX_OPTIONS);
    return this.present(await this.load(id));
  }

  // ── Images (links only: the bytes live elsewhere) ──────────────────────────────────────────────

  async addImage(
    id: string,
    dto: AddCollegeImageRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.collegeImage.count({ where: { collegeId: id } });
      if (count >= MAX_COLLEGE_IMAGES) {
        throw AppException.conflict(
          'CONFLICT',
          `A college can have at most ${MAX_COLLEGE_IMAGES} images. Remove one first.`,
        );
      }
      const sortOrder =
        dto.sortOrder ??
        ((await tx.collegeImage.aggregate({ where: { collegeId: id }, _max: { sortOrder: true } }))
          ._max.sortOrder ?? -1) + 1;
      const image = await tx.collegeImage.create({
        data: { collegeId: id, imageUrl: dto.imageUrl, altText: dto.altText ?? null, sortOrder },
        select: { id: true },
      });
      await this.record('COLLEGE_IMAGE_ADDED', id, actor, client, { imageId: image.id }, tx);
    }, TX_OPTIONS);
    return this.present(await this.load(id));
  }

  async updateImage(
    id: string,
    imageId: string,
    dto: UpdateCollegeImageRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    const image = await this.findImage(id, imageId);
    const changed = diffFields(image, dto);
    if (changed.length === 0) return this.present(await this.load(id));

    await this.prisma.$transaction(async (tx) => {
      await tx.collegeImage.update({ where: { id: imageId }, data: dto });
      await this.record(
        'COLLEGE_IMAGE_UPDATED',
        id,
        actor,
        client,
        { imageId, changedFields: changed },
        tx,
      );
    }, TX_OPTIONS);
    return this.present(await this.load(id));
  }

  async removeImage(
    id: string,
    imageId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminCollege> {
    await this.findImage(id, imageId);
    await this.prisma.$transaction(async (tx) => {
      await tx.collegeImage.delete({ where: { id: imageId } });
      await this.record('COLLEGE_IMAGE_REMOVED', id, actor, client, { imageId }, tx);
    }, TX_OPTIONS);
    return this.present(await this.load(id));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async load(id: string): Promise<AdminRow> {
    const college = await this.prisma.college.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!college) throw AppException.notFound('College not found');
    return college;
  }

  private async present(row: AdminRow): Promise<AdminCollege> {
    const counts = await countActivePlaces(this.prisma, [row.id]);
    return toAdminCollege(row, counts.get(row.id) ?? 0);
  }

  private async findImage(collegeId: string, imageId: string) {
    // Scoped to the college in the URL: an image id from another college is a 404, not an edit.
    const image = await this.prisma.collegeImage.findFirst({
      where: { id: imageId, collegeId },
      select: { id: true, altText: true, sortOrder: true },
    });
    if (!image) throw AppException.notFound('Image not found');
    return image;
  }

  private async isSlugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.college.count({ where: { slug } })) > 0;
  }

  private async freeSlug(name: string): Promise<string> {
    const root = slugRoot(name);
    const rows = await this.prisma.college.findMany({
      where: { slug: { startsWith: root } },
      select: { slug: true },
    });
    return pickFreeSlug(root, new Set(rows.map((row) => row.slug)));
  }

  /** The same name in the same city is almost certainly a duplicate entry. */
  private async assertNameAvailable(name: string, city: string, exceptId?: string): Promise<void> {
    const duplicate = await this.prisma.college.findFirst({
      where: {
        name: { equals: name },
        city: { equals: city },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw AppException.conflict(
        'CONFLICT',
        `A college named "${name}" already exists in ${city}.`,
      );
    }
  }

  private record(
    action: AuditAction,
    collegeId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      { action, actorId: actor.id, entityType: 'College', entityId: collegeId, metadata, client },
      tx,
    );
  }
}

function proximityMetadata(links: ProximityResult): Prisma.InputJsonObject {
  return {
    placesLinked: links.total,
    linksCreated: links.created,
    linksRewritten: links.rewritten,
    linksRemoved: links.removed,
  };
}

function reasonOf(body: CollegeActionRequest): Prisma.InputJsonObject {
  return body?.reason ? { reason: body.reason } : {};
}
