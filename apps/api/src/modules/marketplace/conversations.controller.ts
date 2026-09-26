import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Conversation,
  type CursorPage,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type MarketplaceReportRequest,
  type Message,
  type ReportReceipt,
  type SendMessageRequest,
  conversationSchema,
  cursorPageSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  marketplaceReportRequestSchema,
  messageSchema,
  messagesUnreadSchema,
  reportReceiptSchema,
  sendMessageSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ConversationsService } from './conversations.service.js';
import { EXAMPLE_CONVERSATION, EXAMPLE_MESSAGE } from './marketplace-examples.js';

const idParam = { schema: uuidSchema } as const;
const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Conversation not found' } as const;

/** My marketplace conversations. Only the buyer and the seller of a conversation can open it. */
@ApiTags('Marketplace')
@ApiBearerAuth()
@Controller('me/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ResponseMessage('Conversations retrieved')
  @ApiOperation({ summary: 'My conversations', description: 'Most recent activity first.' })
  @ApiEnvelopeResponse(z.array(conversationSchema), {
    description: 'A page of conversations.',
    example: {
      message: 'Conversations retrieved',
      data: [EXAMPLE_CONVERSATION],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  list(
    @Query({ schema: listConversationsQuerySchema }) query: ListConversationsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<Conversation>> {
    return this.conversations.list(actor.id, query);
  }

  @Get('unread-count')
  @ResponseMessage('Unread count retrieved')
  @ApiOperation({ summary: 'How many conversations have unread messages' })
  @ApiEnvelopeResponse(messagesUnreadSchema, {
    description: 'The count.',
    example: { message: 'Unread count retrieved', data: { unread: 1 } },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  async unread(@CurrentUser() actor: AuthenticatedUser): Promise<{ unread: number }> {
    return { unread: await this.conversations.unreadCount(actor.id) };
  }

  @Get(':id')
  @ResponseMessage('Conversation retrieved')
  @ApiOperation({ summary: 'One conversation' })
  @ApiEnvelopeResponse(conversationSchema, {
    description: 'The conversation.',
    example: { message: 'Conversation retrieved', data: EXAMPLE_CONVERSATION },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  get(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Conversation> {
    return this.conversations.get(actor.id, id);
  }

  @Get(':id/messages')
  @ResponseMessage('Messages retrieved')
  @ApiOperation({
    summary: 'Messages',
    description: 'Newest first; `nextCursor` loads older ones.',
  })
  @ApiEnvelopeResponse(cursorPageSchema(messageSchema), {
    description: 'A page of messages.',
    example: {
      message: 'Messages retrieved',
      data: { items: [EXAMPLE_MESSAGE], nextCursor: null },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  messages(
    @Param('id', idParam) id: string,
    @Query({ schema: listMessagesQuerySchema }) query: ListMessagesQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CursorPage<Message>> {
    return this.conversations.messages(actor.id, id, query);
  }

  @Post(':id/messages')
  @ResponseMessage('Message sent')
  @ApiOperation({ summary: 'Send a message' })
  @ApiEnvelopeResponse(messageSchema, {
    status: 201,
    description: 'The message.',
    example: { message: 'Message sent', data: EXAMPLE_MESSAGE },
  })
  @ApiErrorResponses(
    400,
    UNAUTHORIZED,
    {
      status: 403,
      code: 'BLOCKED',
      message: 'You cannot message this member.',
    },
    NOT_FOUND,
    409,
  )
  send(
    @Param('id', idParam) id: string,
    @Body({ schema: sendMessageSchema }) body: SendMessageRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Message> {
    return this.conversations.send(actor.id, id, body.body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Conversation marked read')
  @ApiOperation({ summary: 'Mark a conversation read' })
  @ApiEnvelopeResponse(messagesUnreadSchema, {
    description: 'Unread conversations afterwards.',
    example: { message: 'Conversation marked read', data: { unread: 0 } },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_FOUND)
  async read(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ unread: number }> {
    await this.conversations.markRead(actor.id, id);
    return { unread: await this.conversations.unreadCount(actor.id) };
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Report received')
  @ApiOperation({ summary: 'Report the other member of this conversation' })
  @ApiEnvelopeResponse(reportReceiptSchema, {
    description: 'The report.',
    example: {
      message: 'Report received',
      data: { id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f996', status: 'PENDING' },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_FOUND)
  report(
    @Param('id', idParam) id: string,
    @Body({ schema: marketplaceReportRequestSchema }) body: MarketplaceReportRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ReportReceipt> {
    return this.conversations.report(actor.id, id, body, client);
  }
}
