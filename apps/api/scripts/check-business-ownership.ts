/**
 * Read-only: lists businesses run from the wrong kind of account (a student, a staff member, or an
 * account without the business role). Run it before and after a deployment:
 *
 *   cd apps/api && npx tsx scripts/check-business-ownership.ts
 *
 * It changes nothing. Fix each business from the admin panel (Businesses → Ownership check → open
 * the business → Transfer ownership), which moves it to the owner's business account with its
 * listings, reviews and history intact. Exit code 1 while anything is listed, so CI can gate on it.
 */
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppConfig, ConfigError } from '../src/infra/config/app-config.js';
import { loadEnvFile } from '../src/infra/config/load-env.js';
import { createMariaDbAdapter } from '../src/infra/database/mariadb-adapter.js';

const STAFF = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'];

loadEnvFile();

let config: AppConfig;
try {
  config = AppConfig.fromEnv();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
}

const db = new PrismaClient({ adapter: createMariaDbAdapter(config.databaseUrl) });
try {
  const [total, rows] = await Promise.all([
    db.businessProfile.count(),
    db.businessProfile.findMany({
      where: {
        owner: {
          OR: [
            { userRoles: { none: { role: { key: 'BUSINESS_OWNER' } } } },
            { userRoles: { some: { role: { key: { in: ['STUDENT', ...STAFF] } } } } },
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        businessName: true,
        slug: true,
        owner: {
          select: { email: true, userRoles: { select: { role: { select: { key: true } } } } },
        },
        _count: { select: { places: true } },
      },
    }),
  ]);

  console.log(`Checked ${total} business(es) in ${config.databaseTarget}.`);
  if (rows.length === 0) {
    console.log('✔ Every business is owned by a business account. Nothing to migrate.');
  } else {
    console.log(`✖ ${rows.length} business(es) need a new owner:`);
    for (const row of rows) {
      const roles = row.owner.userRoles.map((link) => link.role.key).join(', ') || 'no roles';
      console.log(
        `  - ${row.businessName} (/business/${row.slug}, ${row._count.places} listing(s)): owner ${row.owner.email} [${roles}]`,
      );
    }
    console.log('Fix them in the admin panel: Businesses → Ownership check → Transfer ownership.');
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
