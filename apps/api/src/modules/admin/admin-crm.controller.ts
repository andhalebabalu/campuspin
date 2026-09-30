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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AdminBusiness,
  type AdminBusinessAnalytics,
  type AdminBusinessAnalyticsQuery,
  type AdminBusinessDetail,
  type AdminListAuditQuery,
  type AdminListSubscriptionsQuery,
  type AdminPlan,
  type AdminSubscription,
  type AdminUpdateBusinessRequest,
  type AssignSubscriptionRequest,
  type AuditEntry,
  type BulkBusinessActionRequest,
  type BulkBusinessResult,
  type BusinessActionRequest,
  type BusinessDecisionRequest,
  type OwnershipIssue,
  type TransferBusinessRequest,
  adminBusinessAnalyticsQuerySchema,
  adminBusinessAnalyticsSchema,
  adminBusinessDetailSchema,
  adminBusinessSchema,
  adminListAuditQuerySchema,
  adminListSubscriptionsQuerySchema,
  adminPlanSchema,
  adminSubscriptionSchema,
  adminUpdateBusinessRequestSchema,
  assignSubscriptionRequestSchema,
  auditEntrySchema,
  bulkBusinessActionRequestSchema,
  bulkBusinessResultSchema,
  businessActionRequestSchema,
  businessDecisionRequestSchema,
  ownershipIssueSchema,
  transferBusinessRequestSchema,
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
import { AdminBusinessesService } from './admin-businesses.service.js';
import { AdminCrmService } from './admin-crm.service.js';

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
const NOT_FOUND = { status: 404, code: 'NOT_FOUND', message: 'Business not found' } as const;
const CONFLICT = {
  status: 409,
  code: 'CONFLICT',
  message: 'This business was changed by someone else. Reload and try again.',
} as const;
const idParam = { schema: uuidSchema };

/**
 * The CRM side of business management (`businesses.manage`): one business in detail, and the
 * decisions staff take about it. Declared routes before `:id` so fixed paths win.
 */
@ApiTags('Admin: Businesses')
@ApiBearerAuth()
@Permissions('businesses.manage')
@Controller('admin/businesses')
export class AdminBusinessCrmController {
  constructor(private readonly businesses: AdminBusinessesService) {}

