import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BlockRequest,
  type BlockedMember,
  blockRequestSchema,
  blockedMemberSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BlocksService } from './blocks.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;

const EXAMPLE = {
  id: '01a0c44b-14bb-724c-98a4-00a05625e026',
  displayName: 'Rahul A.',
  blockedAt: '2026-09-26T10:00:00.000Z',
};

/** The members I blocked. A block hides both ways and stops messages; the other member is not told. */
@ApiTags('Safety')
@ApiBearerAuth()
@Controller('me/blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  @ResponseMessage('Blocked members retrieved')
  @ApiOperation({ summary: 'Members I blocked' })
  @ApiEnvelopeResponse(z.array(blockedMemberSchema), {
    description: 'Newest first.',
    example: { message: 'Blocked members retrieved', data: [EXAMPLE] },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  list(@CurrentUser() actor: AuthenticatedUser): Promise<BlockedMember[]> {
    return this.blocks.list(actor.id);
  }

  @Post()
  @ResponseMessage('Member blocked')
  @ApiOperation({ summary: 'Block a member', description: 'Idempotent.' })
  @ApiEnvelopeResponse(z.array(blockedMemberSchema), {
    status: 201,
    description: 'The list afterwards.',
    example: { message: 'Member blocked', data: [EXAMPLE] },
  })
  @ApiErrorResponses(UNAUTHORIZED, 400, 404)
  block(
    @Body({ schema: blockRequestSchema }) body: BlockRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BlockedMember[]> {
    return this.blocks.block(actor.id, body.userId);
  }

  @Delete(':userId')
  @ResponseMessage('Member unblocked')
  @ApiOperation({ summary: 'Unblock a member' })
  @ApiEnvelopeResponse(z.array(blockedMemberSchema), {
    description: 'The list afterwards.',
    example: { message: 'Member unblocked', data: [] },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  unblock(
    @Param('userId', { schema: uuidSchema }) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BlockedMember[]> {
    return this.blocks.unblock(actor.id, userId);
  }
}
