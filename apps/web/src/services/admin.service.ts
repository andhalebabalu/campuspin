import {
  adminAmenitySchema,
  adminCommunityPostSchema,
  adminListingSchema,
  adminReportSchema,
  adminBusinessSchema,
  adminCategoryGroupSchema,
  adminCategorySchema,
  adminCollegeListItemSchema,
  adminCollegeSchema,
  adminDashboardSchema,
  adminPlaceListItemSchema,
  adminPlaceSchema,
  adminStudentVerificationSchema,
  adminUserSchema,
  collegeEmailDomainSchema,
  placeSubmissionSchema,
  reviewSchema,
  type AddCollegeImageRequest,
  type AddPlaceImageRequest,
  type AdminListBusinessesQuery,
  type AdminListCommunityPostsQuery,
  type AdminListListingsQuery,
  type AdminListReportsQuery,
  type AdminListCollegesQuery,
  type AdminListPlacesQuery,
  type AdminListReviewsQuery,
  type AdminListStudentVerificationsQuery,
  type AdminListSubmissionsQuery,
  type AdminListUsersQuery,
  type CreateAmenityRequest,
  type CreateCategoryAttributeRequest,
  type CreateCategoryRatingDimensionRequest,
  type CreateCategoryRequest,
  type CreateCollegeRequest,
  type CreatePlaceRequest,
  type ReportAction,
  type RoleKey,
  type UpdateAmenityRequest,
  type UpdateCategoryRequest,
  type UpdateCollegeRequest,
  type UpdatePlaceRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient, fetchPrivateBlob } from '@/lib/api/client';

/** `Partial` of a list query: the API fills in defaults (page 1, limit 20, sort). */
type Query<T> = Partial<T>;

const id = (value: string) => encodeURIComponent(value);
const withReason = (reason?: string) => (reason ? { reason } : {});

/**
 * Every staff endpoint the admin panel uses (`/admin/*`). The server checks each call's permission;
 * the panel only hides what the signed-in staff member cannot use.
 */
