import { Injectable } from '@nestjs/common';
import { boundingBox } from '../../common/geo/bounding-box.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { type ExistingLink, planLinks } from './college-rules.js';

/** A database client or an open transaction: the recompute can join a caller's transaction. */
export type Db = PrismaService | Prisma.TransactionClient;

export interface ProximityResult {
  created: number;
  rewritten: number;
  refreshedOverrides: number;
  removed: number;
  /** Links this college has afterwards, of every mode. */
  total: number;
}

/** Rows per statement, so a dense city never produces an enormous `IN (...)` or `INSERT`. */
const CHUNK = 500;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK)
    out.push(items.slice(start, start + CHUNK));
  return out;
}

/**
 * Keeps `college_places` (which places serve which college, and how far) correct when a college is
 * created or moved. Coordinates stay the only source of truth: distances are calculated here from
 * them and cached in that table so "nearest first" is an indexed read.
 *
 * Cost: one indexed query for the places inside the college's bounding box, one for its current
 * links, and writes only for rows that actually change.
 */
@Injectable()
export class CollegeProximityService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(collegeId: string, db: Db = this.prisma): Promise<ProximityResult> {
    const college = await db.college.findUniqueOrThrow({
      where: { id: collegeId },
      select: { latitude: true, longitude: true, serviceRadiusMeters: true },
    });

    // +1 m: the rule compares ROUNDED distances, so a place up to half a metre beyond the radius
    // still counts and must not be cut off by the box.
    const box = boundingBox(college, college.serviceRadiusMeters + 1);
    const candidates = await db.place.findMany({
      where: {
        latitude: { gte: box.minLatitude, lte: box.maxLatitude },
        ...(box.minLongitude === null || box.maxLongitude === null
          ? {}
          : { longitude: { gte: box.minLongitude, lte: box.maxLongitude } }),
      },
      select: { id: true, latitude: true, longitude: true },
    });

    const rows = await db.collegePlace.findMany({
      where: { collegeId },
      select: {
        placeId: true,
        mode: true,
        distanceMeters: true,
        place: { select: { latitude: true, longitude: true } },
      },
    });
    const existing: ExistingLink[] = rows.map((row) => ({
      placeId: row.placeId,
      mode: row.mode,
      distanceMeters: row.distanceMeters,
      latitude: row.place.latitude,
      longitude: row.place.longitude,
    }));

    const plan = planLinks(college, candidates, existing);
    const now = new Date();

    for (const ids of chunks([...plan.remove, ...plan.replaceAuto.map((link) => link.placeId)])) {
      await db.collegePlace.deleteMany({
        where: { collegeId, placeId: { in: ids }, mode: 'AUTO' },
      });
    }
    for (const links of chunks([...plan.create, ...plan.replaceAuto])) {
      await db.collegePlace.createMany({
        data: links.map((link) => ({
          collegeId,
          placeId: link.placeId,
          distanceMeters: link.distanceMeters,
          mode: 'AUTO' as const,
          computedAt: now,
        })),
        skipDuplicates: true,
      });
    }
    for (const link of plan.refreshOverrides) {
      await db.collegePlace.update({
        where: { collegeId_placeId: { collegeId, placeId: link.placeId } },
        data: { distanceMeters: link.distanceMeters, computedAt: now },
      });
    }

    return {
      created: plan.create.length,
      rewritten: plan.replaceAuto.length,
      refreshedOverrides: plan.refreshOverrides.length,
      removed: plan.remove.length,
      total: rows.length - plan.remove.length + plan.create.length,
    };
  }
}
