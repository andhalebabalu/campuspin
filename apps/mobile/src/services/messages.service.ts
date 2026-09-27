import {
  conversationSchema,
  cursorPageSchema,
  messageSchema,
  messagesUnreadSchema,
  reportReceiptSchema,
  type MarketplaceReportRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const id = (value: string) => encodeURIComponent(value);
const messagePage = cursorPageSchema(messageSchema);

/** My marketplace conversations with buyers and sellers. */
export const messagesService = {
  conversations: (page = 1, signal?: AbortSignal) =>
    apiClient.get('/me/conversations', {
      query: { page },
      schema: z.array(conversationSchema),
      signal,
    }),
  unreadCount: (signal?: AbortSignal) =>
    apiClient.get('/me/conversations/unread-count', {
      schema: messagesUnreadSchema,
      signal,
    }),
  conversation: (conversationId: string, signal?: AbortSignal) =>
    apiClient.get(`/me/conversations/${id(conversationId)}`, {
      schema: conversationSchema,
      signal,
    }),
  messages: (conversationId: string, cursor?: string, signal?: AbortSignal) =>
    apiClient.get(`/me/conversations/${id(conversationId)}/messages`, {
      query: { cursor, limit: 30 },
      schema: messagePage,
      signal,
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
