import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminListSubmissionsQuery,
  type ApproveSubmissionRequest,
  type MarkDuplicateRequest,
  type PlaceSubmission,
  type RejectSubmissionRequest,
  adminListSubmissionsQuerySchema,
  approveSubmissionRequestSchema,
  markDuplicateRequestSchema,
  placeSubmissionSchema,
  rejectSubmissionRequestSchema,
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
import { AdminSubmissionsService } from './admin-submissions.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const FORBIDDEN = {
  status: 403,
  code: 'FORBIDDEN',
  message: 'You do not have permission to perform this action',
} as const;
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Submission not found' } as const;
const ALREADY_REVIEWED = {
  status: 409,
  code: 'CONFLICT',
  message: 'This submission has already been reviewed.',
} as const;

const idParam = { schema: uuidSchema } as const;

const EXAMPLE_SUBMISSION = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f786',
  name: 'New Mess',
  category: { id: '01a0babd-1111-7000-8000-000000000001', slug: 'mess', name: 'Mess' },
  collegeId: null,
  address: 'Station Road, Ahilyanagar',
  city: 'Ahilyanagar',
  latitude: 19.1,
  longitude: 74.76,
  phone: null,
  priceAmount: 3000,
  priceUnit: 'MONTH',
  description: null,
  status: 'PENDING',
  submittedById: '01a0c44b-14bb-724c-98a4-00a05625e026',
  reviewedById: null,
  reviewedAt: null,
  reviewNote: null,
  resultingPlaceId: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f787',
  duplicateOfPlaceId: null,
  duplicateCandidates: [],
  images: [],
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

/**
 * Staff review of the submission queue. Every route needs `submissions.review` (MODERATOR, ADMIN,
 * SUPER_ADMIN). A submission is reviewable only while `PENDING`; a decision is final in this phase —
 * there is no "request changes" loop, so a student who disagrees submits again.
 */
@ApiTags('Admin: Submissions')
@ApiBearerAuth()
@Permissions('submissions.review')
@Controller('admin/submissions')
export class AdminSubmissionsController {
  constructor(private readonly submissions: AdminSubmissionsService) {}

  @Get()
  @ResponseMessage('Submissions retrieved')
  @ApiOperation({
    summary: 'List submissions (the moderation queue)',
    description: 'Filter by `status` (defaults to every status); sort by `newest` (default) or `oldest`.',
  })
  @ApiEnvelopeResponse(z.array(placeSubmissionSchema), {
    description: 'A page of submissions.',
    example: {
      message: 'Submissions retrieved',
      data: [EXAMPLE_SUBMISSION],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListSubmissionsQuerySchema }) query: AdminListSubmissionsQuery,
  ): Promise<Paginated<PlaceSubmission>> {
    return this.submissions.list(query);
  }

  @Get(':id')
  @ResponseMessage('Submission retrieved')
  @ApiOperation({ summary: 'Get one submission' })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    description: 'The submission.',
    example: { message: 'Submission retrieved', data: EXAMPLE_SUBMISSION },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', idParam) id: string): Promise<PlaceSubmission> {
    return this.submissions.get(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Submission approved')
  @ApiOperation({
    summary: 'Approve a submission',
    description: 'Publishes the pending place it created (`PENDING` -> `ACTIVE`). `reason` is optional.',
  })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    description: 'The approved submission.',
    example: { message: 'Submission approved', data: { ...EXAMPLE_SUBMISSION, status: 'APPROVED' } },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, ALREADY_REVIEWED)
  approve(
    @Param('id', idParam) id: string,
    @Body({ schema: approveSubmissionRequestSchema }) body: ApproveSubmissionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceSubmission> {
    return this.submissions.approve(id, body, actor, client);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Submission rejected')
  @ApiOperation({
    summary: 'Reject a submission',
    description:
      'Rejects the submission and the pending place it created; nothing goes live. `reason` is required — ' +
      "it is the student's only feedback.",
  })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    description: 'The rejected submission.',
    example: { message: 'Submission rejected', data: { ...EXAMPLE_SUBMISSION, status: 'REJECTED' } },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
    ALREADY_REVIEWED,
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { reason: ['Reason is required'] } },
    },
  )
  reject(
    @Param('id', idParam) id: string,
    @Body({ schema: rejectSubmissionRequestSchema }) body: RejectSubmissionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceSubmission> {
    return this.submissions.reject(id, body, actor, client);
  }

  @Post(':id/mark-duplicate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Submission marked as a duplicate')
  @ApiOperation({
    summary: 'Mark a submission as a duplicate of an existing place',
    description:
      'Links the submission to `duplicateOfPlaceId` instead of publishing a second place; the pending place ' +
      "it created is rejected. There is no automatic merge of the submitter's details into the existing " +
      'place in this phase (contributions are a separate, later feature).',
  })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    description: 'The submission, marked as a duplicate.',
    example: { message: 'Submission marked as a duplicate', data: { ...EXAMPLE_SUBMISSION, status: 'DUPLICATE' } },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
    ALREADY_REVIEWED,
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { duplicateOfPlaceId: ['Place does not exist'] } },
    },
  )
  markDuplicate(
    @Param('id', idParam) id: string,
    @Body({ schema: markDuplicateRequestSchema }) body: MarkDuplicateRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceSubmission> {
    return this.submissions.markDuplicate(id, body, actor, client);
  }
}
