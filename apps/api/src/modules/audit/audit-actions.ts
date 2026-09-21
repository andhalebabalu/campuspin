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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