export const adminService = {
  dashboard: (signal?: AbortSignal) =>
    apiClient.get('/admin/dashboard', { schema: adminDashboardSchema, signal }),

  // ── Submissions ────────────────────────────────────────────────────────────────────────────────
  submissions: (query: Query<AdminListSubmissionsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/submissions', {
      query: { ...query },
      schema: z.array(placeSubmissionSchema),
      signal,
    }),
  approveSubmission: (submissionId: string, reason?: string) =>
    apiClient.post(`/admin/submissions/${id(submissionId)}/approve`, {
      body: withReason(reason),
      schema: placeSubmissionSchema,
    }),
  rejectSubmission: (submissionId: string, reason: string) =>
    apiClient.post(`/admin/submissions/${id(submissionId)}/reject`, {
      body: { reason },
      schema: placeSubmissionSchema,
    }),
  markDuplicate: (submissionId: string, duplicateOfPlaceId: string, reason?: string) =>
    apiClient.post(`/admin/submissions/${id(submissionId)}/mark-duplicate`, {
      body: { duplicateOfPlaceId, ...withReason(reason) },
      schema: placeSubmissionSchema,
    }),

  // ── Reviews ────────────────────────────────────────────────────────────────────────────────────
  reviews: (query: Query<AdminListReviewsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/reviews', { query: { ...query }, schema: z.array(reviewSchema), signal }),
  hideReview: (reviewId: string, reason: string) =>
    apiClient.post(`/admin/reviews/${id(reviewId)}/hide`, {
      body: { reason },
      schema: reviewSchema,
    }),
  restoreReview: (reviewId: string, reason?: string) =>
    apiClient.post(`/admin/reviews/${id(reviewId)}/restore`, {
      body: withReason(reason),
      schema: reviewSchema,
    }),
  removeReview: (reviewId: string, reason: string) =>
    apiClient.post(`/admin/reviews/${id(reviewId)}/remove`, {
      body: { reason },
      schema: reviewSchema,
    }),

  // ── Places ─────────────────────────────────────────────────────────────────────────────────────
  places: (query: Query<AdminListPlacesQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/places', {
      query: { ...query },
      schema: z.array(adminPlaceListItemSchema),
      signal,
    }),
  place: (placeId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/places/${id(placeId)}`, { schema: adminPlaceSchema, signal }),
  createPlace: (dto: CreatePlaceRequest) =>
    apiClient.post('/admin/places', { body: dto, schema: adminPlaceSchema }),
  updatePlace: (placeId: string, dto: UpdatePlaceRequest) =>
    apiClient.patch(`/admin/places/${id(placeId)}`, { body: dto, schema: adminPlaceSchema }),
  placeAction: (
    placeId: string,
    action: 'activate' | 'deactivate' | 'verify' | 'unverify',
    reason?: string,
  ) =>
    apiClient.post(`/admin/places/${id(placeId)}/${action}`, {
      body: withReason(reason),
      schema: adminPlaceSchema,
    }),
  addPlaceImage: (placeId: string, dto: AddPlaceImageRequest) =>
    apiClient.post(`/admin/places/${id(placeId)}/images`, { body: dto, schema: adminPlaceSchema }),
  setPlaceCover: (placeId: string, imageId: string) =>
    apiClient.patch(`/admin/places/${id(placeId)}/images/${id(imageId)}`, {
      body: { isCover: true },
      schema: adminPlaceSchema,
    }),
  removePlaceImage: (placeId: string, imageId: string) =>
    apiClient.delete(`/admin/places/${id(placeId)}/images/${id(imageId)}`, {
      schema: adminPlaceSchema,
    }),

  // ── Colleges ───────────────────────────────────────────────────────────────────────────────────
  colleges: (query: Query<AdminListCollegesQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/colleges', {
      query: { ...query },
      schema: z.array(adminCollegeListItemSchema),
      signal,
    }),
  college: (collegeId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/colleges/${id(collegeId)}`, { schema: adminCollegeSchema, signal }),
  createCollege: (dto: CreateCollegeRequest) =>
    apiClient.post('/admin/colleges', { body: dto, schema: adminCollegeSchema }),
  updateCollege: (collegeId: string, dto: UpdateCollegeRequest) =>
    apiClient.patch(`/admin/colleges/${id(collegeId)}`, { body: dto, schema: adminCollegeSchema }),
  collegeAction: (
    collegeId: string,
    action: 'activate' | 'deactivate' | 'verify' | 'unverify',
    reason?: string,
  ) =>
    apiClient.post(`/admin/colleges/${id(collegeId)}/${action}`, {
      body: withReason(reason),
      schema: adminCollegeSchema,
    }),
  addCollegeImage: (collegeId: string, dto: AddCollegeImageRequest) =>
    apiClient.post(`/admin/colleges/${id(collegeId)}/images`, {
      body: dto,
      schema: adminCollegeSchema,
    }),
  removeCollegeImage: (collegeId: string, imageId: string) =>
    apiClient.delete(`/admin/colleges/${id(collegeId)}/images/${id(imageId)}`, {
      schema: adminCollegeSchema,
    }),

  // ── Categories and amenities ───────────────────────────────────────────────────────────────────
  categories: (signal?: AbortSignal) =>
    apiClient.get('/admin/categories', { schema: z.array(adminCategoryGroupSchema), signal }),
  category: (categoryId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/categories/${id(categoryId)}`, { schema: adminCategorySchema, signal }),
  createCategory: (dto: CreateCategoryRequest) =>
    apiClient.post('/admin/categories', { body: dto, schema: adminCategorySchema }),
  updateCategory: (categoryId: string, dto: UpdateCategoryRequest) =>
    apiClient.patch(`/admin/categories/${id(categoryId)}`, {
      body: dto,
      schema: adminCategorySchema,
    }),
  categoryAction: (categoryId: string, action: 'activate' | 'deactivate') =>
    apiClient.post(`/admin/categories/${id(categoryId)}/${action}`, {
      body: {},
      schema: adminCategorySchema,
    }),
  addAttribute: (categoryId: string, dto: CreateCategoryAttributeRequest) =>
    apiClient.post(`/admin/categories/${id(categoryId)}/attributes`, {
      body: dto,
      schema: adminCategorySchema,
    }),
  removeAttribute: (categoryId: string, attributeId: string) =>
    apiClient.delete(`/admin/categories/${id(categoryId)}/attributes/${id(attributeId)}`, {
      schema: adminCategorySchema,
    }),
  addRatingDimension: (categoryId: string, dto: CreateCategoryRatingDimensionRequest) =>
    apiClient.post(`/admin/categories/${id(categoryId)}/rating-dimensions`, {
      body: dto,
      schema: adminCategorySchema,
    }),
  removeRatingDimension: (categoryId: string, dimensionId: string) =>
    apiClient.delete(`/admin/categories/${id(categoryId)}/rating-dimensions/${id(dimensionId)}`, {
      schema: adminCategorySchema,
    }),
  amenities: (signal?: AbortSignal) =>
    apiClient.get('/admin/amenities', { schema: z.array(adminAmenitySchema), signal }),
  createAmenity: (dto: CreateAmenityRequest) =>
    apiClient.post('/admin/amenities', { body: dto, schema: adminAmenitySchema }),
  updateAmenity: (amenityId: string, dto: UpdateAmenityRequest) =>
    apiClient.patch(`/admin/amenities/${id(amenityId)}`, { body: dto, schema: adminAmenitySchema }),
  amenityAction: (amenityId: string, action: 'activate' | 'deactivate') =>
    apiClient.post(`/admin/amenities/${id(amenityId)}/${action}`, {
      body: {},
      schema: adminAmenitySchema,
    }),

  // ── Users ──────────────────────────────────────────────────────────────────────────────────────
  users: (query: Query<AdminListUsersQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/users', {
      query: { ...query },
      schema: z.array(adminUserSchema),
      signal,
    }),
  suspendUser: (userId: string, reason: string) =>
    apiClient.post(`/admin/users/${id(userId)}/suspend`, {
      body: { reason },
      schema: adminUserSchema,
    }),
  reactivateUser: (userId: string, reason?: string) =>
    apiClient.post(`/admin/users/${id(userId)}/reactivate`, {
      body: withReason(reason),
      schema: adminUserSchema,
    }),
  setUserRoles: (userId: string, roles: RoleKey[], reason?: string) =>
    apiClient.put(`/admin/users/${id(userId)}/roles`, {
      body: { roles, ...withReason(reason) },
      schema: adminUserSchema,
    }),

  // ── Businesses ─────────────────────────────────────────────────────────────────────────────────
  businesses: (query: Query<AdminListBusinessesQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/businesses', {
      query: { ...query },
      schema: z.array(adminBusinessSchema),
      signal,
    }),
  businessAction: (businessId: string, action: 'verify' | 'unverify', reason?: string) =>
    apiClient.post(`/admin/businesses/${id(businessId)}/${action}`, {
      body: withReason(reason),
      schema: adminBusinessSchema,
    }),

  // ── Student verifications ──────────────────────────────────────────────────────────────────────
  studentVerifications: (query: Query<AdminListStudentVerificationsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/student-verifications', {
      query: { ...query },
      schema: z.array(adminStudentVerificationSchema),
      signal,
    }),
  approveStudentVerification: (verificationId: string, reason?: string) =>
    apiClient.post(`/admin/student-verifications/${id(verificationId)}/approve`, {
      body: withReason(reason),
      schema: adminStudentVerificationSchema,
    }),
  rejectStudentVerification: (verificationId: string, reason: string) =>
    apiClient.post(`/admin/student-verifications/${id(verificationId)}/reject`, {
      body: { reason },
      schema: adminStudentVerificationSchema,
    }),
  requestReverification: (verificationId: string, reason: string) =>
    apiClient.post(`/admin/student-verifications/${id(verificationId)}/request-reverification`, {
      body: { reason },
      schema: adminStudentVerificationSchema,
    }),
  /**
   * The private ID photo as an object URL (revoke it when done). It is fetched with the bearer token
   * because the file is never public, so a plain `<img src>` could not load it.
   */
  studentDocumentUrl: async (verificationId: string): Promise<string> =>
    URL.createObjectURL(
      await fetchPrivateBlob(`/admin/student-verifications/${id(verificationId)}/document`),
    ),
  collegeEmailDomains: (collegeId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/colleges/${id(collegeId)}/email-domains`, {
      schema: z.array(collegeEmailDomainSchema),
      signal,
    }),
  addCollegeEmailDomain: (collegeId: string, domain: string) =>
    apiClient.post(`/admin/colleges/${id(collegeId)}/email-domains`, {
      body: { domain },
      schema: z.array(collegeEmailDomainSchema),
    }),
  removeCollegeEmailDomain: (collegeId: string, domainId: string) =>
    apiClient.delete(`/admin/colleges/${id(collegeId)}/email-domains/${id(domainId)}`, {
      schema: z.array(collegeEmailDomainSchema),
    }),

  // ── Reports and moderation ─────────────────────────────────────────────────────────────────────
  reports: (query: Query<AdminListReportsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/reports', {
      query: { ...query },
      schema: z.array(adminReportSchema),
      signal,
    }),
  resolveReport: (reportId: string, action: ReportAction, note: string) =>
    apiClient.post(`/admin/reports/${id(reportId)}/resolve`, {
      body: { action, note },
      schema: adminReportSchema,
    }),
  dismissReport: (reportId: string, note?: string) =>
    apiClient.post(`/admin/reports/${id(reportId)}/dismiss`, {
      body: note ? { note } : {},
      schema: adminReportSchema,
    }),
  communityPosts: (query: Query<AdminListCommunityPostsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/community/posts', {
      query: { ...query },
      schema: z.array(adminCommunityPostSchema),
      signal,
    }),
  communityPostAction: (postId: string, action: 'hide' | 'restore' | 'remove', reason?: string) =>
    apiClient.post(`/admin/community/posts/${id(postId)}/${action}`, {
      body: withReason(reason),
      schema: adminCommunityPostSchema,
    }),
  marketplaceListings: (query: Query<AdminListListingsQuery>, signal?: AbortSignal) =>
    apiClient.get('/admin/marketplace/listings', {
      query: { ...query },
      schema: z.array(adminListingSchema),
      signal,
    }),
  listingAction: (listingId: string, action: 'hide' | 'restore' | 'remove', reason?: string) =>
    apiClient.post(`/admin/marketplace/listings/${id(listingId)}/${action}`, {
      body: withReason(reason),
      schema: adminListingSchema,
    }),
};
