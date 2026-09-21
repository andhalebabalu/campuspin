import { PERMISSION_KEYS, ROLE_PERMISSIONS } from '@platform/contracts';
import { vi } from 'vitest';
import { buildAuthKit } from '../../../../test/support/auth-unit.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('RbacService', () => {
  it('returns the permissions of a role exactly as seeded, sorted', async () => {
    const { rbac } = buildAuthKit();
    expect(await rbac.permissionsForRoles(['STUDENT'])).toEqual([
      'categories.read',
      'colleges.read',
      'places.read',
    ]);
    expect(await rbac.permissionsForRoles(['MODERATOR'])).toEqual(
      [...ROLE_PERMISSIONS.MODERATOR].sort(),
    );
  });

  it('gives SUPER_ADMIN every permission and ADMIN all but settings.manage', async () => {
    const { rbac } = buildAuthKit();
    expect(await rbac.permissionsForRoles(['SUPER_ADMIN'])).toEqual([...PERMISSION_KEYS].sort());
    const admin = await rbac.permissionsForRoles(['ADMIN']);
    expect(admin).toHaveLength(PERMISSION_KEYS.length - 1);
    expect(admin).not.toContain('settings.manage');
  });

  it('merges several roles without duplicates', async () => {
    const { rbac } = buildAuthKit();
    const merged = await rbac.permissionsForRoles(['STUDENT', 'MODERATOR', 'STUDENT']);
    expect(new Set(merged).size).toBe(merged.length);
    expect(merged).toEqual(
      expect.arrayContaining(['places.read', 'places.update', 'reports.manage']),
    );
  });

  it('gives nothing for unknown or missing roles', async () => {
    const { rbac } = buildAuthKit();
    expect(await rbac.permissionsForRoles([])).toEqual([]);
    expect(await rbac.permissionsForRoles(['NOT_A_ROLE'])).toEqual([]);
  });

  it('ignores a granted permission key the code does not know about', async () => {
    const { rbac, fake } = buildAuthKit();
    vi.spyOn(fake.rolePermission, 'findMany').mockResolvedValue([
      { role: { key: 'STUDENT' }, permission: { key: 'places.read' } },
      { role: { key: 'STUDENT' }, permission: { key: 'made.up' } },
    ]);
    expect(await rbac.permissionsForRoles(['STUDENT'])).toEqual(['places.read']);
  });

  describe('caching (no query per guarded request)', () => {
    it('loads the grants once for repeated calls', async () => {
      const { rbac, fake } = buildAuthKit();
      const query = vi.spyOn(fake.rolePermission, 'findMany');

      for (let i = 0; i < 25; i += 1) await rbac.permissionsForRoles(['STUDENT']);

      expect(query).toHaveBeenCalledTimes(1);
    });

    it('shares one query between simultaneous callers', async () => {
      const { rbac, fake } = buildAuthKit();
      const query = vi.spyOn(fake.rolePermission, 'findMany');

      await Promise.all(Array.from({ length: 10 }, () => rbac.permissionsForRoles(['ADMIN'])));

      expect(query).toHaveBeenCalledTimes(1);
    });

    it('reloads after the cache lifetime, so a grant change is picked up within a minute', async () => {
      vi.useFakeTimers();
      const { rbac, fake } = buildAuthKit();
      const query = vi.spyOn(fake.rolePermission, 'findMany');

      await rbac.permissionsForRoles(['STUDENT']);
      vi.advanceTimersByTime(59_000);
      await rbac.permissionsForRoles(['STUDENT']);
      expect(query).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2_000);
      await rbac.permissionsForRoles(['STUDENT']);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('invalidate() takes effect immediately', async () => {
      const { rbac, fake } = buildAuthKit();
      const query = vi.spyOn(fake.rolePermission, 'findMany');
      await rbac.permissionsForRoles(['STUDENT']);

      rbac.invalidate();
      await rbac.permissionsForRoles(['STUDENT']);

      expect(query).toHaveBeenCalledTimes(2);
    });

    it('does not let a load that started before invalidate() repopulate the cache with stale data', async () => {
      const { rbac, fake } = buildAuthKit();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const stale = [{ role: { key: 'STUDENT' }, permission: { key: 'places.read' } }];
      const fresh = [{ role: { key: 'STUDENT' }, permission: { key: 'colleges.read' } }];
      vi.spyOn(fake.rolePermission, 'findMany')
        .mockImplementationOnce(async () => {
          await gate;
          return stale;
        })
        .mockResolvedValue(fresh);

      const inFlight = rbac.permissionsForRoles(['STUDENT']);
      rbac.invalidate(); // an admin edited the grants while the first load was running
      release();
      await inFlight;

      expect(await rbac.permissionsForRoles(['STUDENT'])).toEqual(['colleges.read']);
    });

    it('does not cache a failed load: the next call retries', async () => {
      const { rbac, fake } = buildAuthKit();
      vi.spyOn(fake.rolePermission, 'findMany').mockRejectedValueOnce(new Error('database down'));

      await expect(rbac.permissionsForRoles(['STUDENT'])).rejects.toThrow('database down');
      expect(await rbac.permissionsForRoles(['STUDENT'])).toContain('places.read');
    });
  });
});
