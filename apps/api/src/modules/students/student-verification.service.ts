import { Injectable, Logger } from '@nestjs/common';
import {
  STUDENT_CODE_MAX_ATTEMPTS,
  UPLOAD_IMAGE_MAX_BYTES,
  type ConfirmEmailVerification,
  type RequestEmailVerification,
  type StudentStatus,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { hashToken } from '../../common/security/token-hash.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppConfig } from '../../infra/config/app-config.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import { EmailService } from '../../infra/email/email.service.js';
import { sniffImageType } from '../../infra/storage/image-type.js';
import { PrivateFileStorage } from '../../infra/storage/private-file-storage.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { dispatchEmail } from '../auth/services/email-dispatch.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  addDays,
  codeMatches,
  domainAllowed,
  generateCode,
  maskEmail,
  studentBadge,
} from './student-rules.js';

/** A code is good for 15 minutes. */
const CODE_TTL_SECONDS = 15 * 60;

const alreadyVerified = () =>
  AppException.conflict(
    'ALREADY_VERIFIED',
    'You are already a verified student. You can verify again once your verification expires.',
  );
const noPendingCode = () =>
  AppException.badRequest('TOKEN_INVALID', 'There is no code waiting. Ask for a new one.');

export interface IncomingFile {
  buffer: Buffer;
  size: number;
}

/**
 * The student's side of verification: ask for a code at a college address and enter it, or hand in
 * an ID photo for staff to look at. A member is verified for one college at a time; verifying again
 * (after it lapses, or at another college) replaces the earlier affiliation.
 */
