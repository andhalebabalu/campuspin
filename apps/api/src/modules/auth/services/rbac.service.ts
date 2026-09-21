import { Injectable } from '@nestjs/common';
import { type PermissionKey, permissionKeySchema } from '@platform/contracts';
import { PrismaService } from '../../../infra/database/prisma.service.js';

/**
 * Role grants change rarely (an admin edit or a deploy) but are needed on every guarded request, so
 * the whole role -> permission map (a handful of roles, ~50 rows) is cached for a short time
 * instead of being queried each time. `invalidate()` drops it immediately (call it after editing
 * `role_permissions`); otherwise a change is picked up within this window.
 */
const CACHE_TTL_MS = 60_000;

type Grants = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Answers "what may these roles do?" from the EXISTING `roles`, `permissions` and `role_permissions`
 * tables. There is no second permission scheme: the keys are the ones seeded from
 * `@platform/contracts`, and the database is the runtime source of truth.
 */
@Injectable()
export class RbacService {
  private cached: { grants: Grants; loadedAt: number } | undefined;
  private loading: Promise<Grants> | undefined;
  /** Bumped by `invalidate()` so a load that started before it cannot repopulate the cache. */
  private generation = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Every permission granted by any of the roles, sorted and de-duplicated. */
  async permissionsForRoles(roles: readonly string[]): Promise<PermissionKey[]> {
    const grants = await this.grants();
    const permissions = new Set<PermissionKey>();
    for (const role of roles) {
      for (const key of grants.get(role) ?? []) {
        const parsed = permissionKeySchema.safeParse(key);
        if (parsed.success) permissions.add(parsed.data);
      }
    }
    return [...permissions].sort();
  }

  invalidate(): void {
    this.generation += 1;
    this.cached = undefined;
    this.loading = undefined;
  }

  private grants(): Promise<Grants> {
    const cached = this.cached;
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS)
      return Promise.resolve(cached.grants);
    // Concurrent callers share one query.
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<Grants> {
    const generation = this.generation;
    try {
      const rows = await this.prisma.rolePermission.findMany({
        select: { role: { select: { key: true } }, permission: { select: { key: true } } },
      });
      const grants = new Map<string, Set<string>>();
      for (const { role, permission } of rows) {
        const set = grants.get(role.key) ?? new Set<string>();
        set.add(permission.key);
        grants.set(role.key, set);
      }
      if (generation === this.generation) this.cached = { grants, loadedAt: Date.now() };
      return grants;
    } finally {
      if (generation === this.generation) this.loading = undefined;
    }
  }
}
