import { z } from 'zod';

/**
 * Roles and permissions: the single source of truth. The database seed writes these rows, the API
 * guards (Phase 6) check them, and the web/mobile apps use the role keys for UX-only gating.
 * Code always refers to KEYS, never to display names.
 */
export const ROLE_KEYS = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATOR',
  'STUDENT',
  'BUSINESS_OWNER',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const roleKeySchema = z.enum(ROLE_KEYS);

export const ROLES: Readonly<Record<RoleKey, { name: string; description: string }>> = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full control of the platform, including settings and staff.',
  },
  ADMIN: {
    name: 'Admin',
    description: 'Manages content, verification, claims and users.',
  },
  MODERATOR: {
    name: 'Moderator',
    description: 'Reviews submissions, reviews and reports.',
  },
  STUDENT: {
    name: 'Student',
    description: 'Discovers places, saves, reviews and suggests places.',
  },
  BUSINESS_OWNER: {
    name: 'Business Owner',
    description: 'Manages their own business listings.',
  },
};

/** `<resource>.<action>`. Kept deliberately small; finer rules live in resource policies. */
export const PERMISSIONS = {
  'users.read': { resource: 'users', description: 'View users' },
  'users.manage': { resource: 'users', description: 'Suspend, reactivate and edit users' },
  'colleges.read': { resource: 'colleges', description: 'View colleges' },
  'colleges.manage': { resource: 'colleges', description: 'Create, edit and deactivate colleges' },
  'categories.read': { resource: 'categories', description: 'View categories' },
  'categories.manage': {
    resource: 'categories',
    description: 'Create and edit categories, attributes and amenities',
  },
  'places.read': { resource: 'places', description: 'View places' },
  'places.create': { resource: 'places', description: 'Create places' },
  'places.update': { resource: 'places', description: 'Edit places (owners: only their own)' },
  'places.manage': {
    resource: 'places',
    description: 'Approve, verify, deactivate and delete any place',
  },
  'submissions.review': {
    resource: 'submissions',
    description: 'Review place submissions and contributions',
  },
  'claims.review': { resource: 'claims', description: 'Approve or reject ownership claims' },
  'reviews.moderate': { resource: 'reviews', description: 'Hide, restore and remove reviews' },
  'reports.manage': { resource: 'reports', description: 'Triage and resolve reports' },
  'businesses.manage': { resource: 'businesses', description: 'Verify and manage businesses' },
  'analytics.view': { resource: 'analytics', description: 'View platform analytics' },
  'settings.manage': { resource: 'settings', description: 'Change platform settings' },
  'verifications.review': {
    resource: 'verifications',
    description: 'Review student verifications and manage college email domains',
  },
  'community.moderate': {
    resource: 'community',
    description: 'Remove and restore community posts and comments, handle their reports',
  },
  'marketplace.moderate': {
    resource: 'marketplace',
    description: 'Remove and restore marketplace listings, handle their reports',
  },
} as const satisfies Record<string, { resource: string; description: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export const permissionKeySchema = z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);

export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly PermissionKey[]>> = {
  SUPER_ADMIN: PERMISSION_KEYS,
  ADMIN: PERMISSION_KEYS.filter((key) => key !== 'settings.manage'),
  MODERATOR: [
    'users.read',
    'colleges.read',
    'categories.read',
    'places.read',
    'places.update',
    'submissions.review',
    'reviews.moderate',
    'reports.manage',
    'verifications.review',
    'community.moderate',
    'marketplace.moderate',
  ],
  STUDENT: ['colleges.read', 'categories.read', 'places.read'],
  // places.create / places.update are limited to the owner's own listings by a resource policy.
  BUSINESS_OWNER: [
    'colleges.read',
    'categories.read',
    'places.read',
    'places.create',
    'places.update',
  ],
};
