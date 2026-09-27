import { Injectable } from '@nestjs/common';
import type { PlaceCard, SavedPlaceState } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { toPlaceCard } from './place-mappers.js';
import { CARD_SELECT, idOrSlugFilter } from './place-queries.js';

/** At most this many saved places are returned; nobody bookmarks more in practice. */
const LIST_LIMIT = 200;

/** A member's bookmarked places. Only live places are shown; saving twice is harmless. */
@Injectable()
export class SavedPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<PlaceCard[]> {
    const rows = await this.prisma.savedPlace.findMany({
      where: { userId, place: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: { place: { select: CARD_SELECT } },
    });
    return rows.map((row) => toPlaceCard(row.place, null));
  }

  async ids(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedPlace.findMany({
      where: { userId, place: { status: 'ACTIVE' } },
      take: LIST_LIMIT,
      select: { placeId: true },
    });
    return rows.map((row) => row.placeId);
  }

  async save(userId: string, idOrSlug: string): Promise<SavedPlaceState> {
    const place = await this.livePlace(idOrSlug);
    await this.prisma.savedPlace.upsert({
      where: { userId_placeId: { userId, placeId: place.id } },
      create: { userId, placeId: place.id },
      update: {},
    });
    return { placeId: place.id, saved: true };
  }

  async unsave(userId: string, idOrSlug: string): Promise<SavedPlaceState> {
    const place = await this.livePlace(idOrSlug);
    await this.prisma.savedPlace.deleteMany({ where: { userId, placeId: place.id } });
    return { placeId: place.id, saved: false };
  }

  private async livePlace(idOrSlug: string): Promise<{ id: string }> {
    const place = await this.prisma.place.findFirst({
      where: { status: 'ACTIVE', ...idOrSlugFilter(idOrSlug) },
      select: { id: true },
    });
    if (!place) throw AppException.notFound('Place not found');
    return place;
  }
}
