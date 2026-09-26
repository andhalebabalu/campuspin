import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminListStudentVerificationsQuery,
  type AdminStudentVerification,
  type ApproveStudentVerification,
  type CollegeEmailDomain,
  type CollegeEmailDomainInput,
  type DecideStudentVerification,
  adminListStudentVerificationsQuerySchema,
  adminStudentVerificationSchema,
  approveStudentVerificationSchema,
  collegeEmailDomainInputSchema,
  collegeEmailDomainSchema,
  decideStudentVerificationSchema,
  uuidSchema,
} from '@platform/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { AdminStudentVerificationsService } from './admin-student-verifications.service.js';

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
const NOT_FOUND = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Verification request not found',
} as const;
const DECIDED = {
  status: 409,
  code: 'CONFLICT',
  message: 'This request has already been decided.',
} as const;
const idParam = { schema: uuidSchema } as const;

const EXAMPLE = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f811',
  status: 'PENDING',
  method: 'DOCUMENT',
  user: {
    id: '01a0c44b-14bb-724c-98a4-00a05625e026',
    name: 'Asha Kulkarni',
    email: 'asha@example.com',
  },
  college: { id: '01a0babd-b2d2-725f-9c0f-ddbc81685942', slug: 'abc-college', name: 'ABC College' },
  collegeEmail: null,
  hasDocument: true,
  documentType: 'image/jpeg',
  reviewNote: null,
  reviewedById: null,
  reviewedAt: null,
  verifiedAt: null,
  expiresAt: null,
  createdAt: '2026-09-25T10:00:00.000Z',
};

/** Staff review of student verifications. Every route needs `verifications.review`. */
@ApiTags('Admin: Student verification')
@ApiBearerAuth()
@Permissions('verifications.review')
@Controller('admin/student-verifications')
export class AdminStudentVerificationsController {
  constructor(private readonly service: AdminStudentVerificationsService) {}

  @Get()
  @ResponseMessage('Verification requests retrieved')
  @ApiOperation({
    summary: 'List verification requests',
    description:
      'Filter by `status`, `method`, `collegeId`. With `status=PENDING`, the oldest comes first.',
  })
  @ApiEnvelopeResponse(z.array(adminStudentVerificationSchema), {
    description: 'A page of requests.',
    example: {
      message: 'Verification requests retrieved',
      data: [EXAMPLE],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListStudentVerificationsQuerySchema })
    query: AdminListStudentVerificationsQuery,
  ): Promise<Paginated<AdminStudentVerification>> {
    return this.service.list(query);
  }

