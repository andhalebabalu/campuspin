import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  studentHomeQuerySchema,
  studentHomeSchema,
  type StudentHome,
  type StudentHomeQuery,
} from '@platform/contracts';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { StudentHomeService } from './student-home.service.js';

/** The student home screen in one call. */
@ApiTags('Services')
@ApiBearerAuth()
@Controller('me/home')
export class StudentHomeController {
  constructor(private readonly home: StudentHomeService) {}

  @Get()
  @ResponseMessage('Home retrieved')
  @ApiOperation({
    summary: 'My home screen',
    description:
      'Quick actions (with how many places offer each), active orders, today’s mess menus, saved and ' +
      'recently used places. Send `lat`/`lng` for distances.',
  })
  @ApiEnvelopeResponse(studentHomeSchema, { description: 'Everything the home screen shows.' })
  @ApiErrorResponses({ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' })
  get(
    @Query({ schema: studentHomeQuerySchema }) query: StudentHomeQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<StudentHome> {
    return this.home.home(actor, query);
  }
}
