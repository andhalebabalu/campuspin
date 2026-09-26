import { Injectable } from '@nestjs/common';
import type {
  AdminListStudentVerificationsQuery,
  AdminStudentVerification,
  CollegeEmailDomain,
  CollegeEmailDomainInput,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import { PrivateFileStorage } from '../../infra/storage/private-file-storage.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { StudentVerificationService } from './student-verification.service.js';

const SELECT = {
  id: true,
  status: true,
  method: true,
  collegeEmail: true,
  documentKey: true,
  documentType: true,
  reviewNote: true,
  reviewedById: true,
  reviewedAt: true,
  verifiedAt: true,
  expiresAt: true,
  createdAt: true,
  userId: true,
  collegeId: true,
  user: { select: { id: true, name: true, email: true } },
  college: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.StudentVerificationSelect;

type Row = Prisma.StudentVerificationGetPayload<{ select: typeof SELECT }>;

function toAdmin(row: Row): AdminStudentVerification {
  return {
    id: row.id,
    status: row.status,
    method: row.method,
    user: row.user,
    college: row.college,
    collegeEmail: row.collegeEmail,
    hasDocument: row.documentKey !== null,
    documentType: row.documentType,
    reviewNote: row.reviewNote,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const alreadyDecided = () =>
  AppException.conflict('CONFLICT', 'This request has already been decided.');

/**
 * Staff review of student verifications (behind `verifications.review`) and each college's list of
 * official email domains. An ID photo can be opened only here, and is deleted once staff decide.
 */
@Injectable()
export class AdminStudentVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateFileStorage,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly verification: StudentVerificationService,
  ) {}

  async list(
    query: AdminListStudentVerificationsQuery,
  ): Promise<Paginated<AdminStudentVerification>> {
    const where: Prisma.StudentVerificationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.studentVerification.count({ where }),
      this.prisma.studentVerification.findMany({
        where,
        // The oldest waiting request first: that is the order to work through a queue.
        orderBy: query.status === 'PENDING' ? [{ createdAt: 'asc' }] : [{ createdAt: 'desc' }],
        ...pageWindow(query),
        select: SELECT,
      }),
    ]);
    return Paginated.of(rows.map(toAdmin), { page: query.page, limit: query.limit, total });
  }

  async get(id: string): Promise<AdminStudentVerification> {
    return toAdmin(await this.load(id));
  }

  /** The ID photo bytes, for the reviewer only. Every opening is audited. */
  async document(
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<{ bytes: Buffer; type: string }> {
    const row = await this.load(id);
    if (!row.documentKey || !row.documentType) {
      throw AppException.notFound('No document is stored for this request.');
    }
    const bytes = await this.storage.read(row.documentKey);
    await this.audit.record({
      action: 'STUDENT_DOCUMENT_VIEWED',
      actorId: actor.id,
      entityType: 'StudentVerification',
      entityId: id,
      client,
    });
    return { bytes, type: row.documentType };
  }

  /** Accepts an ID-photo request. Email requests complete themselves when the code is entered. */
  async approve(
    id: string,
    reason: string | undefined,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminStudentVerification> {
    const row = await this.load(id);
    if (row.status !== 'PENDING') throw alreadyDecided();
    if (row.method !== 'DOCUMENT') {
      throw AppException.conflict(
        'CONFLICT',
        'Email requests complete when the student enters their code; there is nothing to approve.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.studentVerification.updateMany({
        where: { id, status: 'PENDING' },
        data: { documentKey: null },
      });
      if (claimed.count !== 1) throw alreadyDecided();
      await this.verification.grant(tx, {
        verificationId: id,
        userId: row.userId,
        collegeId: row.collegeId,
        reviewedById: actor.id,
        reviewNote: reason ?? null,
      });
      await this.record('STUDENT_VERIFIED', id, actor, client, { method: 'DOCUMENT' }, tx);
    });
    if (row.documentKey) await this.verification.deleteFiles([row.documentKey]);
    return this.get(id);
  }

  async reject(
    id: string,
    reason: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminStudentVerification> {
    const row = await this.load(id);
    if (row.status !== 'PENDING') throw alreadyDecided();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.studentVerification.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewNote: reason,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          documentKey: null,
          codeHash: null,
        },
      });
      if (claimed.count !== 1) throw alreadyDecided();
      await this.notifications.notify(
        {
          userId: row.userId,
          category: 'ACCOUNT',
          type: 'student.rejected',
          title: 'Student verification not approved',
          message: `Reason: ${reason} You can try again.`,
          link: '/me/verification',
        },
        tx,
      );
      await this.record('STUDENT_VERIFICATION_REJECTED', id, actor, client, { reason }, tx);
    });
    if (row.documentKey) await this.verification.deleteFiles([row.documentKey]);
    return this.get(id);
  }

  /** Ends a verified affiliation (e.g. doubts, graduation): the student must verify again. */
  async requestReverification(
    id: string,
    reason: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminStudentVerification> {
    const row = await this.load(id);
    if (row.status !== 'VERIFIED') {
      throw AppException.conflict(
        'CONFLICT',
        'Only a verified request can be sent back for re-verification.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.studentVerification.updateMany({
        where: { id, status: 'VERIFIED' },
        data: {
          status: 'EXPIRED',
          verifiedEmailKey: null,
          reviewNote: reason,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw alreadyDecided();
      // Only if this is the affiliation the member currently holds.
      await tx.user.updateMany({
        where: { id: row.userId, verifiedCollegeId: row.collegeId },
        data: { verifiedCollegeId: null, studentVerifiedAt: null, studentVerifiedUntil: null },
      });
      await this.notifications.notify(
        {
          userId: row.userId,
          category: 'ACCOUNT',
          type: 'student.reverify',
          title: 'Please verify your college again',
          message: `Reason: ${reason}`,
          link: '/me/verification',
        },
        tx,
      );
      await this.record('STUDENT_REVERIFICATION_REQUESTED', id, actor, client, { reason }, tx);
    });
    return this.get(id);
  }

  // ── College email domains ───────────────────────────────────────────────────────────────────

  async domains(collegeId: string): Promise<CollegeEmailDomain[]> {
    await this.assertCollege(collegeId);
    const rows = await this.prisma.collegeEmailDomain.findMany({
      where: { collegeId },
      orderBy: { domain: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      domain: row.domain,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addDomain(
    collegeId: string,
    dto: CollegeEmailDomainInput,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<CollegeEmailDomain[]> {
    await this.assertCollege(collegeId);
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.collegeEmailDomain.create({
          data: { collegeId, domain: dto.domain, createdById: actor.id },
        });
        await this.audit.record(
          {
            action: 'COLLEGE_EMAIL_DOMAIN_ADDED',
            actorId: actor.id,
            entityType: 'College',
            entityId: collegeId,
            metadata: { domain: row.domain },
            client,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppException.validation({ domain: ['This domain is already listed for a college'] });
      }
      throw error;
    }
    return this.domains(collegeId);
  }

  async removeDomain(
    collegeId: string,
    domainId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<CollegeEmailDomain[]> {
    const row = await this.prisma.collegeEmailDomain.findFirst({
      where: { id: domainId, collegeId },
    });
    if (!row) throw AppException.notFound('Domain not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.collegeEmailDomain.delete({ where: { id: domainId } });
      await this.audit.record(
        {
          action: 'COLLEGE_EMAIL_DOMAIN_REMOVED',
          actorId: actor.id,
          entityType: 'College',
          entityId: collegeId,
          metadata: { domain: row.domain },
          client,
        },
        tx,
      );
    });
    return this.domains(collegeId);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────────

  private async load(id: string): Promise<Row> {
    const row = await this.prisma.studentVerification.findUnique({ where: { id }, select: SELECT });
    if (!row) throw AppException.notFound('Verification request not found');
    return row;
  }

  private async assertCollege(collegeId: string): Promise<void> {
    const count = await this.prisma.college.count({ where: { id: collegeId } });
    if (count === 0) throw AppException.notFound('College not found');
  }

  private record(
    action: Parameters<AuditService['record']>[0]['action'],
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.audit.record(
      {
        action,
        actorId: actor.id,
        entityType: 'StudentVerification',
        entityId: id,
        metadata,
        client,
      },
      tx,
    );
  }
}
