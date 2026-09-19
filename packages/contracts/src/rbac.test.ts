import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLES,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  permissionKeySchema,
} from './index.js';

describe('roles', () => {
  it('defines the five platform roles, each with a display name', () => {
    expect([...ROLE_KEYS]).toEqual([
      'SUPER_ADMIN',
      'ADMIN',
      'MODERATOR',
      'STUDENT',
      'BUSINESS_OWNER',
    ]);
    for (const key of ROLE_KEYS) {
      expect(ROLES[key].name.length).toBeGreaterThan(0);
    }
  });
});

describe('permissions', () => {
  it('uses the <resource>.<action> key format and a matching resource', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(key.split('.')[0]).toBe(PERMISSIONS[key].resource);
    }
  });

  it('has the initial permission set', () => {
    expect(PERMISSION_KEYS).toHaveLength(17);
    expect(permissionKeySchema.safeParse('places.manage').success).toBe(true);
    expect(permissionKeySchema.safeParse('places.destroy').success).toBe(false);
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('only references defined permissions, with no duplicates per role', () => {
    for (const role of ROLE_KEYS) {
      const granted = ROLE_PERMISSIONS[role];
      expect(new Set(granted).size).toBe(granted.length);
      for (const key of granted) expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('gives SUPER_ADMIN everything and ADMIN everything except settings', () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(PERMISSION_KEYS.length);
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain('settings.manage');
    expect(ROLE_PERMISSIONS.ADMIN).toHaveLength(PERMISSION_KEYS.length - 1);
  });

  it('keeps the hierarchy: whatever a moderator can do, an admin can do', () => {
    for (const key of ROLE_PERMISSIONS.MODERATOR) {
      expect(ROLE_PERMISSIONS.ADMIN).toContain(key);
    }
  });

  it('never gives students or business owners any management or moderation power', () => {
    const forbidden = ROLE_PERMISSIONS.STUDENT.concat(ROLE_PERMISSIONS.BUSINESS_OWNER).filter(
      (key) =>
        key.endsWith('.manage') ||
        key.endsWith('.review') ||
        key.endsWith('.moderate') ||
        key === 'settings.manage' ||
        key === 'analytics.view' ||
        key === 'users.read',
    );
    expect(forbidden).toEqual([]);
  });

  it('grants every permission to at least one role (no orphan permissions)', () => {
    const granted = new Set(ROLE_KEYS.flatMap((role) => ROLE_PERMISSIONS[role]));
    expect([...granted].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});
