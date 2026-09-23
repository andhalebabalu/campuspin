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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
