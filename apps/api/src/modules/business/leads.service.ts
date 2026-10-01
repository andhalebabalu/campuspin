import { Injectable } from '@nestjs/common';
import type { CreateLeadRequest, LeadReceipt } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CapabilitiesService } from '../capabilities/capabilities.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { idOrSlugFilter } from '../places/place-queries.js';
import { LEAD_RECEIPT_SELECT, toLeadReceipt } from './business-mappers.js';

/** An enquiry the business has not dealt with yet; a student may have one of these per place. */
const OPEN_LEAD_STATUSES = ['NEW', 'SEEN'] as const;

/** Students sending enquiries to the business that manages a place. */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async create(
    placeIdOrSlug: string,
    dto: CreateLeadRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<LeadReceipt> {
    const place = await this.prisma.place.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(placeIdOrSlug) },
      select: { id: true, businessProfileId: true },
    });
    if (!place) throw AppException.notFound('Place not found');
    const businessProfileId = place.businessProfileId;
    if (!businessProfileId) {
      throw AppException.conflict(
        'CONFLICT',
        'This place is not managed by its business on CampusPin yet, so it cannot receive enquiries.',
      );
    }
    if (!(await this.capabilities.has(businessProfileId, ['ENQUIRY']))) {
      throw AppException.conflict(
        'CONFLICT',
        'This business does not take enquiries on CampusPin.',
      );
    }

    const managesIt = await this.prisma.businessProfile.count({
      where: {
        id: businessProfileId,
        OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }],
      },
    });
    if (managesIt > 0) {
      throw AppException.forbidden('FORBIDDEN', 'You cannot send an enquiry to your own business.');
    }

    // One open enquiry per student per place keeps an inbox from being flooded by repeats. (Two
    // simultaneous sends could both pass this check; a duplicate enquiry is harmless.)
    const open = await this.prisma.lead.count({
      where: { placeId: place.id, userId: actor.id, status: { in: [...OPEN_LEAD_STATUSES] } },
    });
    if (open > 0) {
      throw AppException.conflict(
        'CONFLICT',
        'You already have an open enquiry with this place. The business will get back to you.',
      );
    }

    const lead = await this.prisma.$transaction(async (tx) => {
      const row = await tx.lead.create({
        data: {
          placeId: place.id,
          businessProfileId,
          userId: actor.id,
          message: dto.message,
          contactPhone: dto.contactPhone ?? null,
          consentAt: new Date(),
        },
        select: LEAD_RECEIPT_SELECT,
      });
      await this.audit.record(
        {
          action: 'LEAD_CREATED',
          actorId: actor.id,
          entityType: 'Lead',
          entityId: row.id,
          metadata: { placeId: place.id, businessProfileId },
          client,
        },
        tx,
      );
      return row;
    });
    return toLeadReceipt(lead);
  }
}
