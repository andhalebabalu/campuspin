import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller.js';

/** `POST /uploads/images`. Storage itself is the global `StorageModule` (infra). */
@Module({ controllers: [UploadsController] })
export class UploadsModule {}
