import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminBusiness,
  type AdminDashboard,
  type AdminListBusinessesQuery,
  type AdminListUsersQuery,
  type AdminUser,
  type BusinessActionRequest,
  type ReactivateUserRequest,
  type SuspendUserRequest,
  type UpdateUserRolesRequest,
  adminBusinessSchema,
  adminDashboardSchema,
  adminListBusinessesQuerySchema,
  adminListUsersQuerySchema,
  adminUserSchema,
  businessActionRequestSchema,
  reactivateUserRequestSchema,
  suspendUserRequestSchema,
  updateUserRolesRequestSchema,
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
import { AdminBusinessesService } from './admin-businesses.service.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { AdminUsersService } from './admin-users.service.js';

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
const USER_NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'User not found' } as const;
const BUSINESS_NOT_FOUND = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'Business not found',
} as const;
const LAST_SUPER_ADMIN = {
  status: 409,
  code: 'CONFLICT',
  message: 'This is the last active super admin. Make someone else a super admin first.',
} as const;

const pageMeta = { page: 1, limit: 20, total: 1, totalPages: 1 };

const EXAMPLE_USER = {
  id: '01a0c44b-14bb-724c-98a4-00a05625e026',
  name: 'Asha Patil',
  email: 'asha@example.com',
  status: 'ACTIVE',
  emailVerified: true,
  roles: ['STUDENT'],
  business: null,
  lastLoginAt: '2026-09-24T10:00:00.000Z',
  createdAt: '2026-09-20T10:00:00.000Z',
};

const EXAMPLE_BUSINESS = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f780',
  businessName: 'Sai Krupa Mess',
  slug: 'sai-krupa-mess',
  owner: { id: '01a0c44b-14bb-724c-98a4-00a05625e027', name: 'Ravi K.', email: 'ravi@example.com' },
  phone: '+91 98765 43210',
  email: 'ravi@example.com',
  website: null,
  logoUrl: null,
  verificationStatus: 'PENDING',
  listingCount: 2,
  liveListingCount: 1,
  createdAt: '2026-09-24T10:00:00.000Z',
};

