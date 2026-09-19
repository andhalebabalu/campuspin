import type { Db } from './db.js';

export interface PurgeResult {
  places: number;
  colleges: number;
  businesses: number;
  users: number;
}

/** Demo accounts all use the reserved, undeliverable `.test` top-level domain. */
const DEMO_EMAIL_SUFFIX = '@localhost.test';

/**
 * Removes everything flagged as demo (`isDemo`) and the demo accounts, together with the rows that
 * depend on demo places (reviews, claims, contributions). Real data is never touched. This is the
 * one sanctioned hard-delete path; run it before going to production.
 */
export async function purgeDemoData(db: Db): Promise<PurgeResult> {
  const onDemoPlace = { place: { isDemo: true } };

  await db.review.deleteMany({ where: onDemoPlace });
  await db.placeClaim.deleteMany({ where: onDemoPlace });
  await db.placeContribution.deleteMany({ where: onDemoPlace });
  await db.savedPlace.deleteMany({ where: onDemoPlace });

  // Child rows (categories, images, hours, amenities, prices, attribute values, college links)
  // are removed by ON DELETE CASCADE.
  const places = await db.place.deleteMany({ where: { isDemo: true } });
  const colleges = await db.college.deleteMany({ where: { isDemo: true } });
  const businesses = await db.businessProfile.deleteMany({ where: { isDemo: true } });
  const users = await db.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL_SUFFIX } } });

  return {
    places: places.count,
    colleges: colleges.count,
    businesses: businesses.count,
    users: users.count,
  };
}
