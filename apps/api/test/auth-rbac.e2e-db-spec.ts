import { Controller, Get } from '@nestjs/common';
import { PERMISSION_KEYS, ROLE_KEYS, ROLE_PERMISSIONS, authUserSchema } from '@platform/contracts';
import { z } from 'zod';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types.js';
import { CurrentUser } from '../src/modules/auth/decorators/current-user.decorator.js';
import { Permissions } from '../src/modules/auth/decorators/permissions.decorator.js';
import { Public } from '../src/modules/auth/decorators/public.decorator.js';
import { Roles } from '../src/modules/auth/decorators/roles.decorator.js';
import {
  type AuthTestContext,
  bearer,
  createAuthTestContext,
  errorOf,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './support/auth-e2e.js';

/** Test-only routes, one per way of declaring access. Note: only `open` says @Public(). */
@Controller('rbac-probe')
class RbacProbeController {
  @Public()
  @Get('open')
  open() {
    return { open: true };
  }

  @Get('secure')
  secure(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.id, roles: user.roles };
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }

  @Permissions('places.manage')
  @Get('places-manage')
  placesManage() {
    return { ok: true };
  }

  @Permissions('settings.manage')
  @Get('settings')
  settings() {
    return { ok: true };
  }

  // Needs BOTH permissions: students can read places but not update them.
  @Permissions('places.read', 'places.update')
  @Get('read-and-update')
  readAndUpdate() {
    return { ok: true };
  }

  // Needs the MODERATOR role AND a permission: ADMIN has the permission but not the role.
  @Roles('MODERATOR')
  @Permissions('reports.manage')
  @Get('moderator-reports')
  moderatorReports() {
    return { ok: true };
  }
}

type Persona = 'anonymous' | 'student' | 'moderator' | 'owner' | 'admin' | 'superAdmin';

