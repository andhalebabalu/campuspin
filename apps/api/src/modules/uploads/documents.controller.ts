import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PRINT_MAX_BYTES, privateDocumentSchema, type PrivateDocument } from '@platform/contracts';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { DocumentsService } from './documents.service.js';

interface IncomingFile {
  buffer: Buffer;
  size: number;
  originalname?: string;
}

/** Private uploads: a PDF to print or a photo of a problem. Never given a public URL. */
@ApiTags('Uploads')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller('uploads')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('documents')
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRINT_MAX_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  @ResponseMessage('File uploaded')
  @ApiOperation({
    summary: 'Upload a private file',
    description:
      'Multipart, field `file`: a PDF to print (up to 20 MB and 500 pages, not password-protected) or a ' +
      'JPEG/PNG/WebP photo for a request (up to 5 MB). The type is read from the bytes. Returns an id to ' +
      'attach within 24 hours; the file is only ever shown to you and the business you send it to.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiEnvelopeResponse(privateDocumentSchema, { status: 201, description: 'The upload.' })
  @ApiErrorResponses(
    { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
    400,
    { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'File too large' },
    { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Upload a PDF or a photo.' },
    429,
  )
  upload(
    @UploadedFile() file: IncomingFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PrivateDocument> {
    return this.documents.upload(actor, file, client);
  }
}
