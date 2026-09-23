import { Injectable } from '@nestjs/common';
import type { Amenity } from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { toAmenity } from './category-mappers.js';
import { AMENITY_ORDER_BY, AMENITY_SELECT } from './category-queries.js';

/** The public amenity list: any active facility a place can offer (WiFi, parking, ...). */
@Injectable()
export class AmenitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Amenity[]> {
    const rows = await this.prisma.amenity.findMany({
      where: { status: 'ACTIVE' },
      orderBy: AMENITY_ORDER_BY,
      select: AMENITY_SELECT,
    });
    return rows.map(toAmenity);
  }
}
