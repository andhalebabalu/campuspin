import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BusinessDashboard,
  type BusinessLead,
  type BusinessListing,
  type BusinessProfile,
  type BusinessReview,
  type CreateSubmissionRequest,
  type ListBusinessLeadsQuery,
  type ListBusinessReviewsQuery,
  type PlaceSubmission,
  type UpdateBusinessProfileRequest,
  type UpdateLeadRequest,
  businessDashboardSchema,
  businessLeadSchema,
  businessListingSchema,
  businessProfileSchema,
  businessReviewSchema,
  createSubmissionRequestSchema,
  listBusinessLeadsQuerySchema,
  listBusinessReviewsQuerySchema,
  placeSubmissionSchema,
  updateBusinessProfileRequestSchema,
  updateLeadRequestSchema,
  uuidSchema,
} from '@platform/contracts';
import { z } from 'zod';
import type { Paginated } from '../../common/http/paginated.js';
import { RequestClient, type ClientContext } from '../../common/http/request-client.decorator.js';
import { ResponseMessage } from '../../common/http/response-message.decorator.js';
import { ApiEnvelopeResponse, ApiErrorResponses } from '../../common/swagger/api-responses.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequiresCapability } from '../capabilities/requires-capability.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { BusinessService } from './business.service.js';

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
const NO_BUSINESS = {
  status: 404,
  code: 'NOT_FOUND',
  message: 'No business profile is linked to this account yet.',
} as const;

const PLACE = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f785',
  slug: 'sample-mess',
  name: 'Sample Mess',
};

const EXAMPLE_PROFILE = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f780',
  businessName: 'Sai Krupa Mess',
  slug: 'sai-krupa-mess',
  description: null,
  phone: '+91 98765 43210',
  email: 'owner@example.com',
  website: null,
  logoUrl: null,
  verificationStatus: 'PENDING',
  createdAt: '2026-09-24T10:00:00.000Z',
};

const EXAMPLE_LEAD = {
  id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f791',
  place: PLACE,
  student: { name: 'Asha Patil', email: 'asha@example.com' },
  message: 'Is a double-sharing room available from July?',
  contactPhone: '+91 91234 56789',
  status: 'NEW',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
};

const pageMeta = (total: number) => ({ page: 1, limit: 20, total, totalPages: 1 });

/**
 * The business owner's dashboard. `BUSINESS_OWNER` only, and everything is scoped to the caller's
 * own business: another business's enquiry id answers 404, never 403, so ids reveal nothing.
 */
