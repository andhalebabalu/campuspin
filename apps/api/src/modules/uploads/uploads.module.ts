import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { UploadsController } from './uploads.controller.js';

/**
 * `POST /uploads/images` (public images) and `POST /uploads/documents` (private files for orders
 * and requests). Owns `private_documents`. Storage itself is the global `StorageModule` (infra).
 */
@Module({
  controllers: [UploadsController, DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class UploadsModule {}