@Injectable()
export class StudentVerificationService {
  private readonly logger = new Logger(StudentVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly email: EmailService,
    private readonly storage: PrivateFileStorage,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async status(actor: AuthenticatedUser): Promise<StudentStatus> {
    const [user, pending, decided] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: {
          studentVerifiedUntil: true,
          verifiedCollege: { select: { id: true, slug: true, name: true } },
        },
      }),
      this.prisma.studentVerification.findFirst({
        where: { userId: actor.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { college: { select: { id: true, slug: true, name: true } } },
      }),
      this.prisma.studentVerification.findFirst({
        where: { userId: actor.id, reviewedAt: { not: null } },
        orderBy: { reviewedAt: 'desc' },
        select: { status: true, reviewNote: true, reviewedAt: true },
      }),
    ]);
    const badge = studentBadge(user);
    const state = badge.verified
      ? 'VERIFIED'
      : pending
        ? 'PENDING'
        : user.verifiedCollege
          ? 'EXPIRED'
          : 'UNVERIFIED';
    return {
      state,
      badge,
      pending: pending
        ? {
            id: pending.id,
            method: pending.method,
            college: pending.college,
            collegeEmail: pending.collegeEmail ? maskEmail(pending.collegeEmail) : null,
            codeExpiresAt: pending.codeExpiresAt?.toISOString() ?? null,
            createdAt: pending.createdAt.toISOString(),
          }
        : null,
      lastDecision:
        decided && decided.reviewedAt
          ? {
              status: decided.status,
              reviewNote: decided.reviewNote,
              decidedAt: decided.reviewedAt.toISOString(),
            }
          : null,
    };
  }

  /** Sends a code to a college address whose domain staff listed for that college. */
  async requestEmail(
    dto: RequestEmailVerification,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<StudentStatus> {
    await this.assertNotVerified(actor.id);
    const college = await this.activeCollege(dto.collegeId);
    const domains = (
      await this.prisma.collegeEmailDomain.findMany({
        where: { collegeId: college.id },
        select: { domain: true },
      })
    ).map((row) => row.domain);
    if (!domainAllowed(dto.email, domains)) {
      throw AppException.validation({
        email: [
          domains.length === 0
            ? `${college.name} has no official email domain on file yet. Verify with your student ID instead.`
            : `This is not an official ${college.name} email address. Use your college email, or verify with your student ID.`,
        ],
      });
    }
    const taken = await this.prisma.studentVerification.findFirst({
      where: { verifiedEmailKey: dto.email, userId: { not: actor.id } },
      select: { id: true },
    });
    if (taken) {
      throw AppException.conflict(
        'CONFLICT',
        'This college email already verifies another account. Contact support if that is a mistake.',
      );
    }

    const code = generateCode();
    const user = await this.prisma.$transaction(async (tx) => {
      await this.closePending(tx, actor.id, 'Replaced by a newer request.');
      const row = await tx.studentVerification.create({
        data: {
          userId: actor.id,
          collegeId: college.id,
          method: 'COLLEGE_EMAIL',
          collegeEmail: dto.email,
          codeHash: hashToken(code),
          codeExpiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: 'STUDENT_VERIFICATION_REQUESTED',
          actorId: actor.id,
          entityType: 'StudentVerification',
          entityId: row.id,
          metadata: { method: 'COLLEGE_EMAIL', collegeId: college.id },
          client,
        },
        tx,
      );
      return tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
    });
    dispatchEmail(this.logger, 'student verification code', () =>
      this.email.sendStudentCode({
        to: dto.email,
        name: user.name,
        code,
        collegeName: college.name,
        expiresInSeconds: CODE_TTL_SECONDS,
      }),
    );
    return this.status(actor);
  }

  /** Checks the code; on success the member becomes a verified student of that college. */
  async confirmEmail(
    dto: ConfirmEmailVerification,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<StudentStatus> {
    const pending = await this.prisma.studentVerification.findFirst({
      where: { userId: actor.id, status: 'PENDING', method: 'COLLEGE_EMAIL' },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending || !pending.codeHash || !pending.collegeEmail) throw noPendingCode();

    if (!pending.codeExpiresAt || pending.codeExpiresAt.getTime() <= Date.now()) {
      await this.expire(pending.id, 'The code expired.');
      throw AppException.badRequest('TOKEN_EXPIRED', 'This code has expired. Ask for a new one.');
    }
    if (pending.codeAttempts >= STUDENT_CODE_MAX_ATTEMPTS) {
      await this.expire(pending.id, 'Too many wrong codes.');
      throw AppException.badRequest('TOKEN_INVALID', 'Too many wrong codes. Ask for a new one.');
    }
    if (!codeMatches(dto.code, pending.codeHash)) {
      const attempts = pending.codeAttempts + 1;
      await this.prisma.studentVerification.update({
        where: { id: pending.id },
        data: { codeAttempts: attempts },
      });
      const left = STUDENT_CODE_MAX_ATTEMPTS - attempts;
      throw AppException.validation({
        code: [
          left > 0
            ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
            : 'That code is not right. Ask for a new one.',
        ],
      });
    }

    const collegeEmail = pending.collegeEmail;
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.studentVerification.updateMany({
          where: { id: pending.id, status: 'PENDING' },
          data: { codeHash: null },
        });
        if (claimed.count !== 1) throw noPendingCode();
        await this.grant(tx, {
          verificationId: pending.id,
          userId: actor.id,
          collegeId: pending.collegeId,
          verifiedEmailKey: collegeEmail,
        });
        await this.audit.record(
          {
            action: 'STUDENT_VERIFIED',
            actorId: actor.id,
            entityType: 'StudentVerification',
            entityId: pending.id,
            metadata: { method: 'COLLEGE_EMAIL', collegeId: pending.collegeId },
            client,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppException.conflict(
          'CONFLICT',
          'This college email already verifies another account. Contact support if that is a mistake.',
        );
      }
      throw error;
    }
    return this.status(actor);
  }

  /** An ID card photo for staff to review. Replaces any earlier request that is still waiting. */
  async submitDocument(
    collegeId: string,
    file: IncomingFile | undefined,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<StudentStatus> {
    if (!file || file.size === 0) {
      throw AppException.validation({ file: ['Add a photo of your student ID card'] });
    }
    if (file.size > UPLOAD_IMAGE_MAX_BYTES) {
      throw new AppException('PAYLOAD_TOO_LARGE', 'File too large', 413);
    }
    const type = sniffImageType(file.buffer);
    if (!type) {
      throw new AppException(
        'UNSUPPORTED_MEDIA_TYPE',
        'Upload a JPEG, PNG or WebP photo of your ID card.',
        415,
      );
    }
    await this.assertNotVerified(actor.id);
    const college = await this.activeCollege(collegeId);

    const key = await this.storage.save(file.buffer, type);
    try {
      const replaced = await this.prisma.$transaction(async (tx) => {
        const old = await this.closePending(tx, actor.id, 'Replaced by a newer request.');
        const row = await tx.studentVerification.create({
          data: {
            userId: actor.id,
            collegeId: college.id,
            method: 'DOCUMENT',
            documentKey: key,
            documentType: type,
          },
          select: { id: true },
        });
        await this.audit.record(
          {
            action: 'STUDENT_VERIFICATION_REQUESTED',
            actorId: actor.id,
            entityType: 'StudentVerification',
            entityId: row.id,
            metadata: { method: 'DOCUMENT', collegeId: college.id },
            client,
          },
          tx,
        );
        return old;
      });
      await this.deleteFiles(replaced);
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
    return this.status(actor);
  }

  /** Withdraws the waiting request (and deletes its ID photo). */
  async cancel(actor: AuthenticatedUser, client: ClientContext): Promise<StudentStatus> {
    const keys = await this.prisma.$transaction(async (tx) => {
      const closed = await this.closePending(tx, actor.id, 'Cancelled by the student.');
      if (closed.length === 0) throw AppException.notFound('There is no request to cancel.');
      await this.audit.record(
        {
          action: 'STUDENT_VERIFICATION_CANCELLED',
          actorId: actor.id,
          entityType: 'User',
          entityId: actor.id,
          client,
        },
        tx,
      );
      return closed;
    });
    await this.deleteFiles(keys);
    return this.status(actor);
  }

  // ── Shared with staff review ────────────────────────────────────────────────────────────────

  /**
   * Makes the member a verified student of the college: the verification row becomes VERIFIED
   * and any earlier verified affiliation of theirs lapses. Called inside the caller's transaction.
   */
  async grant(
    tx: Prisma.TransactionClient,
    input: {
      verificationId: string;
      userId: string;
      collegeId: string;
      verifiedEmailKey?: string;
      reviewedById?: string;
      reviewNote?: string | null;
    },
  ): Promise<void> {
    const now = new Date();
    const until = addDays(now, this.config.students.verificationValidDays);
    await tx.studentVerification.updateMany({
      where: { userId: input.userId, status: 'VERIFIED', id: { not: input.verificationId } },
      data: { status: 'EXPIRED', verifiedEmailKey: null },
    });
    await tx.studentVerification.update({
      where: { id: input.verificationId },
      data: {
        status: 'VERIFIED',
        verifiedAt: now,
        expiresAt: until,
        verifiedEmailKey: input.verifiedEmailKey ?? null,
        documentKey: null,
        ...(input.reviewedById
          ? {
              reviewedById: input.reviewedById,
              reviewedAt: now,
              reviewNote: input.reviewNote ?? null,
            }
          : {}),
      },
    });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { collegeId: true },
    });
    await tx.user.update({
      where: { id: input.userId },
      data: {
        verifiedCollegeId: input.collegeId,
        studentVerifiedAt: now,
        studentVerifiedUntil: until,
        // A member who never chose a college to browse now browses theirs.
        ...(user.collegeId ? {} : { collegeId: input.collegeId }),
      },
    });
    const college = await tx.college.findUniqueOrThrow({
      where: { id: input.collegeId },
      select: { name: true },
    });
    await this.notifications.notify(
      {
        userId: input.userId,
        category: 'ACCOUNT',
        type: 'student.verified',
        title: 'You are a Verified Student',
        message: `Your student verification for ${college.name} is complete. Your college community is open to you.`,
        link: '/me/verification',
      },
      tx,
    );
  }

  /** Deletes stored ID photos after the transaction that released them has committed. */
  async deleteFiles(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        this.logger.error(
          `Could not delete a private file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────────

  private async assertNotVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        studentVerifiedUntil: true,
        verifiedCollege: { select: { id: true, slug: true, name: true } },
      },
    });
    if (studentBadge(user).verified) throw alreadyVerified();
  }

  private async activeCollege(collegeId: string) {
    const college = await this.prisma.college.findFirst({
      where: { id: collegeId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    if (!college) throw AppException.validation({ collegeId: ['Choose a college from the list'] });
    return college;
  }

  /** Closes the member's waiting requests; returns the private file keys they held. */
  private async closePending(
    tx: Prisma.TransactionClient,
    userId: string,
    note: string,
  ): Promise<string[]> {
    const open = await tx.studentVerification.findMany({
      where: { userId, status: 'PENDING' },
      select: { id: true, documentKey: true },
    });
    if (open.length === 0) return [];
    await tx.studentVerification.updateMany({
      where: { id: { in: open.map((row) => row.id) } },
      data: { status: 'EXPIRED', codeHash: null, documentKey: null, reviewNote: note },
    });
    return open.flatMap((row) => (row.documentKey ? [row.documentKey] : []));
  }

  private async expire(id: string, note: string): Promise<void> {
    await this.prisma.studentVerification.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'EXPIRED', codeHash: null, reviewNote: note },
    });
  }
}
