import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type LoginResponse,
  type RefreshRequest,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ResendVerificationRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
  authUserSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from '@platform/contracts';
import { z } from 'zod';
import { AuthRateLimit } from '../../common/http/auth-rate-limit.decorator.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';

/** `data` of the endpoints whose answer is only the message. */
const noData = z.null();

/** Sample values for Swagger. Ids and tokens are illustrative and truncated. */
const EXAMPLE_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTk5...';
const EXAMPLE_REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiI5ZjJj...';
const EXAMPLE_USER = {
  id: '0199c3b2-7d41-7b3e-9a52-6f8e1c0d4a21',
  name: 'Asha Patil',
  email: 'student@example.com',
  emailVerified: true,
  roles: ['STUDENT'],
  permissions: ['categories.read', 'colleges.read', 'places.read'],
};
/** What register returns: the user without permissions (there is no session yet). */
const EXAMPLE_NEW_USER = {
  id: EXAMPLE_USER.id,
  name: EXAMPLE_USER.name,
  email: EXAMPLE_USER.email,
  emailVerified: false,
  roles: EXAMPLE_USER.roles,
};

const MESSAGES = {
  register: 'Registration successful. Please check your email to verify your account.',
  verifyEmail: 'Email verified successfully',
  resend:
    'If an account exists for this email and it is not verified yet, a new verification link has been sent.',
  login: 'Login successful',
  refresh: 'Token refreshed',
  logout: 'Logged out successfully',
  logoutAll: 'Logged out from all devices',
  me: 'Current user retrieved',
  forgot: 'If an account exists for this email, a password reset link has been sent.',
  reset: 'Password reset successful. Please sign in with your new password.',
} as const;

