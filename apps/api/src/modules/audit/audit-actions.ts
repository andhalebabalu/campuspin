/**
 * Everything the API records in `audit_logs.action`. Kept as a closed list so a typo cannot create a
 * new, unsearchable action. Later phases append their own (place moderation, role changes, ...).
 */
export const AUDIT_ACTIONS = [
  // Authentication (Phase 3)
  'REGISTER',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED', // wrong credentials, or right credentials but the email is not verified
  'ACCOUNT_SUSPENDED', // right credentials, but the account is suspended/deactivated (blocked)
  'LOGOUT',
  'LOGOUT_ALL',
  'EMAIL_VERIFIED',
  'VERIFICATION_EMAIL_RESENT',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'REFRESH_TOKEN_ROTATED',
  'REFRESH_TOKEN_REUSE_DETECTED', // a rotated token was replayed: the whole session was revoked
  // Colleges (Phase 4). Every staff change to the college directory is recorded.
  'COLLEGE_CREATED',
  'COLLEGE_UPDATED',
  'COLLEGE_ACTIVATED',
  'COLLEGE_DEACTIVATED',
  'COLLEGE_VERIFIED',
  'COLLEGE_UNVERIFIED',
  'COLLEGE_IMAGE_ADDED',
  'COLLEGE_IMAGE_UPDATED',
  'COLLEGE_IMAGE_REMOVED',
  // Categories, attributes, rating dimensions and amenities (Phase 5).
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_ACTIVATED',
  'CATEGORY_DEACTIVATED',
  'CATEGORY_ATTRIBUTE_ADDED',
  'CATEGORY_ATTRIBUTE_UPDATED',
  'CATEGORY_ATTRIBUTE_REMOVED',
  'CATEGORY_RATING_DIMENSION_ADDED',
  'CATEGORY_RATING_DIMENSION_UPDATED',
  'CATEGORY_RATING_DIMENSION_REMOVED',
  'AMENITY_CREATED',
  'AMENITY_UPDATED',
  'AMENITY_ACTIVATED',
  'AMENITY_DEACTIVATED',
  // Places (Phase 6). Every staff change to the place directory is recorded.
  'PLACE_CREATED',
  'PLACE_UPDATED',
  'PLACE_ACTIVATED',
  'PLACE_DEACTIVATED',
  'PLACE_VERIFIED',
  'PLACE_UNVERIFIED',
  'PLACE_IMAGE_ADDED',
  'PLACE_IMAGE_UPDATED',
  'PLACE_IMAGE_REMOVED',
  // Student submissions (Phase 8). A submission also creates a PENDING place; its own lifecycle
  // (PLACE_ACTIVATED etc.) is recorded separately against that place when a submission is approved.
  'SUBMISSION_CREATED',
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED',
  'SUBMISSION_MARKED_DUPLICATE',
  // Reviews (Phase 9). The author's own changes and every staff moderation decision. A withdrawn
  // review is deleted, so its audit row is what records that it existed.
  'REVIEW_CREATED',
  'REVIEW_UPDATED',
  'REVIEW_WITHDRAWN',
  'REVIEW_HIDDEN',
  'REVIEW_RESTORED',
  'REVIEW_REMOVED',
  // Business owners (Phase 10). Owner listings are recorded as SUBMISSION_CREATED (with the
  // businessProfileId in metadata), since they go through the same staff review.
  'BUSINESS_PROFILE_UPDATED',
  'LEAD_CREATED',
  'LEAD_STATUS_CHANGED',
  // Staff administration (Phase 11). Every one carries the acting staff member and, where given,
  // the reason.
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'USER_ROLES_CHANGED',
  'BUSINESS_VERIFIED',
  'BUSINESS_UNVERIFIED',
  // Student verification, profile and settings (community + marketplace foundation).
  'STUDENT_VERIFICATION_REQUESTED',
  'STUDENT_VERIFICATION_CANCELLED',
  'STUDENT_VERIFIED',
  'STUDENT_VERIFICATION_REJECTED',
  'STUDENT_REVERIFICATION_REQUESTED',
  'STUDENT_DOCUMENT_VIEWED', // staff opened a private ID photo
  'COLLEGE_EMAIL_DOMAIN_ADDED',
  'COLLEGE_EMAIL_DOMAIN_REMOVED',
  'PROFILE_UPDATED',
  'SETTINGS_UPDATED',
  // Community, marketplace and reports.
  'REPORT_CREATED',
  'REPORT_RESOLVED',
  'REPORT_DISMISSED',
  'COMMUNITY_POST_HIDDEN',
  'COMMUNITY_POST_RESTORED',
  'COMMUNITY_POST_REMOVED',
  'COMMUNITY_COMMENT_REMOVED',
  'LISTING_HIDDEN',
  'LISTING_RESTORED',
  'LISTING_REMOVED',
  // In-app ads and announcements.
  'PROMOTION_CREATED',
  'PROMOTION_UPDATED',
  'PROMOTION_DELETED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
