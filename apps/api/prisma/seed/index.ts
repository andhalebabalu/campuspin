import { seedDemo, type DemoSeedOptions } from './demo.js';
import type { Db } from './db.js';
import { seedReference } from './reference.js';

type SeededTable =
  | 'roles'
  | 'permissions'
  | 'role_permissions'
  | 'categories'
  | 'category_attributes'
  | 'category_rating_dimensions'
  | 'amenities'
  | 'users'
  | 'user_roles'
  | 'colleges'
  | 'college_images'
  | 'places'
  | 'place_categories'
  | 'place_images'
  | 'place_amenities'
  | 'place_hours'
  | 'place_price_options'
  | 'place_attribute_values'
  | 'college_places'
  | 'promotions';

/** Row counts of every table the seed touches. */
export type SeedCounts = Record<SeededTable, number>;

export async function countSeededTables(db: Db): Promise<SeedCounts> {
  // Sequential on purpose: safe on a single transaction connection.
  return {
    roles: await db.role.count(),
    permissions: await db.permission.count(),
    role_permissions: await db.rolePermission.count(),
    categories: await db.category.count(),
    category_attributes: await db.categoryAttribute.count(),
    category_rating_dimensions: await db.categoryRatingDimension.count(),
    amenities: await db.amenity.count(),
    users: await db.user.count(),
    user_roles: await db.userRole.count(),
    colleges: await db.college.count(),
    college_images: await db.collegeImage.count(),
    places: await db.place.count(),
    place_categories: await db.placeCategory.count(),
    place_images: await db.placeImage.count(),
    place_amenities: await db.placeAmenity.count(),
    place_hours: await db.placeHour.count(),
    place_price_options: await db.placePriceOption.count(),
    place_attribute_values: await db.placeAttributeValue.count(),
    college_places: await db.collegePlace.count(),
    promotions: await db.promotion.count(),
  };
}

export interface SeedOptions extends DemoSeedOptions {
  /** false = reference data only (the only mode allowed in production). */
  demo: boolean;
}

export interface SeedResult {
  before: SeedCounts;
  after: SeedCounts;
}

export async function runSeed(db: Db, options: SeedOptions): Promise<SeedResult> {
  const before = await countSeededTables(db);
  await seedReference(db);
  if (options.demo) {
    await seedDemo(db, options);
  }
  const after = await countSeededTables(db);
  return { before, after };
}

export function formatSeedResult({ before, after }: SeedResult): string {
  const rows = (Object.keys(after) as Array<keyof SeedCounts>).map((table) => {
    const created = after[table] - before[table];
    return `  ${table.padEnd(28)} ${String(after[table]).padStart(4)} total   ${created > 0 ? `+${created} created` : 'unchanged'}`;
  });
  const created = (Object.keys(after) as Array<keyof SeedCounts>).reduce(
    (sum, table) => sum + (after[table] - before[table]),
    0,
  );
  return [...rows, `  ${'-'.repeat(60)}`, `  ${created} record(s) created in this run`].join('\n');
}
