import {
  conversationSchema,
  cursorPageSchema,
  messageSchema,
  messagesUnreadSchema,
  reportReceiptSchema,
  type MarketplaceReportRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const id = (value: string) => encodeURIComponent(value);
const messagePage = cursorPageSchema(messageSchema);

/** My marketplace conversations with buyers and sellers. */
export const messagesService = {
  conversations: (page = 1, signal?: AbortSignal) =>
    apiClient.get('/me/conversations', {
      query: { page },
      schema: z.array(conversationSchema),
      signal,
      init: { cache: 'no-store' },
    }),
  unreadCount: (signal?: AbortSignal) =>
    apiClient.get('/me/conversations/unread-count', {
      schema: messagesUnreadSchema,
      signal,
      init: { cache: 'no-store' },
    }),
  conversation: (conversationId: string, signal?: AbortSignal) =>
    apiClient.get(`/me/conversations/${id(conversationId)}`, {
      schema: conversationSchema,
      signal,
      init: { cache: 'no-store' },
    }),
  messages: (conversationId: string, cursor?: string, signal?: AbortSignal) =>
    apiClient.get(`/me/conversations/${id(conversationId)}/messages`, {
      query: { cursor, limit: 30 },
      schema: messagePage,
      signal,
      init: { cache: 'no-store' },
    }),
  send: (conversationId: string, body: string) =>
    apiClient.post(`/me/conversations/${id(conversationId)}/messages`, {
      body: { body },
      schema: messageSchema,
    }),
  markRead: (conversationId: string) =>
    apiClient.post(`/me/conversations/${id(conversationId)}/read`, {
      schema: messagesUnreadSchema,
    }),
  report: (conversationId: string, dto: MarketplaceReportRequest) =>
    apiClient.post(`/me/conversations/${id(conversationId)}/report`, {
      body: dto,
      schema: reportReceiptSchema,
    }),
};