  @Get('ownership-check')
  @ResponseMessage('Ownership check done')
  @ApiOperation({
    summary: 'Businesses owned by the wrong kind of account',
    description:
      'Owners that are students, staff, or lack the business role. Empty means nothing to fix; ' +
      'fix one with `POST /admin/businesses/:id/transfer`.',
  })
  @ApiEnvelopeResponse(z.array(ownershipIssueSchema), { description: 'The problems found.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  ownershipCheck(): Promise<OwnershipIssue[]> {
    return this.businesses.ownershipCheck();
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Bulk action done')
  @ApiOperation({
    summary: 'Verify, suspend or reinstate several businesses',
    description:
      'Each business is handled on its own; ones that cannot change are skipped with why.',
  })
  @ApiEnvelopeResponse(bulkBusinessResultSchema, { description: 'Done and skipped ids.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  bulk(
    @Body({ schema: bulkBusinessActionRequestSchema }) body: BulkBusinessActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BulkBusinessResult> {
    return this.businesses.bulk(body, actor, client);
  }

  @Get(':id')
  @ResponseMessage('Business retrieved')
  @ApiOperation({
    summary: 'One business in detail',
    description: 'Profile, owner, listings, reviews, reports, plan, analytics and its audit trail.',
  })
  @ApiEnvelopeResponse(adminBusinessDetailSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  detail(@Param('id', idParam) id: string): Promise<AdminBusinessDetail> {
    return this.businesses.detail(id);
  }

  @Patch(':id')
  @ResponseMessage('Business updated')
  @ApiOperation({
    summary: 'Correct a business profile',
    description: 'Recorded in the audit log.',
  })
  @ApiEnvelopeResponse(adminBusinessDetailSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  update(
    @Param('id', idParam) id: string,
    @Body({ schema: adminUpdateBusinessRequestSchema }) body: AdminUpdateBusinessRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusinessDetail> {
    return this.businesses.update(id, body, actor, client);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a business',
    description:
      'Only while nothing depends on it (no listings, orders, enquiries, bookings...). Otherwise ' +
      '409: suspend it instead so its history is kept. The owner account is not deleted.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)
  async remove(
    @Param('id', idParam) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<void> {
    await this.businesses.remove(id, actor, client);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Business rejected')
  @ApiOperation({
    summary: 'Reject a business',
    description:
      'Its page and listings are hidden; the owner sees the reason. 409 if already rejected.',
  })
  @ApiEnvelopeResponse(adminBusinessSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)
  reject(
    @Param('id', idParam) id: string,
    @Body({ schema: businessDecisionRequestSchema }) body: BusinessDecisionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.businesses.reject(id, body.reason, actor, client);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Business suspended')
  @ApiOperation({
    summary: 'Suspend a business',
    description:
      'Hides its page and listings and freezes its dashboard; the owner sees the reason.',
  })
  @ApiEnvelopeResponse(adminBusinessSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)
  suspend(
    @Param('id', idParam) id: string,
    @Body({ schema: businessDecisionRequestSchema }) body: BusinessDecisionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.businesses.suspend(id, body.reason, actor, client);
  }

  @Post(':id/reinstate')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Business reinstated')
  @ApiOperation({
    summary: 'Lift a suspension or a rejection',
    description:
      'A suspended business becomes active; a rejected one goes back to pending review. The ' +
      'listings hidden by the decision come back.',
  })
  @ApiEnvelopeResponse(adminBusinessSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)
  reinstate(
    @Param('id', idParam) id: string,
    @Body({ schema: businessActionRequestSchema }) body: BusinessActionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusiness> {
    return this.businesses.reinstate(id, body, actor, client);
  }

  @Post(':id/subscription')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Plan assigned')
  @ApiOperation({
    summary: 'Put a business on a plan',
    description: 'No payment is taken. Choosing the default plan (FREE) ends any assigned plan.',
  })
  @ApiEnvelopeResponse(adminBusinessDetailSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
  assignPlan(
    @Param('id', idParam) id: string,
    @Body({ schema: assignSubscriptionRequestSchema }) body: AssignSubscriptionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusinessDetail> {
    return this.businesses.assignPlan(id, body, actor, client);
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Business transferred')
  @ApiOperation({
    summary: 'Give a business to another business account',
    description:
      'The new owner must be an active business account (never a student or staff account) that ' +
      'runs no other business. Places, reviews and history stay with the business.',
  })
  @ApiEnvelopeResponse(adminBusinessDetailSchema, { description: 'The business.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT)
  transfer(
    @Param('id', idParam) id: string,
    @Body({ schema: transferBusinessRequestSchema }) body: TransferBusinessRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<AdminBusinessDetail> {
    return this.businesses.transfer(id, body, actor, client);
  }
}

/** Plans and subscriptions (`businesses.manage`). */
@ApiTags('Admin: Plans')
@ApiBearerAuth()
@Permissions('businesses.manage')
@Controller('admin')
export class AdminPlansController {
  constructor(private readonly crm: AdminCrmService) {}

  @Get('plans')
  @ResponseMessage('Plans retrieved')
  @ApiOperation({ summary: 'All plans, with how many businesses are on each by assignment' })
  @ApiEnvelopeResponse(z.array(adminPlanSchema), { description: 'The plans.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  plans(): Promise<AdminPlan[]> {
    return this.crm.plans();
  }

  @Get('subscriptions')
  @ResponseMessage('Subscriptions retrieved')
  @ApiOperation({ summary: 'Assigned plans, newest first (every business not listed is on Free)' })
  @ApiEnvelopeResponse(z.array(adminSubscriptionSchema), {
    description: 'A page of subscriptions.',
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  subscriptions(
    @Query({ schema: adminListSubscriptionsQuerySchema }) query: AdminListSubscriptionsQuery,
  ): Promise<Paginated<AdminSubscription>> {
    return this.crm.subscriptions(query);
  }
}

/** The audit log (`audit.read`). */
@ApiTags('Admin: Audit log')
@ApiBearerAuth()
@Permissions('audit.read')
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly crm: AdminCrmService) {}

  @Get()
  @ResponseMessage('Audit log retrieved')
  @ApiOperation({
    summary: 'Who did what, newest first',
    description: 'Filter by `action`, `entityType`, `entityId`, `actor` (name or email) and dates.',
  })
  @ApiEnvelopeResponse(z.array(auditEntrySchema), { description: 'A page of entries.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  list(
    @Query({ schema: adminListAuditQuerySchema }) query: AdminListAuditQuery,
  ): Promise<Paginated<AuditEntry>> {
    return this.crm.auditLog(query);
  }
}

/** Business page analytics across the platform (`analytics.view`). */
@ApiTags('Admin: Analytics')
@ApiBearerAuth()
@Permissions('analytics.view')
@Controller('admin/business-analytics')
export class AdminBusinessAnalyticsController {
  constructor(private readonly crm: AdminCrmService) {}

  @Get()
  @ResponseMessage('Business analytics retrieved')
  @ApiOperation({
    summary: 'Business page visits and taps across the platform',
    description:
      'Real anonymous events only: totals, a daily series, the top pages, businesses by category.',
  })
  @ApiEnvelopeResponse(adminBusinessAnalyticsSchema, { description: 'The numbers.' })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN)
  get(
    @Query({ schema: adminBusinessAnalyticsQuerySchema }) query: AdminBusinessAnalyticsQuery,
  ): Promise<AdminBusinessAnalytics> {
    return this.crm.businessAnalytics(query);
  }
}
