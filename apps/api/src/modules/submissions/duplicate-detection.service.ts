import { Injectable } from '@nestjs/common';
import type { DuplicateCandidate } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { CategoryRef } from './duplicate-rules.js';
import { rankCandidates } from './duplicate-rules.js';
import { toCandidatePlace } from './submission-mappers.js';
import { CANDIDATE_SELECT, candidateFilter } from './submission-queries.js';

export interface DuplicateCheckSubject {
  name: string;
  categoryId: string;
  latitude: number;
  longitude: number;
  address?: string | undefined;
  phone?: string | undefined;
}

/**
 * Scores a suggested place against everything nearby that could be the same place (see
 * `submission-queries.ts` for the candidate pool and `duplicate-rules.ts` for the scoring). Used by
 * both `POST /places/duplicate-check` (client-triggered, best-effort) and `POST /place-submissions`
 * (server-side, authoritative — the client result is never trusted for the actual decision).
 */
@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async check(subject: DuplicateCheckSubject): Promise<DuplicateCandidate[]> {
    const category = await this.categoryRef(subject.categoryId);
    const rows = await this.prisma.place.findMany({
      where: candidateFilter(subject),
      select: CANDIDATE_SELECT,
    });
    const candidates = rows.map(toCandidatePlace);
    return rankCandidates(
      {
        name: subject.name,
        category,
        latitude: subject.latitude,
        longitude: subject.longitude,
        address: subject.address,
        phone: subject.phone,
      },
      candidates,
    );
  }

  private async categoryRef(categoryId: string): Promise<CategoryRef> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    if (!category) throw AppException.validation({ categoryId: ['Category does not exist'] });
    return category;
  }
}
