import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminCommunityPost,
  type AdminListCommunityPostsQuery,
  type AdminListListingsQuery,
  type AdminListReportsQuery,
  type AdminListing,
  type AdminReport,
  type DismissReportRequest,
  type ModerationNote,
  type ModerationReason,
  type ResolveReportRequest,
  adminCommunityPostSchema,
  adminListCommunityPostsQuerySchema,
  adminListListingsQuerySchema,
  adminListReportsQuerySchema,
  adminListingSchema,
  adminReportSchema,
  dismissReportSchema,
  moderationNoteSchema,
  moderationReasonSchema,
  resolveReportSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ContentModerationService } from './content-moderation.service.js';
import { ReportsAdminService } from './reports-admin.service.js';

const idParam = { schema: uuidSchema } as const;
const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const FORBIDDEN = { status: 403, code: 'FORBIDDEN', message: 'Forbidden' } as const;
const CONFLICT = { status: 409, code: 'CONFLICT', message: 'This was removed for good.' } as const;
const PAGE = { page: 1, limit: 20, total: 1, totalPages: 1 };

const COLLEGE = {
  id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
  slug: 'abc-college',
  name: 'ABC College',
};
const MEMBER = { id: '01a0c44b-14bb-724c-98a4-00a05625e026', name: 'Rahul Awasthi' };

const EXAMPLE_REPORT = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0fd01',
  status: 'PENDING',
  reason: 'SPAM',
  description: 'Posted five times',
  reporter: { id: '01a0c44b-14bb-724c-98a4-00a05625e027', name: 'Asha Kulkarni' },
  target: {
    type: 'COMMUNITY_POST',
    id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f901',
    label: 'Cheap notes!!!',
    excerpt: 'DM me for notes…',
    status: 'ACTIVE',
    owner: MEMBER,
    link: '/community/posts/01a0cd43-97e5-76be-bc3a-8f8eaaf0f901',
  },
  openReportsOnTarget: 3,
  resolution: null,
  resolvedAt: null,
  createdAt: '2026-09-26T10:00:00.000Z',
};
const EXAMPLE_POST = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f901',
  title: 'Cheap notes!!!',
  body: 'DM me for notes…',
  category: 'STUDY',
  visibility: 'COLLEGE_ONLY',
  status: 'HIDDEN',
  moderationNote: 'Spam',
  college: COLLEGE,
  author: MEMBER,
  commentCount: 0,
  openReports: 0,
  createdAt: '2026-09-26T10:00:00.000Z',
};
const EXAMPLE_LISTING = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0fa01',
  title: 'Engineering Maths (Kreyszig)',
  description: 'Clean copy.',
  price: 350,
  status: 'HIDDEN',
  moderationNote: 'Suspected scam',
  college: COLLEGE,
  seller: MEMBER,
  coverImageUrl: null,
  openReports: 0,
  createdAt: '2026-09-26T10:00:00.000Z',
};

/**
 * Member reports. Any staff role may open it; each sees the reports their permissions cover
 * (community.moderate: posts, comments, members; marketplace.moderate: listings, members).
 */
