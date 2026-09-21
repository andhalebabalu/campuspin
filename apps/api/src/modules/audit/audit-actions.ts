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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
