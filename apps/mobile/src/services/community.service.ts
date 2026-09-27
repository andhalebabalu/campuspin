import {
  communityChannelsSchema,
  communityCommentSchema,
  communityPostSchema,
  cursorPageSchema,
  memberProfileSchema,
  reactionSummarySchema,
  reportReceiptSchema,
  type CommunityCategory,
  type CommunityReactionType,
  type CommunityReportRequest,
  type CommunityScope,
  type CreateCommentRequest,
  type CreateCommunityPostRequest,
  type UpdateCommunityPostRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const id = (value: string) => encodeURIComponent(value);
const postPage = cursorPageSchema(communityPostSchema);
const commentPage = cursorPageSchema(communityCommentSchema);

export interface FeedParams {
  scope?: CommunityScope;
  category?: CommunityCategory;
  collegeId?: string;
  authorId?: string;
  cursor?: string;
  limit?: number;
}

/** College communities: feed, posts, comments, reactions, reports and member profiles. */
export const communityService = {
  feed: (params: FeedParams, signal?: AbortSignal) =>
    apiClient.get('/community/posts', {
      query: { ...params },
      schema: postPage,
      signal,
    }),
  channels: (signal?: AbortSignal) =>
    apiClient.get('/community/channels', {
      schema: communityChannelsSchema,
      signal,
    }),
  post: (postId: string, signal?: AbortSignal) =>
    apiClient.get(`/community/posts/${id(postId)}`, {
      schema: communityPostSchema,
      signal,
    }),
  create: (dto: CreateCommunityPostRequest) =>
    apiClient.post('/community/posts', { body: dto, schema: communityPostSchema }),
  update: (postId: string, dto: UpdateCommunityPostRequest) =>
    apiClient.patch(`/community/posts/${id(postId)}`, { body: dto, schema: communityPostSchema }),
  remove: (postId: string) =>
    apiClient.delete(`/community/posts/${id(postId)}`, { schema: z.null() }),

  comments: (postId: string, cursor?: string, signal?: AbortSignal) =>
    apiClient.get(`/community/posts/${id(postId)}/comments`, {
      query: { cursor, limit: 50 },
      schema: commentPage,
      signal,
    }),
  comment: (postId: string, dto: CreateCommentRequest) =>
    apiClient.post(`/community/posts/${id(postId)}/comments`, {
      body: dto,
      schema: communityCommentSchema,
    }),
  removeComment: (commentId: string) =>
    apiClient.delete(`/community/comments/${id(commentId)}`, { schema: z.null() }),

  react: (postId: string, type: CommunityReactionType) =>
    apiClient.put(`/community/posts/${id(postId)}/reaction`, {
      body: { type },
      schema: reactionSummarySchema,
    }),
  unreact: (postId: string) =>
    apiClient.delete(`/community/posts/${id(postId)}/reaction`, { schema: reactionSummarySchema }),

  reportPost: (postId: string, dto: CommunityReportRequest) =>
    apiClient.post(`/community/posts/${id(postId)}/report`, {
      body: dto,
      schema: reportReceiptSchema,
    }),
  reportComment: (commentId: string, dto: CommunityReportRequest) =>
    apiClient.post(`/community/comments/${id(commentId)}/report`, {
      body: dto,
      schema: reportReceiptSchema,
    }),

  member: (memberId: string, signal?: AbortSignal) =>
    apiClient.get(`/members/${id(memberId)}`, {
      schema: memberProfileSchema,
      signal,
    }),
};
