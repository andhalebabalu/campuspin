import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  activityOverviewSchema,
  recordVisitSchema,
  type ActivityOverview,
  type RecordVisitRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { Viewer } from '../auth/decorators/current-user.decorator.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { OptionalAuth } from '../auth/decorators/public.decorator.js';
import { ActivityService } from './activity.service.js';

/** The web and mobile apps report one visit per device per day. */
@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly activity: ActivityService) {}

  @OptionalAuth()
  @Post('visit')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Visit recorded')
  @ApiOperation({
    summary: 'Count a visit',
    description:
      'Sent when an app opens (and after signing in). `visitorId` is a random id the device keeps; no IP address is stored. Signed in, the visit also counts the account as active today.',
  })
  @ApiEnvelopeResponse(z.null(), {
    description: 'Counted.',
    example: { message: 'Visit recorded', data: null },
  })
  async visit(
    @Body({ schema: recordVisitSchema }) body: RecordVisitRequest,
    @Viewer() viewer: AuthenticatedUser | null,
  ): Promise<null> {
    await this.activity.recordVisit(body, viewer);
    return null;
  }
}

/** Staff: visitors, active members and ratios (`analytics.view`). */
@ApiTags('Admin: Analytics')
@ApiBearerAuth()
@Permissions('analytics.view')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly activity: ActivityService) {}

  @Get('activity')
  @ResponseMessage('Activity retrieved')
  @ApiOperation({
    summary: 'Visitors and active members',
    description:
      'Today, the last 7 and 30 days (India time), members online in the last 5 minutes, ratios and a 30-day series. Staff accounts are not counted as members.',
  })
  @ApiEnvelopeResponse(activityOverviewSchema, { description: 'The overview.' })
  @ApiErrorResponses(
    { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
    {
      status: 403,
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
    },
  )
  overview(): Promise<ActivityOverview> {
    return this.activity.overview();
  }
}
