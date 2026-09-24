import { Injectable } from '@nestjs/common';
import type {
  AdminBusiness,
  AdminListBusinessesQuery,
  BusinessActionRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { escapeLike } from '../places/place-queries.js';

const BUSINESS_SELECT = {
  id: true,
  businessName: true,
  slug: true,
  phone: true,
  email: true,
  website: true,
  logoUrl: true,
  verificationStatus: true,
  createdAt: true,
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.BusinessProfileSelect;

type BusinessRow = Prisma.BusinessProfileGetPayload<{ select: typeof BUSINESS_SELECT }>;

const notFound = () => AppException.notFound('Business not found');

/** Staff view of business profiles, and the "verified business" decision. */
@Injectable()
export class AdminBusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminListBusinessesQuery): Promise<Paginated<AdminBusiness>> {
    const like = query.q ? escapeLike(query.q) : undefined;
    const where: Prisma.BusinessProfileWhereInput = {
      ...(like
        ? { OR: [{ businessName: { contains: like } }, { owner: { email: { contains: like } } }] }
        : {}),
      ...(query.verification ? { verificationStatus: query.verification } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.businessProfile.findMany({
        where,
        select: BUSINESS_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.businessProfile.count({ where }),
    ]);
    return Paginated.of(await this.withCounts(rows), { ...query, total });
  }

  verify(
    id: string,
    dto: BusinessActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.setVerification(id, 'VERIFIED', dto, actor, client);
  }

  unverify(
    id: string,
    dto: BusinessActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.setVerification(id, 'PENDING', dto, actor, client);
  }

  private async setVerification(
    id: string,
    to: 'VERIFIED' | 'PENDING',
    dto: BusinessActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminBusiness> {
    const current = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: { verificationStatus: true },
    });
    if (!current) throw notFound();
    if (current.verificationStatus === to) {
      throw AppException.conflict(
        'CONFLICT',
        to === 'VERIFIED' ? 'This business is already verified.' : 'This business is not verified.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.businessProfile.update({ where: { id }, data: { verificationStatus: to } });
      await this.audit.record(
        {
          action: to === 'VERIFIED' ? 'BUSINESS_VERIFIED' : 'BUSINESS_UNVERIFIED',
          actorId: actor.id,
          entityType: 'BusinessProfile',
          entityId: id,
          metadata: {
            from: current.verificationStatus,
            ...(dto?.reason ? { reason: dto.reason } : {}),
          },
          client,
        },
        tx,
      );
    });
    const row = await this.prisma.businessProfile.findUniqueOrThrow({
      where: { id },
      select: BUSINESS_SELECT,
    });
    const [business] = await this.withCounts([row]);
    return business as AdminBusiness;
  }

  /** Adds each business's listing counts (all and live) in one grouped query. */
  private async withCounts(rows: BusinessRow[]): Promise<AdminBusiness[]> {
    const groups =
      rows.length === 0
        ? []
        : await this.prisma.place.groupBy({
            by: ['businessProfileId', 'status'],
            where: { businessProfileId: { in: rows.map((row) => row.id) } },
            _count: { _all: true },
          });
    return rows.map((row) => {
      const mine = groups.filter((group) => group.businessProfileId === row.id);
      return {
        id: row.id,
        businessName: row.businessName,
        slug: row.slug,
        owner: { id: row.owner.id, name: row.owner.name, email: row.owner.email },
        phone: row.phone,
        email: row.email,
        website: row.website,
        logoUrl: row.logoUrl,
        verificationStatus: row.verificationStatus,
        listingCount: mine.reduce((sum, group) => sum + group._count._all, 0),
        liveListingCount: mine
          .filter((group) => group.status === 'ACTIVE')
          .reduce((sum, group) => sum + group._count._all, 0),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
