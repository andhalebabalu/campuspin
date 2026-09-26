import type { AuthUser, PermissionKey, RoleKey } from '@platform/contracts';
import type { IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';

/** Roles that get the admin panel. */
export const STAFF_ROLES: readonly RoleKey[] = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'];

export function isStaff(user: Pick<AuthUser, 'roles'> | null | undefined): boolean {
  return Boolean(user?.roles.some((role) => STAFF_ROLES.includes(role)));
}

export function can(user: Pick<AuthUser, 'permissions'> | null | undefined, key: PermissionKey) {
  return Boolean(user?.permissions.includes(key));
}

export interface AdminSection {
  href: string;
  label: string;
  icon: IconName;
  /** The permission the section's API needs; absent means any staff member. */
  permission?: PermissionKey;
}

/**
 * The admin sidebar. Each section is shown only to staff whose permissions its API accepts (the
 * server enforces this regardless; hiding it just avoids dead links).
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { href: ROUTES.admin, label: 'Overview', icon: 'grid' },
  {
    href: ROUTES.adminVerifications,
    label: 'Verifications',
    icon: 'graduation',
    permission: 'verifications.review',
  },
  {
    href: ROUTES.adminSubmissions,
    label: 'Submissions',
    icon: 'check',
    permission: 'submissions.review',
  },
  { href: ROUTES.adminReviews, label: 'Reviews', icon: 'star', permission: 'reviews.moderate' },
  { href: ROUTES.adminPlaces, label: 'Places', icon: 'pin', permission: 'places.manage' },
  {
    href: ROUTES.adminColleges,
    label: 'Colleges',
    icon: 'building',
    permission: 'colleges.manage',
  },
  { href: ROUTES.adminUsers, label: 'Users', icon: 'users', permission: 'users.read' },
  {
    href: ROUTES.adminBusinesses,
    label: 'Businesses',
    icon: 'store',
    permission: 'businesses.manage',
  },
];
