import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ListNotificationsQuery,
  type Notification,
  listNotificationsQuerySchema,
  notificationSchema,
  unreadCountSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;

const EXAMPLE = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f801',
  type: 'student.verified',
  title: 'You are a Verified Student',
  message: 'Your student verification for ABC College was approved.',
  link: '/me/verification',
  read: false,
  createdAt: '2026-09-25T10:00:00.000Z',
};

/** The signed-in member's own notifications. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ResponseMessage('Notifications retrieved')
  @ApiOperation({
    summary: 'My notifications',
    description: 'Newest first; `unread=true` for unread only.',
  })
  @ApiEnvelopeResponse(z.array(notificationSchema), {
    description: 'A page of notifications.',
    example: {
      message: 'Notifications retrieved',
      data: [EXAMPLE],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  list(
    @Query({ schema: listNotificationsQuerySchema }) query: ListNotificationsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<Notification>> {
    return this.notifications.list(actor.id, query);
  }

  @Get('unread-count')
  @ResponseMessage('Unread count retrieved')
  @ApiOperation({ summary: 'How many notifications are unread' })
  @ApiEnvelopeResponse(unreadCountSchema, {
    description: 'The count.',
    example: { message: 'Unread count retrieved', data: { unread: 3 } },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  async unread(@CurrentUser() actor: AuthenticatedUser): Promise<{ unread: number }> {
    return { unread: await this.notifications.unreadCount(actor.id) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('All notifications marked read')
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiEnvelopeResponse(unreadCountSchema, {
    description: 'Unread afterwards (always 0).',
    example: { message: 'All notifications marked read', data: { unread: 0 } },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  async readAll(@CurrentUser() actor: AuthenticatedUser): Promise<{ unread: number }> {
    await this.notifications.markAllRead(actor.id);
    return { unread: 0 };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Notification marked read')
  @ApiOperation({ summary: 'Mark one notification read', description: "Someone else's is a 404." })
  @ApiEnvelopeResponse(unreadCountSchema, {
    description: 'Unread count afterwards.',
    example: { message: 'Notification marked read', data: { unread: 2 } },
  })
  @ApiErrorResponses(UNAUTHORIZED, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Notification not found',
  })
  async read(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ unread: number }> {
    await this.notifications.markRead(actor.id, id);
    return { unread: await this.notifications.unreadCount(actor.id) };
  }
}