@ApiTags('Admin: Reports')
@ApiBearerAuth()
@Roles('MODERATOR', 'ADMIN', 'SUPER_ADMIN')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsAdminService) {}

  @Get()
  @ResponseMessage('Reports retrieved')
  @ApiOperation({ summary: 'Reports queue', description: 'Open ones oldest first.' })
  @ApiEnvelopeResponse(z.array(adminReportSchema), {
    description: 'A page of reports.',
    example: { message: 'Reports retrieved', data: [EXAMPLE_REPORT], meta: PAGE },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListReportsQuerySchema }) query: AdminListReportsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<AdminReport>> {
    return this.reports.list(actor, query);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Report resolved')
  @ApiOperation({
    summary: 'Resolve a report',
    description:
      '`action`: NONE, HIDE (reversible) or REMOVE (final) the reported content. Closes every open report on it.',
  })
  @ApiEnvelopeResponse(adminReportSchema, {
    description: 'The report afterwards.',
    example: { message: 'Report resolved', data: { ...EXAMPLE_REPORT, status: 'RESOLVED' } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, 409)
  resolve(
    @Param('id', idParam) id: string,
    @Body({ schema: resolveReportSchema }) body: ResolveReportRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminReport> {
    return this.reports.resolve(id, body, actor, client);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Report dismissed')
  @ApiOperation({ summary: 'Dismiss a report', description: 'Nothing wrong with the content.' })
  @ApiEnvelopeResponse(adminReportSchema, {
    description: 'The report afterwards.',
    example: { message: 'Report dismissed', data: { ...EXAMPLE_REPORT, status: 'DISMISSED' } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, 409)
  dismiss(
    @Param('id', idParam) id: string,
    @Body({ schema: dismissReportSchema }) body: DismissReportRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminReport> {
    return this.reports.dismiss(id, body, actor, client);
  }
}

/** Community moderation: every college's posts, and removing comments. */
@ApiTags('Admin: Community')
@ApiBearerAuth()
@Permissions('community.moderate')
@Controller('admin/community')
export class AdminCommunityController {
  constructor(private readonly content: ContentModerationService) {}

  @Get('posts')
  @ResponseMessage('Posts retrieved')
  @ApiOperation({
    summary: 'Community posts, all colleges',
    description: '`reported=true` for posts with open reports.',
  })
  @ApiEnvelopeResponse(z.array(adminCommunityPostSchema), {
    description: 'A page of posts.',
    example: { message: 'Posts retrieved', data: [EXAMPLE_POST], meta: PAGE },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  posts(
    @Query({ schema: adminListCommunityPostsQuerySchema }) query: AdminListCommunityPostsQuery,
  ): Promise<Paginated<AdminCommunityPost>> {
    return this.content.posts(query);
  }

  @Post('posts/:id/hide')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Post hidden')
  @ApiOperation({ summary: 'Hide a post', description: 'Reversible; the author sees the reason.' })
  @ApiEnvelopeResponse(adminCommunityPostSchema, {
    description: 'The post afterwards.',
    example: { message: 'Post hidden', data: EXAMPLE_POST },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, CONFLICT)
  hide(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationReasonSchema }) body: ModerationReason,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCommunityPost> {
    return this.content.setPostStatus(id, 'HIDDEN', body.reason, actor, client);
  }

  @Post('posts/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Post restored')
  @ApiOperation({ summary: 'Restore a hidden post' })
  @ApiEnvelopeResponse(adminCommunityPostSchema, {
    description: 'The post afterwards.',
    example: {
      message: 'Post restored',
      data: { ...EXAMPLE_POST, status: 'ACTIVE', moderationNote: null },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, CONFLICT)
  restore(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationNoteSchema }) body: ModerationNote,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCommunityPost> {
    return this.content.setPostStatus(id, 'ACTIVE', body?.reason, actor, client);
  }

  @Post('posts/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Post removed')
  @ApiOperation({ summary: 'Remove a post for good' })
  @ApiEnvelopeResponse(adminCommunityPostSchema, {
    description: 'The post afterwards.',
    example: { message: 'Post removed', data: { ...EXAMPLE_POST, status: 'REMOVED' } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, CONFLICT)
  remove(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationReasonSchema }) body: ModerationReason,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminCommunityPost> {
    return this.content.setPostStatus(id, 'REMOVED', body.reason, actor, client);
  }

  @Post('comments/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Comment removed')
  @ApiOperation({ summary: 'Remove a comment' })
  @ApiEnvelopeResponse(z.null(), {
    description: 'Removed.',
    example: { message: 'Comment removed', data: null },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404)
  async removeComment(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationReasonSchema }) body: ModerationReason,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<null> {
    await this.content.removeComment(id, body.reason, actor, client);
    return null;
  }
}

/** Marketplace moderation: every listing on the platform. */
@ApiTags('Admin: Marketplace')
@ApiBearerAuth()
@Permissions('marketplace.moderate')
@Controller('admin/marketplace')
export class AdminMarketplaceController {
  constructor(private readonly content: ContentModerationService) {}

  @Get('listings')
  @ResponseMessage('Listings retrieved')
  @ApiOperation({
    summary: 'Listings, all colleges',
    description: '`reported=true` for listings with open reports.',
  })
  @ApiEnvelopeResponse(z.array(adminListingSchema), {
    description: 'A page of listings.',
    example: { message: 'Listings retrieved', data: [EXAMPLE_LISTING], meta: PAGE },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  listings(
    @Query({ schema: adminListListingsQuerySchema }) query: AdminListListingsQuery,
  ): Promise<Paginated<AdminListing>> {
    return this.content.listings(query);
  }

  @Post('listings/:id/hide')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Listing hidden')
  @ApiOperation({
    summary: 'Hide a listing',
    description: 'Reversible; the seller sees the reason.',
  })
  @ApiEnvelopeResponse(adminListingSchema, {
    description: 'The listing afterwards.',
    example: { message: 'Listing hidden', data: EXAMPLE_LISTING },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, CONFLICT)
  hide(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationReasonSchema }) body: ModerationReason,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminListing> {
    return this.content.setListingStatus(id, 'HIDDEN', body.reason, actor, client);
  }

  @Post('listings/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Listing restored')
  @ApiOperation({ summary: 'Restore a hidden listing' })
  @ApiEnvelopeResponse(adminListingSchema, {
    description: 'The listing afterwards.',
    example: {
      message: 'Listing restored',
      data: { ...EXAMPLE_LISTING, status: 'ACTIVE', moderationNote: null },
    },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, CONFLICT)
  restore(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationNoteSchema }) body: ModerationNote,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminListing> {
    return this.content.setListingStatus(id, 'ACTIVE', body?.reason, actor, client);
  }

  @Post('listings/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Listing removed')
  @ApiOperation({ summary: 'Remove a listing for good' })
  @ApiEnvelopeResponse(adminListingSchema, {
    description: 'The listing afterwards.',
    example: { message: 'Listing removed', data: { ...EXAMPLE_LISTING, status: 'REMOVED' } },
  })
  @ApiErrorResponses(400, UNAUTHORIZED, FORBIDDEN, 404, CONFLICT)
  remove(
    @Param('id', idParam) id: string,
    @Body({ schema: moderationReasonSchema }) body: ModerationReason,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminListing> {
    return this.content.setListingStatus(id, 'REMOVED', body.reason, actor, client);
  }
}
