import { randomUUID } from 'node:crypto';
import { adminCollegeSchema } from '@platform/contracts';
import {
  type AuthTestContext,
  bearer,
  grantRole,
  login,
  registerAndVerify,
  successOf,
} from './auth-e2e.js';

const API = '/api/v1';

export interface Persona {
  userId: string;
  token: string;
  email: string;
  password: string;
}

/** A signed-in test member, optionally with an extra role. */
export async function persona(
  ctx: AuthTestContext,
  label: string,
  options: { role?: string; name?: string } = {},
): Promise<Persona> {
  const account = await registerAndVerify(ctx, { label, name: options.name ?? 'Asha Kulkarni' });
  if (options.role) await grantRole(ctx.db, account.userId, options.role);
  const { accessToken } = await login(ctx, account);
  return { ...account, token: accessToken };
}

export const as = <T extends { set: (name: string, value: string) => T }>(
  who: Persona,
  req: T,
): T => req.set('Authorization', bearer(who.token));

/** An active test college ("E2E ..." names give "e2e-" slugs, which the shared cleanup removes). */
export async function makeCollege(
  ctx: AuthTestContext,
  admin: Persona,
  label: string,
  at: { latitude: number; longitude: number; city?: string } = {
    latitude: 19.09,
    longitude: 74.74,
  },
): Promise<string> {
  const response = await as(admin, ctx.post(`${API}/admin/colleges`)).send({
    name: `E2E ${label} College ${randomUUID().slice(0, 8)}`,
    address: 'Test Road, Testville',
    state: 'Maharashtra',
    latitude: at.latitude,
    longitude: at.longitude,
    city: at.city ?? 'Testville',
    status: 'ACTIVE',
  });
  if (response.status !== 201) throw new Error(JSON.stringify(response.body));
  return successOf(adminCollegeSchema, response).data.id;
}

/**
 * Marks a member a verified student of a college directly in the database. The verification flows
 * themselves are covered by students.e2e-db-spec; here only the outcome matters.
 */
export async function verifyStudent(
  ctx: AuthTestContext,
  who: Persona,
  collegeId: string,
): Promise<void> {
  await ctx.db.user.update({
    where: { id: who.userId },
    data: {
      verifiedCollegeId: collegeId,
      studentVerifiedAt: new Date(),
      studentVerifiedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
}
