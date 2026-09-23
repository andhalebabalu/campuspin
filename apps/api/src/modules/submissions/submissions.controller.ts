import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CreateSubmissionRequest,
  type DuplicateCheckRequest,
  type DuplicateCheckResponse,
  type PlaceSubmission,
  createSubmissionRequestSchema,
  duplicateCheckRequestSchema,
  duplicateCheckResponseSchema,
  placeSubmissionSchema,
  uuidSchema,
} from '@platform/contracts';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { SubmissionsService } from './submissions.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;

const EXAMPLE_CANDIDATE = {
  placeId: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f785',
  name: 'Sample Mess',
  slug: 'sample-mess',
  distanceMeters: 40,
  score: 0.91,
  level: 'block',
  reasons: ['Similar name', '40 m away', 'Same category'],
};

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
 * "Suggest a place": any signed-in user can check for duplicates, submit a new place, and check on
 * their own submission's status afterwards. Staff review lives at `/admin/submissions`.
 */
@ApiTags('Submissions')
@ApiBearerAuth()
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post('places/duplicate-check')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Duplicate check complete')
  @ApiOperation({
    summary: 'Check whether a place like this may already exist',
    description:
      'Client-triggered (as-you-type once a category and a map point are picked). Scores nearby places on ' +
      'name similarity, distance, category and phone; only `suggest`- and `block`-level candidates are ' +
      'returned, best first. This is a head start for the UI — `POST /place-submissions` re-runs the same ' +
      'check server-side and is the one that actually blocks a submission.',
  })
  @ApiEnvelopeResponse(duplicateCheckResponseSchema, {
    description: 'Candidates worth showing the student, if any.',
    example: { message: 'Duplicate check complete', data: { candidates: [EXAMPLE_CANDIDATE] } },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { categoryId: ['Category does not exist'] } },
    },
    429,
  )
  duplicateCheck(
    @Body({ schema: duplicateCheckRequestSchema }) body: DuplicateCheckRequest,
  ): Promise<DuplicateCheckResponse> {
    return this.submissions.duplicateCheck(body);
  }

  @Post('place-submissions')
  @ResponseMessage('Place suggested')
  @ApiOperation({
    summary: 'Suggest a new place',
    description:
      'Creates a place (status `PENDING`, invisible to the public until approved) and a submission recording ' +
      'the workflow. Duplicate detection runs again here, authoritatively: if a candidate scores at or above ' +
      'the `block` threshold and `confirmDifferent` was not sent as `true`, this answers `409 ' +
      'DUPLICATE_PLACE_SUSPECTED` with the candidates instead of creating anything.',
  })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    status: 201,
    description: 'The new submission.',
    example: { message: 'Place suggested', data: EXAMPLE_SUBMISSION },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { categoryId: ['This is a group; pick one of its categories'] } },
    },
    {
      status: 409,
      code: 'DUPLICATE_PLACE_SUSPECTED',
      message:
        'This looks like it might already exist. Review the matches, or confirm this is a different place.',
      details: { candidates: [EXAMPLE_CANDIDATE] },
    },
    429,
  )
  create(
    @Body({ schema: createSubmissionRequestSchema }) body: CreateSubmissionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceSubmission> {
    return this.submissions.create(body, actor, client);
  }

  @Get('place-submissions/:id')
  @ResponseMessage('Submission retrieved')
  @ApiOperation({
    summary: 'Get one submission',
    description:
      'Visible to the student who made it, and to staff with `submissions.review`. Anyone else gets a 404 ' +
      '(existence is not revealed).',
  })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    description: 'The submission.',
    example: { message: 'Submission retrieved', data: EXAMPLE_SUBMISSION },
  })
  @ApiErrorResponses(UNAUTHORIZED, { status: 404, code: 'NOT_FOUND', message: 'Submission not found' })
  get(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PlaceSubmission> {
    return this.submissions.get(id, actor);
  }
}
