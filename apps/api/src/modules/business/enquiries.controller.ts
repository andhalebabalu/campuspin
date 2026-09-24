import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type CreateLeadRequest,
  type LeadReceipt,
  createLeadRequestSchema,
  leadReceiptSchema,
  placeIdOrSlugSchema,
} from '@platform/contracts';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { LeadsService } from './leads.service.js';

/** A student sending an enquiry to the business that manages a place. */
@ApiTags('Enquiries')
@ApiBearerAuth()
@Controller()
export class EnquiriesController {
  constructor(private readonly leads: LeadsService) {}

  @Post('places/:idOrSlug/enquiries')
  @Roles('STUDENT')
  // An enquiry lands in a real person's inbox: keep it far from spam territory.
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @ResponseMessage('Enquiry sent')
  @ApiOperation({
    summary: 'Send an enquiry to a place',
    description:
      'Students only. The place must be active and managed by a business (`acceptsEnquiries` on the ' +
      'place), otherwise `409`. `consent: true` is required: the business sees the student’s name, email ' +
      'and `contactPhone`. One open enquiry per student per place (a second is `409` until the business ' +
      'marks the first contacted or closed). Limited to 10 per hour.',
  })
  @ApiEnvelopeResponse(leadReceiptSchema, {
    status: 201,
    description: 'The enquiry, as the student sees it.',
    example: {
      message: 'Enquiry sent',
      data: {
        id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f791',
        place: {
          id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f785',
          slug: 'sample-mess',
          name: 'Sample Mess',
        },
        status: 'NEW',
        createdAt: '2026-09-24T10:00:00.000Z',
      },
    },
  })
  @ApiErrorResponses(
    { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
    { status: 403, code: 'FORBIDDEN', message: 'You cannot send an enquiry to your own business.' },
    { status: 404, code: 'NOT_FOUND', message: 'Place not found' },
    {
      status: 409,
      code: 'CONFLICT',
      message:
        'You already have an open enquiry with this place. The business will get back to you.',
    },
    429,
  )
  create(
    @Param('idOrSlug', { schema: placeIdOrSlugSchema }) idOrSlug: string,
    @Body({ schema: createLeadRequestSchema }) body: CreateLeadRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<LeadReceipt> {
    return this.leads.create(idOrSlug, body, actor, client);
  }
}
