import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UPLOAD_IMAGE_MAX_BYTES,
  type ConfirmEmailVerification,
  type Profile,
  type RequestEmailVerification,
  type Settings,
  type StudentStatus,
  type UpdateProfile,
  type UpdateSettings,
  confirmEmailVerificationSchema,
  documentVerificationFieldsSchema,
  profileSchema,
  requestEmailVerificationSchema,
  settingsSchema,
  studentStatusSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { AuthRateLimit } from '../../common/http/auth-rate-limit.decorator.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ProfileService } from './profile.service.js';
import { type IncomingFile, StudentVerificationService } from './student-verification.service.js';

const UNAUTHORIZED = {
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
} as const;
const ALREADY_VERIFIED = {
  status: 409,
  code: 'ALREADY_VERIFIED',
  message:
    'You are already a verified student. You can verify again once your verification expires.',
} as const;

const EXAMPLE_STATUS = {
  state: 'PENDING',
  badge: { verified: false, college: null, verifiedUntil: null },
  pending: {
    id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f811',
    method: 'COLLEGE_EMAIL',
    college: {
      id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
      slug: 'abc-college',
      name: 'ABC College',
    },
    collegeEmail: 'as***@abccollege.edu.in',
    codeExpiresAt: '2026-09-25T10:15:00.000Z',
    createdAt: '2026-09-25T10:00:00.000Z',
  },
  lastDecision: null,
};

const EXAMPLE_PROFILE = {
  id: '01a0c44b-14bb-724c-98a4-00a05625e026',
  name: 'Asha Kulkarni',
  email: 'asha@example.com',
  college: { id: '01a0babd-b2d2-725f-9c0f-ddbc81685942', slug: 'abc-college', name: 'ABC College' },
  course: 'BCA',
  year: 2,
  student: {
    verified: true,
    college: {
      id: '01a0babd-b2d2-725f-9c0f-ddbc81685942',
      slug: 'abc-college',
      name: 'ABC College',
    },
    verifiedUntil: '2027-09-25T10:00:00.000Z',
  },
  memberSince: '2026-09-01T10:00:00.000Z',
};

const EXAMPLE_SETTINGS = {
  profileVisibility: 'STUDENTS',
  showCommunityActivity: true,
  allowMarketplaceMessages: true,
  notifyCommunity: true,
  notifyMarketplace: true,
  notifyEvents: true,
  notifyJobs: false,
  notifyMessages: true,
};

/** The signed-in member's student verification, profile and settings. */
@ApiTags('Me: Student verification & profile')
@ApiBearerAuth()
@Controller('me')
export class StudentsController {
  constructor(
    private readonly verification: StudentVerificationService,
    private readonly profiles: ProfileService,
  ) {}

