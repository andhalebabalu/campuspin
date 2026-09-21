import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuditAction } from './audit-actions.js';

export interface AuditEntry {
  action: AuditAction;
  /** The user who acted. Null for anonymous events, such as a failed login for an unknown email. */
  actorId?: string | null;
  /** What was acted on, for example `User`. */
  entityType: string;
  entityId?: string | null;
  /**
   * Extra facts worth keeping (a reason, a session id, ...). NEVER put a password, a raw token, a
   * token hash or a full email address here: audit rows are read by staff and outlive the request.
   */
  metadata?: Prisma.InputJsonObject;
  client?: ClientContext;
}

/** Writes the append-only `audit_logs` trail. One place, so every module records events alike. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Passing `tx` writes the row inside that transaction, so the event and the change it describes
   * commit or roll back together (failures propagate). Without `tx` the write is best effort: a
   * broken audit table must not turn a successful login into an error, so the failure is logged
   * loudly instead.
   */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const data = {
      action: entry.action,
      actorId: entry.actorId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
      ipAddress: entry.client?.ipAddress ?? null,
      userAgent: entry.client?.userAgent ?? null,
      requestId: entry.client?.requestId ?? null,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      this.logger.error(
        `Could not write audit event ${entry.action} for ${entry.entityType} ${entry.entityId ?? '-'}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
