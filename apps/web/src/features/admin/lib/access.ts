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

export interface AdminGroup {
  label: string;
  sections: AdminSection[];
}

/**
 * The admin sidebar, grouped. Each entry is an existing screen and is shown only to staff whose
 * permissions its API accepts (the server enforces this regardless; hiding avoids dead links).
 */
export const ADMIN_GROUPS: readonly AdminGroup[] = [
  { label: 'Main', sections: [{ href: ROUTES.admin, label: 'Dashboard', icon: 'grid' }] },
  {
    label: 'Management',
    sections: [
      {
        href: `${ROUTES.adminUsers}?role=STUDENT`,
        label: 'Students',
        icon: 'graduation',
        permission: 'users.read',
      },
      {
        href: ROUTES.adminBusinesses,
        label: 'Businesses',
        icon: 'store',
        permission: 'businesses.manage',
      },
      {
        href: ROUTES.adminPlaces,
        label: 'Business listings',
        icon: 'pin',
        permission: 'places.manage',
      },
      {
        href: ROUTES.adminColleges,
        label: 'Colleges',
        icon: 'building',
        permission: 'colleges.manage',
      },
      {
        href: ROUTES.adminCategories,
        label: 'Categories & amenities',
        icon: 'layers',
        permission: 'categories.manage',
      },
    ],
  },
  {
    label: 'Community',
    sections: [
      {
        href: ROUTES.adminCommunity,
        label: 'Community',
        icon: 'chats',
        permission: 'community.moderate',
      },
      {
        href: ROUTES.adminMarketplace,
        label: 'Buy & Sell',
        icon: 'tag',
        permission: 'marketplace.moderate',
      },
      { href: ROUTES.adminReports, label: 'Reports', icon: 'flag' },
      { href: ROUTES.adminReviews, label: 'Reviews', icon: 'star', permission: 'reviews.moderate' },
      {
        href: ROUTES.adminSubmissions,
        label: 'Place suggestions',
        icon: 'check',
        permission: 'submissions.review',
      },
      {
        href: ROUTES.adminVerifications,
        label: 'Student verification',
        icon: 'userCheck',
        permission: 'verifications.review',
      },
    ],
  },
  {
    label: 'Business',
    sections: [
      {
        href: `${ROUTES.adminBusinesses}?verification=PENDING`,
        label: 'Verification',
        icon: 'shield',
        permission: 'businesses.manage',
      },
      {
        href: ROUTES.adminSubscriptions,
        label: 'Subscriptions',
        icon: 'card',
        permission: 'businesses.manage',
      },
      { href: ROUTES.adminPlans, label: 'Plans', icon: 'receipt', permission: 'businesses.manage' },
      {
        href: ROUTES.adminBusinessTypes,
        label: 'Business types',
        icon: 'layers',
        permission: 'businesses.manage',
      },
      {
        href: ROUTES.adminServices,
        label: 'Offers & services',
        icon: 'utensils',
        permission: 'services.moderate',
      },
    ],
  },
  {
    label: 'Analytics',
    sections: [
      {
        href: ROUTES.adminAnalytics,
        label: 'Platform analytics',
        icon: 'chart',
        permission: 'analytics.view',
      },
      {
        href: ROUTES.adminBusinessAnalytics,
        label: 'Business analytics',
        icon: 'trending',
        permission: 'analytics.view',
      },
    ],
  },
  {
    label: 'System',
    sections: [
      {
        href: ROUTES.adminPromotions,
        label: 'Announcements & ads',
        icon: 'bell',
        permission: 'promotions.manage',
      },
      {
        href: ROUTES.adminListingLimits,
        label: 'Settings',
        icon: 'settings',
        permission: 'settings.manage',
      },
      {
        href: `${ROUTES.adminUsers}?role=STAFF`,
        label: 'Admin users',
        icon: 'users',
        permission: 'users.read',
      },
      { href: ROUTES.adminAuditLogs, label: 'Audit logs', icon: 'file', permission: 'audit.read' },
    ],
  },
];
