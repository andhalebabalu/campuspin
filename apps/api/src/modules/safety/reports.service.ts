import { Injectable } from '@nestjs/common';
import type { ReportReason, ReportReceipt, ReportTargetType } from '@platform/contracts';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

export interface ReportInput {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

/**
 * Member reports on the shared `reports` table (community posts and comments, listings, members).
 * Callers check first that the reporter may see the target. Reporting the same thing twice while
 * the first report is still open returns that report instead of piling up duplicates.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(input: ReportInput, client?: ClientContext): Promise<ReportReceipt> {
    const open = await this.prisma.report.findFirst({
      where: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
      select: { id: true, status: true },
    });
    if (open) return open;

    const report = await this.prisma.report.create({
      data: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        description: input.description ?? null,
      },
      select: { id: true, status: true },
    });
    await this.audit.record({
      action: 'REPORT_CREATED',
      actorId: input.reporterId,
      entityType: 'Report',
      entityId: report.id,
      metadata: { targetType: input.targetType, targetId: input.targetId, reason: input.reason },
      client,
    });
    return report;
  }
}