  @Get('student-verification')
  @ResponseMessage('Student verification status retrieved')
  @ApiOperation({ summary: 'My student verification status' })
  @ApiEnvelopeResponse(studentStatusSchema, {
    description:
      'Verified, waiting, lapsed or never verified, with any open request and the last decision.',
    example: { message: 'Student verification status retrieved', data: EXAMPLE_STATUS },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  status(@CurrentUser() actor: AuthenticatedUser): Promise<StudentStatus> {
    return this.verification.status(actor);
  }

  @Post('student-verification/email')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit()
  @ResponseMessage('Verification code sent')
  @ApiOperation({
    summary: 'Send a code to my college email',
    description:
      'The address must be on an official email domain staff listed for that college (a subdomain counts). ' +
      'A 6-digit code valid for 15 minutes is emailed; a newer request replaces an older one. Rate limited like sign-in ' +
      '(`AUTH_RATE_LIMIT`).',
  })
  @ApiEnvelopeResponse(studentStatusSchema, {
    description: 'The status, now with a pending request.',
    example: { message: 'Verification code sent', data: EXAMPLE_STATUS },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { email: ['This is not an official ABC College email address.'] } },
    },
    ALREADY_VERIFIED,
    429,
  )
  requestEmail(
    @Body({ schema: requestEmailVerificationSchema }) body: RequestEmailVerification,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<StudentStatus> {
    return this.verification.requestEmail(body, actor, client);
  }

  @Post('student-verification/email/confirm')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit()
  @ResponseMessage('Student verification complete')
  @ApiOperation({
    summary: 'Enter the code from my college email',
    description:
      'At most 5 wrong codes, then ask for a new one. On success the account is a Verified Student.',
  })
  @ApiEnvelopeResponse(studentStatusSchema, {
    description: 'The status, now verified.',
    example: {
      message: 'Student verification complete',
      data: { ...EXAMPLE_STATUS, state: 'VERIFIED', pending: null, badge: EXAMPLE_PROFILE.student },
    },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    { status: 400, code: 'TOKEN_EXPIRED', message: 'This code has expired. Ask for a new one.' },
    429,
  )
  confirmEmail(
    @Body({ schema: confirmEmailVerificationSchema }) body: ConfirmEmailVerification,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<StudentStatus> {
    return this.verification.confirmEmail(body, actor, client);
  }

  @Post('student-verification/document')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: UPLOAD_IMAGE_MAX_BYTES, files: 1, fields: 1, parts: 2 },
    }),
  )
  @ResponseMessage('Student ID submitted for review')
  @ApiOperation({
    summary: 'Send a photo of my student ID for review',
    description:
      'Multipart: `collegeId` and `file` (JPEG, PNG or WebP, at most 5 MB). The photo goes to PRIVATE ' +
      'storage: never public, visible only to staff reviewing it, and deleted as soon as they decide. Cover ' +
      'anything you do not want seen (ID number, date of birth): staff only need your name, the college ' +
      'and a current academic year.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['collegeId', 'file'],
      properties: {
        collegeId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiEnvelopeResponse(studentStatusSchema, {
    description: 'The status, now waiting for review.',
    example: {
      message: 'Student ID submitted for review',
      data: {
        ...EXAMPLE_STATUS,
        pending: {
          ...EXAMPLE_STATUS.pending,
          method: 'DOCUMENT',
          collegeEmail: null,
          codeExpiresAt: null,
        },
      },
    },
  })
  @ApiErrorResponses(
    UNAUTHORIZED,
    { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'File too large' },
    {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Upload a JPEG, PNG or WebP photo of your ID card.',
    },
    ALREADY_VERIFIED,
    429,
  )
  submitDocument(
    @Body() body: unknown,
    @UploadedFile() file: IncomingFile | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<StudentStatus> {
    const fields = documentVerificationFieldsSchema.safeParse(body);
    if (!fields.success)
      throw AppException.validation({ collegeId: ['Choose a college from the list'] });
    return this.verification.submitDocument(fields.data.collegeId, file, actor, client);
  }

  @Delete('student-verification')
  @ResponseMessage('Verification request cancelled')
  @ApiOperation({
    summary: 'Cancel my waiting request',
    description: 'Deletes a submitted ID photo too.',
  })
  @ApiEnvelopeResponse(studentStatusSchema, {
    description: 'The status afterwards.',
    example: {
      message: 'Verification request cancelled',
      data: { ...EXAMPLE_STATUS, state: 'UNVERIFIED', pending: null },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'There is no request to cancel.',
  })
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<StudentStatus> {
    return this.verification.cancel(actor, client);
  }

  @Get('profile')
  @ResponseMessage('Profile retrieved')
  @ApiOperation({ summary: 'My profile' })
  @ApiEnvelopeResponse(profileSchema, {
    description: 'The profile.',
    example: { message: 'Profile retrieved', data: EXAMPLE_PROFILE },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  profile(@CurrentUser() actor: AuthenticatedUser): Promise<Profile> {
    return this.profiles.profile(actor.id);
  }

  @Patch('profile')
  @ResponseMessage('Profile updated')
  @ApiOperation({
    summary: 'Update my profile',
    description:
      'Name, the college I browse, course and year. The verified college never changes here.',
  })
  @ApiEnvelopeResponse(profileSchema, {
    description: 'The updated profile.',
    example: { message: 'Profile updated', data: EXAMPLE_PROFILE },
  })
  @ApiErrorResponses(UNAUTHORIZED, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: { fields: { collegeId: ['Choose a college from the list'] } },
  })
  updateProfile(
    @Body({ schema: updateProfileSchema }) body: UpdateProfile,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Profile> {
    return this.profiles.updateProfile(body, actor, client);
  }

  @Get('settings')
  @ResponseMessage('Settings retrieved')
  @ApiOperation({ summary: 'My privacy and notification settings' })
  @ApiEnvelopeResponse(settingsSchema, {
    description: 'The settings (defaults until changed).',
    example: { message: 'Settings retrieved', data: EXAMPLE_SETTINGS },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  settings(@CurrentUser() actor: AuthenticatedUser): Promise<Settings> {
    return this.profiles.settings(actor.id);
  }

  @Patch('settings')
  @ResponseMessage('Settings updated')
  @ApiOperation({
    summary: 'Change my privacy and notification settings',
    description: 'Only what is sent changes.',
  })
  @ApiEnvelopeResponse(settingsSchema, {
    description: 'The settings afterwards.',
    example: { message: 'Settings updated', data: EXAMPLE_SETTINGS },
  })
  @ApiErrorResponses(UNAUTHORIZED)
  updateSettings(
    @Body({ schema: updateSettingsSchema }) body: UpdateSettings,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<Settings> {
    return this.profiles.updateSettings(body, actor, client);
  }
}
