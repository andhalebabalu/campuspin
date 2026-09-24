import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { ImageStorage, LocalDiskImageStorage } from './image-storage.js';

/** Local disk is the only storage for now (see `UPLOAD_DIR`). Add Cloudinary/S3 here when needed. */
@Global()
@Module({
  providers: [
    {
      provide: ImageStorage,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ImageStorage =>
        new LocalDiskImageStorage(config.uploadDir, config.apiBaseUrl),
    },
  ],
  exports: [ImageStorage],
})
export class StorageModule {}
