import { Injectable } from '@nestjs/common';
import {
  RESERVED_PLACE_SLUGS,
  type CreateSubmissionRequest,
  type DuplicateCandidate,
  type DuplicateCheckRequest,
  type DuplicateCheckResponse,
  type PlaceSubmission,
  type PriceUnit,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { pickFreeSlug, randomizedSlug, slugRoot } from '../../common/utils/slug.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { RbacService } from '../auth/services/rbac.service.js';
import { CollegeProximityService } from '../colleges/college-proximity.service.js';
import { summarizePrices } from '../places/place-rules.js';
import { DuplicateDetectionService } from './duplicate-detection.service.js';
import { hasBlockingCandidate } from './duplicate-rules.js';
import { toPlaceSubmission } from './submission-mappers.js';
import { SUBMISSION_SELECT } from './submission-queries.js';

/** Recomputing college links can take a moment; the default 5 s would be too tight. */
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

const duplicateSuspected = (candidates: readonly DuplicateCandidate[]) =>
  new AppException(
    'DUPLICATE_PLACE_SUSPECTED',
    'This looks like it might already exist. Review the matches, or confirm this is a different place.',
    409,
    { candidates },
  );

interface CategoryCheck {
  id: string;
  parentId: string | null;
  status: string;
  defaultPriceUnit: PriceUnit | null;
}

/**
 * The student-facing half of submissions: check for duplicates before filling in details, submit a
 * new place, and check on a submission's status afterwards. Staff review lives in
 * `AdminSubmissionsService`.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicates: DuplicateDetectionService,
    private readonly proximity: CollegeProximityService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async duplicateCheck(dto: DuplicateCheckRequest): Promise<DuplicateCheckResponse> {
    const candidates = await this.duplicates.check(dto);
    return { candidates };
  }

  async create(
    dto: CreateSubmissionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<PlaceSubmission> {
    const category = await this.loadAndValidateCategory(dto.categoryId);
    if (dto.collegeId) await this.assertCollegeExists(dto.collegeId);

    const candidates = await this.duplicates.check(dto);
    if (hasBlockingCandidate(candidates) && !dto.confirmDifferent) {
      throw duplicateSuspected(candidates);
    }

    const priceSummary =
      dto.priceAmount !== undefined && dto.priceUnit !== undefined
        ? summarizePrices([{ amount: dto.priceAmount, unit: dto.priceUnit }], category.defaultPriceUnit)
        : { priceMin: null, priceMax: null, priceUnit: null };

    let slug = await this.freeSlug(dto.name);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const place = await tx.place.create({
            data: {
              name: dto.name,
              slug,
              description: dto.description ?? null,
              address: dto.address,
              city: dto.city ?? '',
              state: '',
              country: 'India',
              latitude: dto.latitude,
              longitude: dto.longitude,
              phone: dto.phone ?? null,
              status: 'PENDING',
              ...priceSummary,
              createdById: actor.id,
              categories: { create: [{ categoryId: dto.categoryId, isPrimary: true }] },
              priceOptions:
                dto.priceAmount !== undefined && dto.priceUnit !== undefined
                  ? {
                      create: [
                        {
                          label: 'Suggested price',
                          amount: dto.priceAmount,
                          unit: dto.priceUnit,
                          sortOrder: 0,
                        },
                      ],
                    }
                  : undefined,
              images: {
                create: dto.images.map((image, index) => ({
                  imageUrl: image.imageUrl,
                  altText: image.altText ?? null,
                  isCover: index === 0,
                  sortOrder: index,
                })),
              },
            },
            select: { id: true },
          });
          await this.proximity.recomputeForPlace(place.id, tx);

          const submission = await tx.placeSubmission.create({
            data: {
              name: dto.name,
              categoryId: dto.categoryId,
              collegeId: dto.collegeId ?? null,
              address: dto.address,
              city: dto.city ?? null,
              latitude: dto.latitude,
              longitude: dto.longitude,
              phone: dto.phone ?? null,
              priceAmount: dto.priceAmount ?? null,
              priceUnit: dto.priceUnit ?? null,
              description: dto.description ?? null,
              status: 'PENDING',
              submittedById: actor.id,
              resultingPlaceId: place.id,
              duplicateCandidates: candidates,
              images: {
                create: dto.images.map((image, index) => ({
                  imageUrl: image.imageUrl,
                  altText: image.altText ?? null,
                  sortOrder: index,
                })),
              },
            },
            select: { id: true },
          });

          await this.audit.record(
            {
              action: 'SUBMISSION_CREATED',
              actorId: actor.id,
              entityType: 'PlaceSubmission',
              entityId: submission.id,
              metadata: {
                resultingPlaceId: place.id,
                duplicateCandidateCount: candidates.length,
                confirmedDifferent: dto.confirmDifferent,
              },
              client,
            },
            tx,
          );
          return submission.id;
        }, TX_OPTIONS);
        return this.get(id, actor);
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        if (attempt >= 2) {
          throw AppException.conflict('CONFLICT', 'Could not create this place. Try again.');
        }
        slug = randomizedSlug(
          slugRoot(dto.name, { reservedWords: RESERVED_PLACE_SLUGS, fallback: 'place' }),
        );
      }
    }
  }

  /** The submitter can see their own submission; staff with `submissions.review` can see any. */
  async get(id: string, actor: AuthenticatedUser): Promise<PlaceSubmission> {
    const row = await this.prisma.placeSubmission.findUnique({
      where: { id },
      select: SUBMISSION_SELECT,
    });
    if (!row) throw AppException.notFound('Submission not found');
    if (row.submittedById !== actor.id) {
      const granted = await this.rbac.permissionsForRoles(actor.roles);
      if (!granted.includes('submissions.review')) throw AppException.notFound('Submission not found');
    }
    return toPlaceSubmission(row);
  }

  private async loadAndValidateCategory(categoryId: string): Promise<CategoryCheck> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true, status: true, defaultPriceUnit: true },
    });
    if (!category) throw AppException.validation({ categoryId: ['Category does not exist'] });
    if (category.parentId === null) {
      throw AppException.validation({ categoryId: ['This is a group; pick one of its categories'] });
    }
    if (category.status !== 'ACTIVE') {
      throw AppException.validation({ categoryId: ['Category is not active'] });
    }
    return category;
  }

  private async assertCollegeExists(collegeId: string): Promise<void> {
    const count = await this.prisma.college.count({ where: { id: collegeId } });
    if (count === 0) throw AppException.validation({ collegeId: ['College does not exist'] });
  }

  private async freeSlug(name: string): Promise<string> {
    const root = slugRoot(name, { reservedWords: RESERVED_PLACE_SLUGS, fallback: 'place' });
    const rows = await this.prisma.place.findMany({
      where: { slug: { startsWith: root } },
      select: { slug: true },
    });
    return pickFreeSlug(root, new Set(rows.map((row) => row.slug)));
  }
}
