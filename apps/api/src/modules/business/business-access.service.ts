import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/http/app-exception.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export interface OwnedPlace {
  id: string;
  slug: string;
  name: string;
  status: string;
  businessProfileId: string;
}

/**
 * Resolves what a business owner (or member) may manage. Every business-side route of the services,
 * orders, offers and bookings modules goes through here, so "another business's id answers 404"
 * is enforced in one place. A suspended business manages nothing.
 */
@Injectable()
export class BusinessAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every active business the caller owns or belongs to. */
  async businessIdsOf(actor: AuthenticatedUser): Promise<string[]> {
    const rows = await this.prisma.businessProfile.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) {
      throw AppException.notFound('No business profile is linked to this account yet.');
    }
    return rows.map((row) => row.id);
  }

  /** One of the caller's places, in any status. Anyone else's place is "not found". */
  async placeOf(actor: AuthenticatedUser, placeId: string): Promise<OwnedPlace> {
    const businessIds = await this.businessIdsOf(actor);
    const place = await this.prisma.place.findFirst({
      where: { id: placeId, businessProfileId: { in: businessIds } },
      select: { id: true, slug: true, name: true, status: true, businessProfileId: true },
    });
    if (!place?.businessProfileId) throw AppException.notFound('Place not found');
    return { ...place, businessProfileId: place.businessProfileId };
  }

  /** The users to notify about something new at a business: its owner and every member. */
  async staffUserIds(businessProfileId: string): Promise<string[]> {
    const business = await this.prisma.businessProfile.findUnique({
      where: { id: businessProfileId },
      select: { ownerId: true, members: { select: { userId: true } } },
    });
    if (!business) return [];
    return [...new Set([business.ownerId, ...business.members.map((member) => member.userId)])];
  }
}
