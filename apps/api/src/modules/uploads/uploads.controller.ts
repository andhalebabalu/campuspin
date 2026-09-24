import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  UPLOAD_IMAGE_MAX_BYTES,
  type UploadedImage,
  uploadedImageSchema,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { ImageStorage } from '../../infra/storage/image-storage.js';
import { sniffImageType } from '../../infra/storage/image-type.js';

/** The parts of a multer file this controller reads (multer's own types are not installed). */
interface IncomingFile {
  buffer: Buffer;
  size: number;
}

const MAX_MB = UPLOAD_IMAGE_MAX_BYTES / (1024 * 1024);

/**
 * Image uploads for place photos and business logos. Any signed-in user may upload (students attach
 * photos to a suggested place); the returned URL is then sent in the `imageUrl` of whatever uses it.
 */
@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: ImageStorage) {}

  @Post('images')
  // Tighter than the global limit: each call writes up to 5 MB to disk.
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_IMAGE_MAX_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  @ResponseMessage('Image uploaded')
  @ApiOperation({
    summary: 'Upload an image',
    description:
      `Multipart form with one field, \`file\`: a JPEG, PNG or WebP image of at most ${MAX_MB} MB. The ` +
      "type is decided from the file's bytes, never from its name or declared type. Answers the public URL " +
      'to put in an `imageUrl` field. Limited to 30 uploads per 10 minutes.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiEnvelopeResponse(uploadedImageSchema, {
    status: 201,
    description: 'Where the image is now served.',
    example: {
      message: 'Image uploaded',
      data: {
        url: 'http://localhost:3001/uploads/01a0cd43-97e5-76be-bc3a-8f8eaaf0f785.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 482113,
      },
    },
  })
  @ApiErrorResponses(
    { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { file: ['Choose an image to upload'] } },
    },
    { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'File too large' },
    {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Only JPEG, PNG and WebP images can be uploaded.',
    },
    429,
  )
  async uploadImage(@UploadedFile() file: IncomingFile | undefined): Promise<UploadedImage> {
    if (!file || file.size === 0) {
      throw AppException.validation({ file: ['Choose an image to upload'] });
    }
    const contentType = sniffImageType(file.buffer);
    if (!contentType) {
      throw new AppException(
        'UNSUPPORTED_MEDIA_TYPE',
        'Only JPEG, PNG and WebP images can be uploaded.',
        415,
      );
    }
    const url = await this.storage.save(file.buffer, contentType);
    return { url, contentType, sizeBytes: file.size };
  }
}
