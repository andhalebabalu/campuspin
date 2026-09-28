import { randomUUID } from 'node:crypto';
import {
  type AuthTestContext,
  TEST_PLACE_SLUG_PREFIX,
  login,
  registerAndVerify,
} from './auth-e2e.js';
import type { Persona } from './student-fixtures.js';

export interface BusinessFixture {
  owner: Persona;
  businessId: string;
  place: { id: string; slug: string; name: string };
}

/**
 * A signed-in business owner with one LIVE place, created straight in the database (the listing
 * review flow itself is covered by business.e2e-db-spec). The slug carries the reserved test prefix,
 * so the shared cleanup removes the place and everything that cascades with it.
 */
export async function businessWithPlace(
  ctx: AuthTestContext,
  label: string,
  at: { latitude: number; longitude: number } = { latitude: 19.09, longitude: 74.74 },
): Promise<BusinessFixture> {
  const run = randomUUID().slice(0, 8);
  const account = await registerAndVerify(ctx, {
    label,
    name: 'Ravi Owner',
    businessName: `E2E ${label} Business ${run}`,
  });
  const { accessToken } = await login(ctx, account);
  const business = await ctx.db.businessProfile.findFirstOrThrow({
    where: { ownerId: account.userId },
    select: { id: true },
  });
  const name = `E2E Place ${label} ${run}`;
  const place = await ctx.db.place.create({
    data: {
      name,
      slug: `${TEST_PLACE_SLUG_PREFIX}${label}-${run}`,
      address: 'Test Road, Testville',
      city: 'Testville',
      state: 'Maharashtra',
      latitude: at.latitude,
      longitude: at.longitude,
      status: 'ACTIVE',
      publishedAt: new Date(),
      createdById: account.userId,
      businessProfileId: business.id,
    },
    select: { id: true, slug: true, name: true },
  });
  return { owner: { ...account, token: accessToken }, businessId: business.id, place };
}