@ApiTags('Business')
@ApiBearerAuth()
@Roles('BUSINESS_OWNER')
@Controller('business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('dashboard')
  @ResponseMessage('Dashboard retrieved')
  @ApiOperation({
    summary: 'My business dashboard',
    description:
      'The business profile plus overview numbers: listings by state, enquiries (all and new), and the ' +
      'review count and average across live listings.',
  })
  @ApiEnvelopeResponse(businessDashboardSchema, {
    description: 'Profile and stats.',
    example: {
      message: 'Dashboard retrieved',
      data: {
        profile: EXAMPLE_PROFILE,
        stats: {
          listings: { total: 2, live: 1, underReview: 1, rejected: 0 },
          enquiries: { total: 5, new: 2 },
          reviews: { count: 12, averageRating: 4.3 },
        },
      },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NO_BUSINESS)
  dashboard(@CurrentUser() actor: AuthenticatedUser): Promise<BusinessDashboard> {
    return this.business.dashboard(actor);
  }

  @Patch('profile')
  @ResponseMessage('Business profile updated')
  @ApiOperation({
    summary: 'Edit my business profile',
    description: 'Send only what changes; `null` clears an optional field. The slug never changes.',
  })
  @ApiEnvelopeResponse(businessProfileSchema, {
    description: 'The updated profile.',
    example: { message: 'Business profile updated', data: EXAMPLE_PROFILE },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NO_BUSINESS)
  updateProfile(
    @Body({ schema: updateBusinessProfileRequestSchema }) body: UpdateBusinessProfileRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessProfile> {
    return this.business.updateProfile(body, actor, client);
  }

  @Get('listings')
  @ResponseMessage('Listings retrieved')
  @ApiOperation({
    summary: 'My listings',
    description:
      "Every place of the business in any state (live, under review, rejected), newest first, with each one's " +
      'enquiry counts and the outcome of its staff review.',
  })
  @ApiEnvelopeResponse(z.array(businessListingSchema), {
    description: 'The listings.',
    example: {
      message: 'Listings retrieved',
      data: [
        {
          ...PLACE,
          city: 'Ahilyanagar',
          status: 'PENDING',
          coverImageUrl: null,
          primaryCategory: {
            id: '01a0babd-1111-7000-8000-000000000001',
            slug: 'mess',
            name: 'Mess',
          },
          ratingAverage: 0,
          ratingCount: 0,
          enquiryCount: 0,
          newEnquiryCount: 0,
          review: { status: 'PENDING', note: null },
          createdAt: '2026-09-24T10:00:00.000Z',
        },
      ],
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NO_BUSINESS)
  listings(@CurrentUser() actor: AuthenticatedUser): Promise<BusinessListing[]> {
    return this.business.listings(actor);
  }

  @Post('listings')
  @ResponseMessage('Listing submitted for review')
  @ApiOperation({
    summary: 'List a new place',
    description:
      'Same body and rules as `POST /place-submissions` (including duplicate detection and `409 ' +
      'DUPLICATE_PLACE_SUSPECTED`), but the place is linked to the caller’s business. It stays invisible ' +
      'to the public until staff approve it.',
  })
  @ApiEnvelopeResponse(placeSubmissionSchema, {
    status: 201,
    description: 'The submission created for the listing.',
    example: {
      message: 'Listing submitted for review',
      data: {
        id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f786',
        name: 'Sample Mess',
        category: { id: '01a0babd-1111-7000-8000-000000000001', slug: 'mess', name: 'Mess' },
        collegeId: null,
        address: 'Station Road, Ahilyanagar',
        city: 'Ahilyanagar',
        latitude: 19.1,
        longitude: 74.76,
        phone: '+91 98765 43210',
        priceAmount: 3000,
        priceUnit: 'MONTH',
        description: null,
        status: 'PENDING',
        submittedById: '01a0c44b-14bb-724c-98a4-00a05625e026',
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        resultingPlaceId: PLACE.id,
        duplicateOfPlaceId: null,
        duplicateCandidates: [],
        images: [],
        createdAt: '2026-09-24T10:00:00.000Z',
        updatedAt: '2026-09-24T10:00:00.000Z',
      },
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NO_BUSINESS, 429)
  createListing(
    @Body({ schema: createSubmissionRequestSchema }) body: CreateSubmissionRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<PlaceSubmission> {
    return this.business.createListing(body, actor, client);
  }

  @RequiresCapability('ENQUIRY')
  @Get('enquiries')
  @ResponseMessage('Enquiries retrieved')
  @ApiOperation({
    summary: 'My enquiries',
    description:
      'Enquiries sent to the business, newest first. Filter by `status` and/or `placeId`.',
  })
  @ApiEnvelopeResponse(z.array(businessLeadSchema), {
    description: 'A page of enquiries.',
    example: { message: 'Enquiries retrieved', data: [EXAMPLE_LEAD], meta: pageMeta(1) },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NO_BUSINESS)
  enquiries(
    @Query({ schema: listBusinessLeadsQuerySchema }) query: ListBusinessLeadsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessLead>> {
    return this.business.leads(query, actor);
  }

  @RequiresCapability('ENQUIRY')
  @Patch('enquiries/:id')
  @ResponseMessage('Enquiry updated')
  @ApiOperation({
    summary: 'Update an enquiry’s status',
    description: '`NEW`, `SEEN`, `CONTACTED` or `CLOSED`. Another business’s enquiry answers 404.',
  })
  @ApiEnvelopeResponse(businessLeadSchema, {
    description: 'The updated enquiry.',
    example: { message: 'Enquiry updated', data: { ...EXAMPLE_LEAD, status: 'CONTACTED' } },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Enquiry not found',
  })
  updateEnquiry(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateLeadRequestSchema }) body: UpdateLeadRequest,
    @CurrentUser() actor: AuthenticatedUser,
    @RequestClient() client: ClientContext,
  ): Promise<BusinessLead> {
    return this.business.updateLead(id, body, actor, client);
  }

  @Get('reviews')
  @ResponseMessage('Reviews retrieved')
  @ApiOperation({
    summary: 'Reviews of my places',
    description:
      'Published reviews across the business’s places, newest first. Filter by `placeId`.',
  })
  @ApiEnvelopeResponse(z.array(businessReviewSchema), {
    description: 'A page of reviews.',
    example: {
      message: 'Reviews retrieved',
      data: [
        {
          id: '01a0cd43-97e5-76be-bc3a-8f8eaaf0f790',
          rating: 4,
          comment: 'Good food, fair price.',
          authorName: 'Asha P.',
          dimensionRatings: [],
          place: PLACE,
          createdAt: '2026-09-24T10:00:00.000Z',
          updatedAt: '2026-09-24T10:00:00.000Z',
        },
      ],
      meta: pageMeta(1),
    },
  })
  @ApiErrorResponses(UNAUTHORIZED, FORBIDDEN, NO_BUSINESS)
  reviews(
    @Query({ schema: listBusinessReviewsQuerySchema }) query: ListBusinessReviewsQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Paginated<BusinessReview>> {
    return this.business.reviews(query, actor);
  }
}