/** The admin home. Any staff role; each screen it links to checks its own permission. */
@ApiTags('Admin: Dashboard')
@ApiBearerAuth()
@Roles('MODERATOR', 'ADMIN', 'SUPER_ADMIN')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get()
  @ResponseMessage('Dashboard retrieved')
  @ApiOperation({
    summary: 'Admin home: queues and totals',
    description:
      'What is waiting for staff (pending submissions, hidden reviews, unverified businesses, suspended ' +
      'accounts) and platform totals. Staff roles only (MODERATOR, ADMIN, SUPER_ADMIN).',
  })
  @ApiEnvelopeResponse(adminDashboardSchema, {
    description: 'Queue counts and totals.',
    example: {
      message: 'Dashboard retrieved',
      data: {
        queues: {
          pendingSubmissions: 3,
          hiddenReviews: 1,
          unverifiedBusinesses: 4,
          suspendedUsers: 0,
          pendingStudentVerifications: 2,
          openReports: 5,
        },
        totals: {
          users: 120,
          students: 110,
          verifiedStudents: 64,
          activeListings: 38,
          communityPostsLast7Days: 21,
          businesses: 9,
          livePlaces: 235,
          activeColleges: 6,
          reviewsLast7Days: 14,
          enquiriesLast7Days: 22,
        },
      },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  overview(): Promise<AdminDashboard> {
    return this.dashboard.overview();
  }
}

/** User management. Reading needs `users.read`; changing needs `users.manage`; roles SUPER_ADMIN. */
@ApiTags('Admin: Users')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @Permissions('users.read')
  @ResponseMessage('Users retrieved')
  @ApiOperation({
    summary: 'List users',
    description: 'Newest first. `q` matches name or email; filter by `role` and `status`.',
  })
  @ApiEnvelopeResponse(z.array(adminUserSchema), {
    description: 'A page of users.',
    example: { message: 'Users retrieved', data: [EXAMPLE_USER], meta: pageMeta },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListUsersQuerySchema }) query: AdminListUsersQuery,
  ): Promise<Paginated<AdminUser>> {
    return this.users.list(query);
  }

  @Get(':id')
  @Permissions('users.read')
  @ResponseMessage('User retrieved')
  @ApiOperation({ summary: 'Get a user' })
  @ApiEnvelopeResponse(adminUserSchema, {
    description: 'The user.',
    example: { message: 'User retrieved', data: EXAMPLE_USER },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, USER_NOT_FOUND)
  get(@Param('id', { schema: uuidSchema }) id: string): Promise<AdminUser> {
    return this.users.get(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.manage')
  @ResponseMessage('User suspended')
  @ApiOperation({
    summary: 'Suspend a user',
    description:
      'Blocks sign-in and ends every session at once. A `reason` is required (audited). Not your own ' +
      'account; only a SUPER_ADMIN may suspend an ADMIN or SUPER_ADMIN; never the last active SUPER_ADMIN.',
  })
  @ApiEnvelopeResponse(adminUserSchema, {
    description: 'The suspended user.',
    example: { message: 'User suspended', data: { ...EXAMPLE_USER, status: 'SUSPENDED' } },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, USER_NOT_FOUND, LAST_SUPER_ADMIN)
  suspend(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: suspendUserRequestSchema }) body: SuspendUserRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminUser> {
    return this.users.suspend(id, body, actor, client);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Permissions('users.manage')
  @ResponseMessage('User reactivated')
  @ApiOperation({
    summary: 'Reactivate a suspended user',
    description: 'Same rank rules as suspending. Only a SUSPENDED account (409 otherwise).',
  })
  @ApiEnvelopeResponse(adminUserSchema, {
    description: 'The reactivated user.',
    example: { message: 'User reactivated', data: EXAMPLE_USER },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, USER_NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'Only a suspended account can be reactivated.',
  })
  reactivate(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: reactivateUserRequestSchema }) body: ReactivateUserRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminUser> {
    return this.users.reactivate(id, body, actor, client);
  }

  @Put(':id/roles')
  @Roles('SUPER_ADMIN')
  @ResponseMessage('Roles updated')
  @ApiOperation({
    summary: "Set a user's roles",
    description:
      'SUPER_ADMIN only. Replaces the whole set. Not your own account; the last active SUPER_ADMIN keeps ' +
      'that role (409). Removing any role signs the user out everywhere so it takes effect at once.',
  })
  @ApiEnvelopeResponse(adminUserSchema, {
    description: 'The user with the new roles.',
    example: {
      message: 'Roles updated',
      data: { ...EXAMPLE_USER, roles: ['MODERATOR', 'STUDENT'] },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, USER_NOT_FOUND, LAST_SUPER_ADMIN)
  setRoles(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateUserRolesRequestSchema }) body: UpdateUserRolesRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminUser> {
    return this.users.setRoles(id, body, actor, client);
  }
}

/** Business verification (`businesses.manage`: ADMIN, SUPER_ADMIN). */
@ApiTags('Admin: Businesses')
@ApiBearerAuth()
@Permissions('businesses.manage')
@Controller('admin/businesses')
export class AdminBusinessesController {
  constructor(private readonly businesses: AdminBusinessesService) {}

  @Get()
  @ResponseMessage('Businesses retrieved')
  @ApiOperation({
    summary: 'List businesses',
    description:
      'Newest first. `q` matches the business name or owner email; filter by `verification`.',
  })
  @ApiEnvelopeResponse(z.array(adminBusinessSchema), {
    description: 'A page of businesses.',
    example: { message: 'Businesses retrieved', data: [EXAMPLE_BUSINESS], meta: pageMeta },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListBusinessesQuerySchema }) query: AdminListBusinessesQuery,
  ): Promise<Paginated<AdminBusiness>> {
    return this.businesses.list(query);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Business verified')
  @ApiOperation({
    summary: 'Verify a business',
    description: 'Students see it as a verified business. 409 if already verified.',
  })
  @ApiEnvelopeResponse(adminBusinessSchema, {
    description: 'The business.',
    example: {
      message: 'Business verified',
      data: { ...EXAMPLE_BUSINESS, verificationStatus: 'VERIFIED' },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, BUSINESS_NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'This business is already verified.',
  })
  verify(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: businessActionRequestSchema }) body: BusinessActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.businesses.verify(id, body, actor, client);
  }

  @Post(':id/unverify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Business verification removed')
  @ApiOperation({
    summary: 'Remove a business’s verification',
    description: '409 if not verified.',
  })
  @ApiEnvelopeResponse(adminBusinessSchema, {
    description: 'The business.',
    example: { message: 'Business verification removed', data: EXAMPLE_BUSINESS },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, BUSINESS_NOT_FOUND, {
    status: 409,
    code: 'CONFLICT',
    message: 'This business is not verified.',
  })
  unverify(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: businessActionRequestSchema }) body: BusinessActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.businesses.unverify(id, body, actor, client);
  }
}