const GENERIC_ACCOUNT_NOTE =
  'The response is identical whether or not an account exists for the email, so this endpoint ' +
  'cannot be used to discover which emails are registered.';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @AuthRateLimit()
  @ResponseMessage(MESSAGES.register)
  @ApiOperation({
    summary: 'Create a student account',
    description:
      'Creates an account with the STUDENT role and emails a verification link. The account cannot ' +
      'sign in until the email is verified. The password must be 10+ characters with a mix of ' +
      'character types (or a 16+ character passphrase) and must not be a common password.',
  })
  @ApiEnvelopeResponse(registerResponseSchema, {
    status: 201,
    description: 'Account created.',
    example: { message: MESSAGES.register, data: { user: EXAMPLE_NEW_USER } },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: { fields: { password: ['This password is too common or easy to guess'] } },
    },
    {
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with this email already exists.',
    },
    429,
  )
  register(
    @Body({ schema: registerRequestSchema }) body: RegisterRequest,
    @RequestClient() client: ClientContext,
  ): Promise<RegisterResponse> {
    return this.auth.register(body, client);
  }

  @Post('verify-email')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.verifyEmail)
  @ApiOperation({
    summary: 'Verify an email address',
    description:
      'Consumes the single-use token from the verification email. Codes: `TOKEN_INVALID` (unknown ' +
      'or already used), `TOKEN_EXPIRED` (request a new link with resend-verification).',
  })
  @ApiEnvelopeResponse(verifyEmailResponseSchema, {
    description: 'Email verified.',
    example: { message: MESSAGES.verifyEmail, data: { emailVerified: true } },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'TOKEN_EXPIRED',
      message: 'This verification link has expired. Please request a new one.',
    },
    429,
  )
  async verifyEmail(
    @Body({ schema: verifyEmailRequestSchema }) body: VerifyEmailRequest,
    @RequestClient() client: ClientContext,
  ): Promise<{ emailVerified: true }> {
    await this.auth.verifyEmail(body, client);
    return { emailVerified: true };
  }

  @Post('resend-verification')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.resend)
  @ApiOperation({
    summary: 'Send a new verification link',
    description: `Invalidates earlier links and emails a new one. ${GENERIC_ACCOUNT_NOTE}`,
  })
  @ApiEnvelopeResponse(noData, {
    description: 'Request accepted (always, for any email).',
    example: { message: MESSAGES.resend, data: null },
  })
  @ApiErrorResponses(400, 429)
  resendVerification(
    @Body({ schema: resendVerificationRequestSchema }) body: ResendVerificationRequest,
    @RequestClient() client: ClientContext,
  ): Promise<void> {
    return this.auth.resendVerification(body, client);
  }

  @Post('login')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.login)
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns a short-lived access token (send it as `Authorization: Bearer <token>`) and a ' +
      'long-lived refresh token (use it once with `/auth/refresh`). A wrong email or password is ' +
      'always the same 401 `INVALID_CREDENTIALS`. After the password is verified, `EMAIL_NOT_VERIFIED`, ' +
      '`ACCOUNT_SUSPENDED` and `ACCOUNT_DEACTIVATED` (all 403) explain why sign-in is refused.',
  })
  @ApiEnvelopeResponse(loginResponseSchema, {
    description: 'Signed in.',
    example: {
      message: MESSAGES.login,
      data: {
        accessToken: EXAMPLE_ACCESS_TOKEN,
        refreshToken: EXAMPLE_REFRESH_TOKEN,
        user: EXAMPLE_USER,
      },
    },
  })
  @ApiErrorResponses(
    400,
    { status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    {
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email before signing in.',
    },
    429,
  )
  login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @RequestClient() client: ClientContext,
  ): Promise<LoginResponse> {
    return this.auth.login(body, client);
  }

  @Post('refresh')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.refresh)
  @ApiOperation({
    summary: 'Get a new access token',
    description:
      'Exchanges the refresh token for a new access token AND a new refresh token; the old refresh ' +
      'token stops working immediately (rotation). Presenting an already-rotated token revokes the ' +
      'whole session. Send refresh requests one at a time. Any failure is a 401 `TOKEN_INVALID`.',
  })
  @ApiEnvelopeResponse(refreshResponseSchema, {
    description: 'Tokens rotated.',
    example: {
      message: MESSAGES.refresh,
      data: { accessToken: EXAMPLE_ACCESS_TOKEN, refreshToken: EXAMPLE_REFRESH_TOKEN },
    },
  })
  @ApiErrorResponses(
    400,
    { status: 401, code: 'TOKEN_INVALID', message: 'Invalid or expired refresh token' },
    {
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account has been suspended. Please contact support.',
    },
    429,
  )
  refresh(
    @Body({ schema: refreshRequestSchema }) body: RefreshRequest,
    @RequestClient() client: ClientContext,
  ): Promise<RefreshResponse> {
    return this.auth.refresh(body, client);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.logout)
  @ApiOperation({
    summary: 'Sign out this device',
    description:
      'Revokes the current session immediately. The access token already issued stays valid until ' +
      'it expires (15 minutes by default) because access tokens are stateless.',
  })
  @ApiEnvelopeResponse(noData, {
    description: 'Session revoked.',
    example: { message: MESSAGES.logout, data: null },
  })
  @ApiErrorResponses({ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' })
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<void> {
    return this.auth.logout(user, client);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.logoutAll)
  @ApiOperation({
    summary: 'Sign out everywhere',
    description: 'Revokes every session of the user.',
  })
  @ApiEnvelopeResponse(noData, {
    description: 'All sessions revoked.',
    example: { message: MESSAGES.logoutAll, data: null },
  })
  @ApiErrorResponses({
    status: 401,
    code: 'TOKEN_EXPIRED',
    message: 'Your session has expired. Please refresh.',
  })
  logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<void> {
    return this.auth.logoutAll(user, client);
  }

  @Get('me')
  @ApiBearerAuth()
  @ResponseMessage(MESSAGES.me)
  @ApiOperation({
    summary: 'Who am I',
    description:
      'The signed-in user with roles and permissions read fresh from the database. Never includes ' +
      'password hashes or tokens.',
  })
  @ApiEnvelopeResponse(authUserSchema, {
    description: 'The current user.',
    example: { message: MESSAGES.me, data: EXAMPLE_USER },
  })
  @ApiErrorResponses(
    { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
    {
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account has been suspended. Please contact support.',
    },
  )
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.auth.me(user);
  }

  @Post('forgot-password')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.forgot)
  @ApiOperation({
    summary: 'Request a password reset link',
    description: `Emails a single-use link (valid 1 hour by default) and invalidates earlier ones. ${GENERIC_ACCOUNT_NOTE}`,
  })
  @ApiEnvelopeResponse(noData, {
    description: 'Request accepted (always, for any email).',
    example: { message: MESSAGES.forgot, data: null },
  })
  @ApiErrorResponses(400, 429)
  forgotPassword(
    @Body({ schema: forgotPasswordRequestSchema }) body: ForgotPasswordRequest,
    @RequestClient() client: ClientContext,
  ): Promise<void> {
    return this.auth.forgotPassword(body, client);
  }

  @Post('reset-password')
  @Public()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(MESSAGES.reset)
  @ApiOperation({
    summary: 'Set a new password from a reset link',
    description:
      'Consumes the single-use token, sets the new password and signs the user out of every ' +
      'device. Codes: `TOKEN_INVALID`, `TOKEN_EXPIRED`, or `VALIDATION_ERROR` for a weak password.',
  })
  @ApiEnvelopeResponse(noData, {
    description: 'Password changed; all sessions revoked.',
    example: { message: MESSAGES.reset, data: null },
  })
  @ApiErrorResponses(
    {
      status: 400,
      code: 'TOKEN_INVALID',
      message: 'This reset link is invalid or has already been used.',
    },
    429,
  )
  resetPassword(
    @Body({ schema: resetPasswordRequestSchema }) body: ResetPasswordRequest,
    @RequestClient() client: ClientContext,
  ): Promise<void> {
    return this.auth.resetPassword(body, client);
  }
}
