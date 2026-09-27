import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CommunityChannels,
  type CommunityComment,
  type CommunityPost,
  type CommunityReportRequest,
  type CreateCommentRequest,
  type CreateCommunityPostRequest,
  type CursorPage,
  type ListCommentsQuery,
  type ListCommunityPostsQuery,
  type MemberProfile,
  type ReactionRequest,
  type ReactionSummary,
  type ReportReceipt,
  type UpdateCommunityPostRequest,
  communityChannelsSchema,
  communityCommentSchema,
  communityPostSchema,
  communityReportRequestSchema,
  createCommentSchema,
  createCommunityPostSchema,
  cursorPageSchema,
  listCommentsQuerySchema,
  listCommunityPostsQuerySchema,
  memberProfileSchema,
  reactionRequestSchema,
  reactionSummarySchema,
  reportReceiptSchema,
  updateCommunityPostSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, Viewer } from '../auth/decorators/current-user.decorator.js';
import { OptionalAuth } from '../auth/decorators/public.decorator.js';
import { CommunityService } from './community.service.js';

const idParam = { schema: uuidSchema } as const;

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const NOT_VERIFIED = {
  status: 403,
  code: 'STUDENT_VERIFICATION_REQUIRED',
  message: 'Only verified students can do this. Verify your college to continue.',
} as const;
const POST_NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Post not found' } as const;

const MEMBER = {
  id: '01a0c44b-14bb-724c-98a4-00a05625e026',
  displayName: 'Rahul A.',
  verifiedStudent: true,
  college: { id: '01a0babd-b2d2-725f-9c0f-ddbc81685942', slug: 'abc-college', name: 'ABC College' },
};
const EXAMPLE_POST = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f901',
  category: 'QUESTION',
  visibility: 'COLLEGE_ONLY',
  title: 'Anyone has last year’s DBMS notes?',
  body: 'Looking for the unit 3 and 4 notes.',
  replyTo: null,
  college: MEMBER.college,
  author: MEMBER,
  event: null,
  status: 'ACTIVE',
  moderationNote: null,
  commentCount: 2,
  reactionCount: 5,
  myReaction: null,
  mine: false,
  editedAt: null,
  createdAt: '2026-09-26T10:00:00.000Z',
};
const EXAMPLE_COMMENT = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f911',
  postId: EXAMPLE_POST.id,
  parentId: null,
  body: 'I have them, will share in class.',
  author: MEMBER,
  mine: false,
  createdAt: '2026-09-26T10:05:00.000Z',
};

/**
 * College communities. Reading is open where the post's visibility allows (signed-out visitors see
 * PUBLIC posts only); posting, commenting and reacting need a verified student.
 */