describe('Access control (e2e, real database)', () => {
  let ctx: AuthTestContext;
  const tokens = {} as Record<Exclude<Persona, 'anonymous'>, string>;

  beforeAll(async () => {
    ctx = await createAuthTestContext({ controllers: [RbacProbeController] });

    const personas = [
      ['student', undefined],
      ['moderator', 'MODERATOR'],
      ['owner', 'BUSINESS_OWNER'],
      ['admin', 'ADMIN'],
      ['superAdmin', 'SUPER_ADMIN'],
    ] as const;
    for (const [persona, extraRole] of personas) {
      const account = await registerAndVerify(ctx, { label: persona.toLowerCase() });
      // Roles are read from the database at login, so grant BEFORE signing in.
      if (extraRole) await grantRole(ctx.db, account.userId, extraRole);
      tokens[persona] = (await login(ctx, account)).accessToken;
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  const call = (route: string, persona: Persona) => {
    const request = ctx.get(`/api/v1/rbac-probe/${route}`);
    return persona === 'anonymous'
      ? request
      : request.set('Authorization', bearer(tokens[persona]));
  };

  describe('the role and permission matrix (seeded roles, permissions and grants)', () => {
    // route -> status per persona. 401 = no valid token, 403 = signed in but not allowed.
    const matrix: Array<[string, Record<Persona, number>]> = [
      [
        'open',
        { anonymous: 200, student: 200, moderator: 200, owner: 200, admin: 200, superAdmin: 200 },
      ],
      [
        'secure',
        { anonymous: 401, student: 200, moderator: 200, owner: 200, admin: 200, superAdmin: 200 },
      ],
      [
        'admin-only',
        { anonymous: 401, student: 403, moderator: 403, owner: 403, admin: 200, superAdmin: 200 },
      ],
      [
        'places-manage',
        { anonymous: 401, student: 403, moderator: 403, owner: 403, admin: 200, superAdmin: 200 },
      ],
      [
        'settings',
        { anonymous: 401, student: 403, moderator: 403, owner: 403, admin: 403, superAdmin: 200 },
      ],
      [
        'read-and-update',
        { anonymous: 401, student: 403, moderator: 200, owner: 200, admin: 200, superAdmin: 200 },
      ],
      [
        'moderator-reports',
        { anonymous: 401, student: 403, moderator: 200, owner: 403, admin: 403, superAdmin: 403 },
      ],
    ];

    it.each(matrix)('%s', async (route, expected) => {
      for (const [persona, status] of Object.entries(expected) as Array<[Persona, number]>) {
        const response = await call(route, persona);
        expect({ persona, status: response.status }).toEqual({ persona, status });
      }
    });

    it('uses the standard error envelope: 401 UNAUTHORIZED and 403 FORBIDDEN', async () => {
      expect(errorOf(await call('admin-only', 'anonymous')).error.code).toBe('UNAUTHORIZED');
      expect(errorOf(await call('admin-only', 'student')).error.code).toBe('FORBIDDEN');
      expect(errorOf(await call('places-manage', 'moderator')).error.code).toBe('FORBIDDEN');
    });

    it('@CurrentUser() yields the verified caller, not anything the client sent', async () => {
      const response = await call('secure', 'moderator')
        .set('X-User-Id', 'someone-else')
        .set('X-Roles', 'SUPER_ADMIN');
      const { data } = successOf(
        z.object({ id: z.string(), roles: z.array(z.string()) }),
        response,
      );
      expect(data.roles).toEqual(['MODERATOR', 'STUDENT']);
      expect(data.id).not.toBe('someone-else');
    });
  });

  describe('secure by default', () => {
    // The ONLY routes allowed to answer without a token. Adding a @Public() route means adding it
    // here on purpose, which makes the decision visible in code review.
    const PUBLIC_ROUTES = [
      'GET /api/v1/amenities',
      'GET /api/v1/categories',
      'GET /api/v1/categories/{idOrSlug}',
      'GET /api/v1/colleges',
      'GET /api/v1/colleges/{idOrSlug}',
      'GET /api/v1/health',
      'GET /api/v1/health/database',
      'GET /api/v1/places',
      'GET /api/v1/places/{idOrSlug}',
      'POST /api/v1/auth/forgot-password',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/resend-verification',
      'POST /api/v1/auth/reset-password',
      'POST /api/v1/auth/verify-email',
    ];
    const PROTECTED_ROUTES = [
      'DELETE /api/v1/admin/categories/{id}/attributes/{attributeId}',
      'DELETE /api/v1/admin/categories/{id}/rating-dimensions/{dimensionId}',
      'DELETE /api/v1/admin/colleges/{id}/images/{imageId}',
      'DELETE /api/v1/admin/places/{id}/images/{imageId}',
      'GET /api/v1/admin/amenities',
      'GET /api/v1/admin/categories',
      'GET /api/v1/admin/categories/{id}',
      'GET /api/v1/admin/colleges',
      'GET /api/v1/admin/colleges/{id}',
      'GET /api/v1/admin/places',
      'GET /api/v1/admin/places/{id}',
      'GET /api/v1/admin/submissions',
      'GET /api/v1/admin/submissions/{id}',
      'GET /api/v1/auth/me',
      'GET /api/v1/place-submissions/{id}',
      'PATCH /api/v1/admin/amenities/{id}',
      'PATCH /api/v1/admin/categories/{id}',
      'PATCH /api/v1/admin/categories/{id}/attributes/{attributeId}',
      'PATCH /api/v1/admin/categories/{id}/rating-dimensions/{dimensionId}',
      'PATCH /api/v1/admin/colleges/{id}',
      'PATCH /api/v1/admin/colleges/{id}/images/{imageId}',
      'PATCH /api/v1/admin/places/{id}',
      'PATCH /api/v1/admin/places/{id}/images/{imageId}',
      'POST /api/v1/admin/amenities',
      'POST /api/v1/admin/amenities/{id}/activate',
      'POST /api/v1/admin/amenities/{id}/deactivate',
      'POST /api/v1/admin/categories',
      'POST /api/v1/admin/categories/{id}/activate',
      'POST /api/v1/admin/categories/{id}/attributes',
      'POST /api/v1/admin/categories/{id}/deactivate',
      'POST /api/v1/admin/categories/{id}/rating-dimensions',
      'POST /api/v1/admin/colleges',
      'POST /api/v1/admin/colleges/{id}/activate',
      'POST /api/v1/admin/colleges/{id}/deactivate',
      'POST /api/v1/admin/colleges/{id}/images',
      'POST /api/v1/admin/colleges/{id}/unverify',
      'POST /api/v1/admin/colleges/{id}/verify',
      'POST /api/v1/admin/places',
      'POST /api/v1/admin/places/{id}/activate',
      'POST /api/v1/admin/places/{id}/deactivate',
      'POST /api/v1/admin/places/{id}/images',
      'POST /api/v1/admin/places/{id}/unverify',
      'POST /api/v1/admin/places/{id}/verify',
      'POST /api/v1/admin/submissions/{id}/approve',
      'POST /api/v1/admin/submissions/{id}/mark-duplicate',
      'POST /api/v1/admin/submissions/{id}/reject',
      'POST /api/v1/auth/logout',
      'POST /api/v1/auth/logout-all',
      'POST /api/v1/place-submissions',
      'POST /api/v1/places/duplicate-check',
    ];

    it('answers 401 to every documented route that is not explicitly public', async () => {
      // A plain app, without the probe routes above.
      const plain = await createAuthTestContext();
      try {
        const document = (await plain.get('/api/docs-json').expect(200)).body as {
          paths: Record<string, Record<string, unknown>>;
        };

        const requiresLogin: string[] = [];
        const open: string[] = [];
        for (const [path, operations] of Object.entries(document.paths)) {
          for (const method of Object.keys(operations)) {
            const label = `${method.toUpperCase()} ${path}`;
            const url = path.replace(/\{[^}]+\}/g, 'x');
            const send = {
              get: plain.get,
              post: plain.post,
              patch: plain.patch,
              delete: plain.delete,
            }[method];
            if (!send) throw new Error(`Extend this sweep for ${label}`);
            const response = await send(url);
            // The label keeps the documented path (with its {placeholders}), so it reads like the route.
            (response.status === 401 ? requiresLogin : open).push(label);
          }
        }

        expect(requiresLogin.sort()).toEqual(PROTECTED_ROUTES);
        expect(open.sort()).toEqual(PUBLIC_ROUTES);
      } finally {
        await plain.close();
      }
    });
  });

  describe('seeded reference data (Phase 2) still drives authorisation', () => {
    it('has the 5 roles, 17 permissions and the exact grants defined in @platform/contracts', async () => {
      const roles = await ctx.db.role.findMany({ select: { key: true }, orderBy: { key: 'asc' } });
      expect(roles.map((role) => role.key)).toEqual([...ROLE_KEYS].sort());

      const permissions = await ctx.db.permission.findMany({
        select: { key: true },
        orderBy: { key: 'asc' },
      });
      expect(permissions.map((permission) => permission.key)).toEqual([...PERMISSION_KEYS].sort());

      const grants = await ctx.db.rolePermission.findMany({
        select: { role: { select: { key: true } }, permission: { select: { key: true } } },
      });
      for (const role of ROLE_KEYS) {
        const granted = grants
          .filter((grant) => grant.role.key === role)
          .map((grant) => grant.permission.key);
        expect(granted.sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
      }
    });

    it('the seeded demo admin can sign in and holds every permission', async ({ skip }) => {
      const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@localhost.test';
      const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
      const admin = await ctx.db.user.findUnique({ where: { email } });
      if (!admin) return skip('the demo admin was purged (npm run db:purge-demo)');

      const startedAt = new Date();
      const previousLastLogin = admin.lastLoginAt;
      try {
        const response = await ctx.post('/api/v1/auth/login').send({ email, password });
        if (response.status === 401) return skip('the demo admin password was changed');
        expect(response.status).toBe(200);

        const { accessToken } = (response.body as { data: { accessToken: string } }).data;
        const me = successOf(
          authUserSchema,
          await ctx.get('/api/v1/auth/me').set('Authorization', bearer(accessToken)),
        );
        expect(me.data.roles).toEqual(['SUPER_ADMIN']);
        expect([...me.data.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
        await ctx
          .get('/api/v1/rbac-probe/settings')
          .set('Authorization', bearer(accessToken))
          .expect(200);
      } finally {
        // Leave the Phase 2 admin exactly as it was: remove only the sessions this test created.
        await ctx.db.refreshToken.deleteMany({
          where: { userId: admin.id, createdAt: { gte: startedAt } },
        });
        await ctx.db.user.update({
          where: { id: admin.id },
          data: { lastLoginAt: previousLastLogin },
        });
      }
    });
  });
});
