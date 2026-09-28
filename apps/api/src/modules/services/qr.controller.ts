import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  placeIdOrSlugSchema,
  qrResolutionSchema,
  qrTokenSchema,
  type QrResolution,
} from '@platform/contracts';
import { z } from 'zod';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { TablesQrService } from './tables-qr.service.js';

/** Scanning a CampusPin QR code, and counting place page views. Both public. */
@ApiTags('Services')
@Controller()
export class QrController {
  constructor(private readonly tablesQr: TablesQrService) {}

  @Public()
  @Get('qr/:token')
  // Tokens are unguessable, but guessing is still slowed down.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ResponseMessage('Code resolved')
  @ApiOperation({
    summary: 'Resolve a scanned QR code',
    description:
      'The place (and table) a CampusPin code belongs to. Counts the scan. 410 `QR_INACTIVE` when the ' +
      'code was disabled or replaced, or the place is not live.',
  })
  @ApiEnvelopeResponse(qrResolutionSchema, { description: 'Where the code leads.' })
  @ApiErrorResponses(
    { status: 404, code: 'NOT_FOUND', message: 'This is not a CampusPin code' },
    { status: 410, code: 'QR_INACTIVE', message: 'This code is no longer in use.' },
    429,
  )
  resolve(@Param('token', { schema: qrTokenSchema }) token: string): Promise<QrResolution> {
    return this.tablesQr.resolve(token);
  }

  @Public()
  @Post('places/:idOrSlug/view')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ResponseMessage('Recorded')
  @ApiOperation({
    summary: 'Count a page view',
    description: 'Apps call this when a place page opens. Always succeeds.',
  })
  @ApiEnvelopeResponse(z.null(), { description: 'Counted.' })
  async view(@Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string): Promise<null> {
    await this.tablesQr.recordView(idOrSlug);
    return null;
  }
}