@ApiTags('Community')
@Controller()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @OptionalAuth()
  @Get('community/posts')
  @ResponseMessage('Posts retrieved')
  @ApiOperation({
    summary: 'Community feed',
    description:
      '`scope=college`: my verified college (needs a verified student). `scope=public`: public posts of every college (or one, with `collegeId`). Without `scope`: my college for a verified student, else public. Newest first, cursor paginated.',
  })
  @ApiEnvelopeResponse(cursorPageSchema(communityPostSchema), {
    description: 'A page of posts.',
    example: { message: 'Posts retrieved', data: { items: [EXAMPLE_POST], nextCursor: null } },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_VERIFIED)
  feed(
    @Query({ schema: listCommunityPostsQuerySchema }) query: ListCommunityPostsQuery,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<CursorPage<CommunityPost>> {
    return this.community.feed(viewer?.id ?? null, query);
  }

  @Get('community/channels')
  @ApiBearerAuth()
  @ResponseMessage('Chat sections retrieved')
  @ApiOperation({
    summary: 'My college chat sections',
    description:
      'One section per category with its latest message and message count. Verified students only.',
  })
  @ApiEnvelopeResponse(communityChannelsSchema, {
    description: 'The sections.',
    example: {
      message: 'Chat sections retrieved',
      data: {
        college: MEMBER.college,
        channels: [
          {
            category: 'QUESTION',
            lastMessage: {
              id: EXAMPLE_POST.id,
              text: 'Anyone has last year’s DBMS notes?',
              authorName: 'Rahul A.',
              createdAt: '2026-09-26T10:00:00.000Z',
            },
            messageCount: 12,
          },
        ],
      },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, NOT_VERIFIED)
  channels(@CurrentUser() actor: AuthenticatedUser): Promise<CommunityChannels> {
    return this.community.channels(actor.id);
  }

  @OptionalAuth()
  @Get('community/posts/:id')
  @ResponseMessage('Post retrieved')
  @ApiOperation({
    summary: 'One post',
    description: 'A college-only post is a 404 for anyone outside that college.',
  })
  @ApiEnvelopeResponse(communityPostSchema, {
    description: 'The post.',
    example: { message: 'Post retrieved', data: EXAMPLE_POST },
  })
  @ApiErrorResponses(POST_NOT_FOUND)
  get(
    @Param('id', idParam) id: string,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<CommunityPost> {
    return this.community.get(viewer?.id ?? null, id);
  }

  @Post('community/posts')
  @ApiBearerAuth()
  @ResponseMessage('Post published')
  @ApiOperation({
    summary: 'Write a post',
    description: 'The college is always the author’s verified college; the body cannot set it.',
  })
  @ApiEnvelopeResponse(communityPostSchema, {
    status: 201,
    description: 'The new post.',
    example: { message: 'Post published', data: { ...EXAMPLE_POST, mine: true } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_VERIFIED, 429)
  create(
    @Body({ schema: createCommunityPostSchema }) body: CreateCommunityPostRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CommunityPost> {
    return this.community.create(actor.id, body);
  }

  @Patch('community/posts/:id')
  @ApiBearerAuth()
  @ResponseMessage('Post updated')
  @ApiOperation({ summary: 'Edit my post' })
  @ApiEnvelopeResponse(communityPostSchema, {
    description: 'The post afterwards.',
    example: { message: 'Post updated', data: { ...EXAMPLE_POST, mine: true } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, POST_NOT_FOUND, 409)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: updateCommunityPostSchema }) body: UpdateCommunityPostRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CommunityPost> {
    return this.community.update(actor.id, id, body);
  }

  @Delete('community/posts/:id')
  @ApiBearerAuth()
  @ResponseMessage('Post deleted')
  @ApiOperation({ summary: 'Delete my post' })
  @ApiEnvelopeResponse(z.null(), {
    description: 'Deleted.',
    example: { message: 'Post deleted', data: null },
  })
  @ApiErrorResponses(UNAUTHORIZED, POST_NOT_FOUND)
  async remove(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<null> {
    await this.community.remove(actor.id, id);
    return null;
  }

  @OptionalAuth()
  @Get('community/posts/:id/comments')
  @ResponseMessage('Comments retrieved')
  @ApiOperation({
    summary: 'Comments on a post',
    description: 'Oldest first; replies carry `parentId`.',
  })
  @ApiEnvelopeResponse(cursorPageSchema(communityCommentSchema), {
    description: 'A page of comments.',
    example: {
      message: 'Comments retrieved',
      data: { items: [EXAMPLE_COMMENT], nextCursor: null },
    },
  })
  @ApiErrorResponses(POST_NOT_FOUND)
  comments(
    @Param('id', idParam) id: string,
    @Query({ schema: listCommentsQuerySchema }) query: ListCommentsQuery,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<CursorPage<CommunityComment>> {
    return this.community.comments(viewer?.id ?? null, id, query);
  }

  @Post('community/posts/:id/comments')
  @ApiBearerAuth()
  @ResponseMessage('Comment added')
  @ApiOperation({ summary: 'Comment on a post, or reply to a comment' })
  @ApiEnvelopeResponse(communityCommentSchema, {
    status: 201,
    description: 'The comment.',
    example: { message: 'Comment added', data: { ...EXAMPLE_COMMENT, mine: true } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_VERIFIED, POST_NOT_FOUND)
  comment(
    @Param('id', idParam) id: string,
    @Body({ schema: createCommentSchema }) body: CreateCommentRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<CommunityComment> {
    return this.community.comment(actor.id, id, body);
  }

  @Delete('community/comments/:id')
  @ApiBearerAuth()
  @ResponseMessage('Comment deleted')
  @ApiOperation({ summary: 'Delete my comment' })
  @ApiEnvelopeResponse(z.null(), {
    description: 'Deleted.',
    example: { message: 'Comment deleted', data: null },
  })
  @ApiErrorResponses(UNAUTHORIZED, 404)
  async removeComment(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<null> {
    await this.community.removeComment(actor.id, id);
    return null;
  }

  @Put('community/posts/:id/reaction')
  @ApiBearerAuth()
  @ResponseMessage('Reaction saved')
  @ApiOperation({ summary: 'React to a post', description: 'Reacting again changes the type.' })
  @ApiEnvelopeResponse(reactionSummarySchema, {
    description: 'The counts afterwards.',
    example: { message: 'Reaction saved', data: { reactionCount: 6, myReaction: 'HELPFUL' } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, NOT_VERIFIED, POST_NOT_FOUND)
  react(
    @Param('id', idParam) id: string,
    @Body({ schema: reactionRequestSchema }) body: ReactionRequest,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReactionSummary> {
    return this.community.react(actor.id, id, body);
  }

  @Delete('community/posts/:id/reaction')
  @ApiBearerAuth()
  @ResponseMessage('Reaction removed')
  @ApiOperation({ summary: 'Take my reaction back' })
  @ApiEnvelopeResponse(reactionSummarySchema, {
    description: 'The counts afterwards.',
    example: { message: 'Reaction removed', data: { reactionCount: 5, myReaction: null } },
  })
  @ApiErrorResponses(UNAUTHORIZED, POST_NOT_FOUND)
  unreact(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReactionSummary> {
    return this.community.unreact(actor.id, id);
  }

  @Post('community/posts/:id/report')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ResponseMessage('Report received')
  @ApiOperation({
    summary: 'Report a post',
    description: 'Reporting twice returns the open report.',
  })
  @ApiEnvelopeResponse(reportReceiptSchema, {
    description: 'The report.',
    example: {
      message: 'Report received',
      data: { id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f999', status: 'PENDING' },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, POST_NOT_FOUND)
  reportPost(
    @Param('id', idParam) id: string,
    @Body({ schema: communityReportRequestSchema }) body: CommunityReportRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ReportReceipt> {
    return this.community.reportPost(actor.id, id, body, client);
  }

  @Post('community/comments/:id/report')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ResponseMessage('Report received')
  @ApiOperation({ summary: 'Report a comment' })
  @ApiEnvelopeResponse(reportReceiptSchema, {
    description: 'The report.',
    example: {
      message: 'Report received',
      data: { id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f998', status: 'PENDING' },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, 404)
  reportComment(
    @Param('id', idParam) id: string,
    @Body({ schema: communityReportRequestSchema }) body: CommunityReportRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<ReportReceipt> {
    return this.community.reportComment(actor.id, id, body, client);
  }

  @OptionalAuth()
  @Get('members/:id')
  @ResponseMessage('Member retrieved')
  @ApiOperation({
    summary: 'A member’s public profile',
    description:
      'Name as "First L.", student badge and college. Course and year follow the member’s privacy setting; email and phone never appear.',
  })
  @ApiEnvelopeResponse(memberProfileSchema, {
    description: 'The profile.',
    example: {
      message: 'Member retrieved',
      data: {
        ...MEMBER,
        course: 'BCA',
        year: 2,
        memberSince: '2026-06-01T00:00:00.000Z',
        showsActivity: true,
        blockedByMe: false,
      },
    },
  })
  @ApiErrorResponses(404)
  member(
    @Param('id', idParam) id: string,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<MemberProfile> {
    return this.community.member(viewer?.id ?? null, id);
  }
}
