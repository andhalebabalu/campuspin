import { Injectable } from '@nestjs/common';
import { PRINT_MAX_BYTES, UPLOAD_IMAGE_MAX_BYTES, type PrivateDocument } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { sniffImageType } from '../../infra/storage/image-type.js';
import { PDF_MAX_PAGES, inspectPdf } from '../../infra/storage/pdf.js';
import { PrivateFileStorage } from '../../infra/storage/private-file-storage.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

/** An unused upload expires: it must be attached to an order or request within this time. */
const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

const DOCUMENT_SELECT = {
  id: true,
  kind: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  pageCount: true,
} satisfies Prisma.PrivateDocumentSelect;

/** A display-only file name: no path, no control or markup characters, at most 120 characters. */
export function cleanFileName(raw: string | undefined, fallback: string): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[^\p{L}\p{N} ._()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * Private uploads for orders and requests: a PDF to print, a photo of a problem. The type comes
 * from the bytes, never the name. Files live in private storage under random keys, are attached
 * once, are read only through an access-checked route, and are deleted when the job is finished.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PrivateFileStorage,
    private readonly audit: AuditService,
  ) {}

  async upload(
    actor: AuthenticatedUser,
    file: { buffer: Buffer; size: number; originalname?: string } | undefined,
    client: ClientContext,
  ): Promise<PrivateDocument> {
    if (!file || file.size === 0)
      throw AppException.validation({ file: ['Choose a file to upload'] });
    const image = sniffImageType(file.buffer);
    let kind: 'PRINT' | 'REQUEST_PHOTO';
    let contentType: 'application/pdf' | NonNullable<typeof image>;
    let pageCount: number | null = null;
    if (image) {
      if (file.size > UPLOAD_IMAGE_MAX_BYTES)
        throw new AppException('PAYLOAD_TOO_LARGE', 'Photos can be at most 5 MB.', 413);
      kind = 'REQUEST_PHOTO';
      contentType = image;
    } else {
      const pdf = inspectPdf(file.buffer);
      if (!pdf) {
        throw new AppException(
          'UNSUPPORTED_MEDIA_TYPE',
          'Upload a PDF to print, or a JPEG, PNG or WebP photo.',
          415,
        );
      }
      if (file.size > PRINT_MAX_BYTES)
        throw new AppException('PAYLOAD_TOO_LARGE', 'PDFs can be at most 20 MB.', 413);
      if (pdf.encrypted)
        throw AppException.validation({
          file: ['This PDF is password-protected. Save it without a password first.'],
        });
      if (pdf.pageCount > PDF_MAX_PAGES)
        throw AppException.validation({
          file: [`A print job can have at most ${PDF_MAX_PAGES} pages.`],
        });
      kind = 'PRINT';
      contentType = 'application/pdf';
      pageCount = pdf.pageCount;
    }
    const key = await this.storage.save(file.buffer, contentType);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.privateDocument.create({
        data: {
          userId: actor.id,
          kind,
          fileKey: key,
          fileName: cleanFileName(file.originalname, kind === 'PRINT' ? 'document.pdf' : 'photo'),
          contentType,
          sizeBytes: file.size,
          pageCount,
        },
        select: DOCUMENT_SELECT,
      });
      await this.audit.record(
        {
          action: 'PRIVATE_DOCUMENT_UPLOADED',
          actorId: actor.id,
          entityType: 'PrivateDocument',
          entityId: created.id,
          metadata: { kind, sizeBytes: file.size, pageCount },
          client,
        },
        tx,
      );
      return created;
    });
    return row;
  }

  /**
   * Attaches the student's own, unused, recent upload of the given kind (inside the caller's
   * transaction). Anyone else's document, or one already used, is refused.
   */
  async claim(
    tx: Prisma.TransactionClient,
    userId: string,
    documentId: string,
    kind: 'PRINT' | 'REQUEST_PHOTO',
  ): Promise<{ id: string; fileName: string; pageCount: number | null }> {
    const since = new Date(Date.now() - CLAIM_WINDOW_MS);
    const claimed = await tx.privateDocument.updateMany({
      where: {
        id: documentId,
        userId,
        kind,
        usedAt: null,
        deletedAt: null,
        createdAt: { gte: since },
      },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw AppException.validation({
        [kind === 'PRINT' ? 'documentId' : 'imageId']: [
          'Upload the file again: this one is not available',
        ],
      });
    }
    return tx.privateDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: { id: true, fileName: true, pageCount: true },
    });
  }

  /** The bytes of a document the caller may see (checked by the caller); each read is audited. */
  async read(
    documentId: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<{ bytes: Buffer; contentType: string; fileName: string }> {
    const row = await this.prisma.privateDocument.findUnique({
      where: { id: documentId },
      select: { fileKey: true, contentType: true, fileName: true },
    });
    if (!row?.fileKey)
      throw AppException.notFound('The file is no longer stored: the job is finished.');
    const bytes = await this.storage.read(row.fileKey);
    await this.audit.record({
      action: 'PRIVATE_DOCUMENT_OPENED',
      actorId: actor.id,
      entityType: 'PrivateDocument',
      entityId: documentId,
      client,
    });
    return { bytes, contentType: row.contentType, fileName: row.fileName };
  }

  /** Deletes the stored file (the row stays for the record). Safe to call twice. */
  async discard(documentId: string | null): Promise<void> {
    if (!documentId) return;
    const row = await this.prisma.privateDocument.findUnique({
      where: { id: documentId },
      select: { fileKey: true },
    });
    if (!row?.fileKey) return;
    await this.storage.delete(row.fileKey);
    await this.prisma.privateDocument.update({
      where: { id: documentId },
      data: { fileKey: null, deletedAt: new Date() },
    });
  }
}
