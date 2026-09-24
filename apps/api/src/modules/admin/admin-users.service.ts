import { Injectable } from '@nestjs/common';
import type {
  AdminListUsersQuery,
  AdminUser,
  ReactivateUserRequest,
  RoleKey,
  SuspendUserRequest,
  UpdateUserRolesRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { roleKeysOf } from '../auth/account.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { SessionService } from '../auth/services/session.service.js';
import { escapeLike } from '../places/place-queries.js';

const STAFF_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'SUPER_ADMIN']);

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { key: true } } } },
  ownedBusinesses: {
    select: { id: true, businessName: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function toAdminUser(row: UserRow): AdminUser {
  const business = row.ownedBusinesses[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    emailVerified: row.emailVerifiedAt !== null,
    roles: roleKeysOf(row),
    business: business ? { id: business.id, businessName: business.businessName } : null,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const notFound = () => AppException.notFound('User not found');

/**
 * Staff user management. The rules the permission layer cannot express live here (docs/07-rbac.md
 * §4 rule 9): nobody acts on their own account, only a SUPER_ADMIN may act on an ADMIN or
 * SUPER_ADMIN, and the last active SUPER_ADMIN can be neither suspended nor demoted.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminListUsersQuery): Promise<Paginated<AdminUser>> {
    const like = query.q ? escapeLike(query.q) : undefined;
    const where: Prisma.UserWhereInput = {
      ...(like ? { OR: [{ name: { contains: like } }, { email: { contains: like } }] } : {}),
      ...(query.role ? { userRoles: { some: { role: { key: query.role } } } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return Paginated.of(rows.map(toAdminUser), { ...query, total });
  }

  async get(id: string): Promise<AdminUser> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!row) throw notFound();
    return toAdminUser(row);
  }

  async suspend(
    id: string,
    dto: SuspendUserRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminUser> {
    const target = await this.loadTarget(id, actor);
    if (target.status === 'SUSPENDED') {
      throw AppException.conflict('CONFLICT', 'This account is already suspended.');
    }
    await this.prisma.$transaction(async (tx) => {
      if (target.roles.includes('SUPER_ADMIN')) await this.assertAnotherSuperAdmin(id, tx);
      await tx.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
      // Signed out everywhere at once; login and refresh are refused while suspended.
      const revokedSessions = await this.sessions.revokeAllForUser(id, 'ADMIN', tx);
      await this.audit.record(
        {
          action: 'USER_SUSPENDED',
          actorId: actor.id,
          entityType: 'User',
          entityId: id,
          metadata: { reason: dto.reason, revokedSessions, from: target.status },
          client,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async reactivate(
    id: string,
    dto: ReactivateUserRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminUser> {
    const target = await this.loadTarget(id, actor);
    if (target.status !== 'SUSPENDED') {
      throw AppException.conflict('CONFLICT', 'Only a suspended account can be reactivated.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'ACTIVE' } });
      await this.audit.record(
        {
          action: 'USER_REACTIVATED',
          actorId: actor.id,
          entityType: 'User',
          entityId: id,
          ...(dto?.reason ? { metadata: { reason: dto.reason } } : {}),
          client,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** SUPER_ADMIN only (enforced by the controller); replaces the whole set of roles. */
  async setRoles(
    id: string,
    dto: UpdateUserRolesRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminUser> {
    const target = await this.loadTarget(id, actor);
    const next = [...new Set(dto.roles)].sort();
    const removed = target.roles.filter((role) => !next.includes(role));
    const added = next.filter((role) => !target.roles.includes(role));
    if (removed.length === 0 && added.length === 0) return this.get(id);

    const roleRows = await this.prisma.role.findMany({
      where: { key: { in: next } },
      select: { id: true, key: true },
    });
    if (roleRows.length !== next.length) {
      throw AppException.validation({ roles: ['A role does not exist. Run the reference seed.'] });
    }

    await this.prisma.$transaction(async (tx) => {
      if (removed.includes('SUPER_ADMIN')) await this.assertAnotherSuperAdmin(id, tx);
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roleRows.map((role) => ({ userId: id, roleId: role.id, assignedById: actor.id })),
      });
      // Losing a role must take effect now, not when the current access token expires: end the
      // sessions so the next sign-in carries the reduced roles. Gaining one needs no sign-out.
      const revokedSessions =
        removed.length > 0 ? await this.sessions.revokeAllForUser(id, 'ADMIN', tx) : 0;
      await this.audit.record(
        {
          action: 'USER_ROLES_CHANGED',
          actorId: actor.id,
          entityType: 'User',
          entityId: id,
          metadata: {
            from: target.roles,
            to: next,
            revokedSessions,
            ...(dto.reason ? { reason: dto.reason } : {}),
          },
          client,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** The target account, after the rules every action shares (not yourself; rank). */
  private async loadTarget(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{ status: string; roles: RoleKey[] }> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: { status: true, userRoles: { select: { role: { select: { key: true } } } } },
    });
    if (!row) throw notFound();
    if (id === actor.id) {
      throw AppException.forbidden('FORBIDDEN', 'You cannot change your own account here.');
    }
    const roles = roleKeysOf(row);
    if (roles.some((role) => STAFF_ROLES.has(role)) && !actor.roles.includes('SUPER_ADMIN')) {
      throw AppException.forbidden(
        'FORBIDDEN',
        'Only a super admin can change an admin or super admin account.',
      );
    }
    return { status: row.status, roles };
  }

  /** Refuses when `userId` is the only ACTIVE super admin left. */
  private async assertAnotherSuperAdmin(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const others = await tx.user.count({
      where: {
        id: { not: userId },
        status: 'ACTIVE',
        userRoles: { some: { role: { key: 'SUPER_ADMIN' } } },
      },
    });
    if (others === 0) {
      throw AppException.conflict(
        'CONFLICT',
        'This is the last active super admin. Make someone else a super admin first.',
      );
    }
  }
}
