import {
  type AuthUser,
  type PermissionKey,
  type RoleKey,
  roleKeySchema,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * What the auth flows read about a user. Deliberately has no `passwordHash`: only the login query
 * adds it, so no other code path can leak it by accident.
 */
export const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  userRoles: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

export type Account = Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }>;

/** Sorted, de-duplicated role keys. Rows for a role the contracts do not know are ignored. */
export function roleKeysOf(account: Pick<Account, 'userRoles'>): RoleKey[] {
  const keys = new Set<RoleKey>();
  for (const { role } of account.userRoles) {
    const parsed = roleKeySchema.safeParse(role.key);
    if (parsed.success) keys.add(parsed.data);
  }
  return [...keys].sort();
}

/**
 * The 403 to answer with when the account may not sign in, or undefined when it may. Only ever
 * shown AFTER the password was proven correct, so it cannot be used to discover which emails exist.
 */
export function accountBlockedError(account: Pick<Account, 'status'>): AppException | undefined {
  if (account.status === 'SUSPENDED') {
    return AppException.forbidden(
      'ACCOUNT_SUSPENDED',
      'This account has been suspended. Please contact support.',
    );
  }
  if (account.status === 'DEACTIVATED') {
    return AppException.forbidden('ACCOUNT_DEACTIVATED', 'This account has been deactivated.');
  }
  return undefined;
}

/** The public shape of a user (see `authUserSchema`): no hashes, no status internals. */
export function toAuthUser(account: Account, permissions: PermissionKey[]): AuthUser {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    roles: roleKeysOf(account),
    permissions,
  };
}