  @Get(':id')
  @ResponseMessage('Verification request retrieved')
  @ApiOperation({ summary: 'Get one verification request' })
  @ApiEnvelopeResponse(adminStudentVerificationSchema, {
    description: 'The request.',
    example: { message: 'Verification request retrieved', data: EXAMPLE },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  get(@Param('id', idParam) id: string): Promise<AdminStudentVerification> {
    return this.service.get(id);
  }

  @Get(':id/document')
  @ApiOperation({
    summary: 'Open the student ID photo',
    description:
      'The image bytes themselves (not JSON), never cached, only while the request is undecided. Each opening ' +
      'is audited.',
  })
  @ApiOkResponse({
    description: 'The image.',
    content: { 'image/jpeg': {}, 'image/png': {}, 'image/webp': {} },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'No document is stored for this request.',
  })
  async document(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, type } = await this.service.document(id, actor, client);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(bytes);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Student verified')
  @ApiOperation({
    summary: 'Approve an ID-photo request',
    description: 'The member becomes a Verified Student of that college; the photo is deleted.',
  })
  @ApiEnvelopeResponse(adminStudentVerificationSchema, {
    description: 'The request, now verified.',
    example: {
      message: 'Student verified',
      data: { ...EXAMPLE, status: 'VERIFIED', hasDocument: false },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, DECIDED)
  approve(
    @Param('id', idParam) id: string,
    @Body({ schema: approveStudentVerificationSchema }) body: ApproveStudentVerification,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminStudentVerification> {
    return this.service.approve(id, body?.reason, actor, client);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Verification rejected')
  @ApiOperation({
    summary: 'Reject a request',
    description: 'The reason is shown to the student only. The photo is deleted.',
  })
  @ApiEnvelopeResponse(adminStudentVerificationSchema, {
    description: 'The request, now rejected.',
    example: {
      message: 'Verification rejected',
      data: { ...EXAMPLE, status: 'REJECTED', hasDocument: false },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, DECIDED)
  reject(
    @Param('id', idParam) id: string,
    @Body({ schema: decideStudentVerificationSchema }) body: DecideStudentVerification,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminStudentVerification> {
    return this.service.reject(id, body.reason, actor, client);
  }

  @Post(':id/request-reverification')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Re-verification requested')
  @ApiOperation({
    summary: 'Ask a verified student to verify again',
    description: 'Ends that affiliation now; the student is told why and can verify again.',
  })
  @ApiEnvelopeResponse(adminStudentVerificationSchema, {
    description: 'The request, now expired.',
    example: {
      message: 'Re-verification requested',
      data: { ...EXAMPLE, status: 'EXPIRED', hasDocument: false },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, DECIDED)
  requestReverification(
    @Param('id', idParam) id: string,
    @Body({ schema: decideStudentVerificationSchema }) body: DecideStudentVerification,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminStudentVerification> {
    return this.service.requestReverification(id, body.reason, actor, client);
  }
}

const EXAMPLE_DOMAINS = [
  {
    id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f821',
    domain: 'abccollege.edu.in',
    createdAt: '2026-09-25T10:00:00.000Z',
  },
];

/** Each college's official email domains (behind `verifications.review`). */
@ApiTags('Admin: Student verification')
@ApiBearerAuth()
@Permissions('verifications.review')
@Controller('admin/colleges/:collegeId/email-domains')
export class CollegeEmailDomainsController {
  constructor(private readonly service: AdminStudentVerificationsService) {}

  @Get()
  @ResponseMessage('Email domains retrieved')
  @ApiOperation({ summary: "A college's official email domains" })
  @ApiEnvelopeResponse(z.array(collegeEmailDomainSchema), {
    description: 'The domains.',
    example: { message: 'Email domains retrieved', data: EXAMPLE_DOMAINS },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'College not found',
  })
  list(@Param('collegeId', idParam) collegeId: string): Promise<CollegeEmailDomain[]> {
    return this.service.domains(collegeId);
  }

  @Post()
  @ResponseMessage('Email domain added')
  @ApiOperation({
    summary: 'Add an official email domain',
    description: 'Lowercase, no "@". A domain belongs to one college only.',
  })
  @ApiEnvelopeResponse(z.array(collegeEmailDomainSchema), {
    status: 201,
    description: 'The domains afterwards.',
    example: { message: 'Email domain added', data: EXAMPLE_DOMAINS },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: { fields: { domain: ['This domain is already listed for a college'] } },
  })
  add(
    @Param('collegeId', idParam) collegeId: string,
    @Body({ schema: collegeEmailDomainInputSchema }) body: CollegeEmailDomainInput,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<CollegeEmailDomain[]> {
    return this.service.addDomain(collegeId, body, actor, client);
  }

  @Delete(':domainId')
  @ResponseMessage('Email domain removed')
  @ApiOperation({
    summary: 'Remove an email domain',
    description: 'Already-verified students stay verified.',
  })
  @ApiEnvelopeResponse(z.array(collegeEmailDomainSchema), {
    description: 'The domains afterwards.',
    example: { message: 'Email domain removed', data: [] },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Domain not found',
  })
  remove(
    @Param('collegeId', idParam) collegeId: string,
    @Param('domainId', idParam) domainId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<CollegeEmailDomain[]> {
    return this.service.removeDomain(collegeId, domainId, actor, client);
  }
}
