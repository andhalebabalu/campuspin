/**
 * Imports the REAL Ahmednagar (Ahilyanagar) district data in `prisma/data/ahmednagar/`:
 *
 *   npm run db:import:ahmednagar
 *
 * - colleges.json: every college in the Directorate of Higher Education's aided and non-aided lists
 *   and the State CET Cell's Engineering / Pharmacy / BCA-BBA-BMS institute lists for the district.
 * - places.json: named OpenStreetMap features (© OpenStreetMap contributors, ODbL) within 2 km of
 *   those colleges — hospitals and medical stores, restaurants, hostels, grocery, bus stands, ...
 *
 * Everything is published (ACTIVE) but NOT verified: the verified badge stays off until staff check
 * a row. Nothing is invented — no prices, hours or phone numbers beyond what the sources hold — and
 * every description says where the row came from and how exact its map location is.
 *
 * Safe to run repeatedly: a college is matched by its slug, a place by name + location, and existing
 * rows are left alone (staff edits are never overwritten). Unlike the demo seed, it is allowed in
 * production: this is real data (`isDemo` is false).
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RESERVED_COLLEGE_SLUGS, RESERVED_PLACE_SLUGS } from '@platform/contracts';
import { distanceMeters } from '../src/common/geo/haversine.js';
import { hashPassword } from '../src/common/security/password-hasher.js';
import { pickFreeSlug, slugRoot } from '../src/common/utils/slug.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppConfig, ConfigError } from '../src/infra/config/app-config.js';
import { loadEnvFile } from '../src/infra/config/load-env.js';
import { createMariaDbAdapter } from '../src/infra/database/mariadb-adapter.js';

interface CollegeRow {
  name: string;
  address: string;
  city: string;
  taluka: string;
  latitude: number;
  longitude: number;
  locationPrecision: 'exact' | 'approximate';
  locationNote: string;
  kind: string | null;
  university: string | null;
  courses: string[] | null;
  source: string;
  sourceUrl: string;
}

interface PlaceRow {
  osmId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  phone: string | null;
  website: string | null;
}

const DATA_DIR = new URL('./data/ahmednagar/', import.meta.url);
const STATE = 'Maharashtra';
/** The account every imported place is "created by" (a place must have a creator). It cannot sign in. */
const IMPORT_ACCOUNT = { email: 'data-import@campuspin.invalid', name: 'CampusPin data import' };
/** Two rows with the same name this close together are the same place. */
const SAME_PLACE_METERS = 60;

function load<T>(file: string): T[] {
  return (JSON.parse(readFileSync(new URL(file, DATA_DIR), 'utf8')) as { items: T[] }).items;
}

function collegeDescription(c: CollegeRow): string {
  const lines = [
    c.courses?.length ? `Courses: ${c.courses.join(', ')}.` : null,
    c.university ? `Affiliated to ${c.university}.` : null,
    c.kind ? `Type: ${c.kind}.` : null,
    `Listed from the official ${c.source} (${c.sourceUrl}).`,
    c.locationPrecision === 'exact'
      ? 'Map location from OpenStreetMap.'
      : `Map location is APPROXIMATE (${c.locationNote.replace(/^approximate \(|\)$/g, '')}), not the campus itself; distances to nearby places are measured from that point until staff correct it.`,
    'Not yet verified by CampusPin staff.',
  ];
  return lines.filter(Boolean).join('\n');
}

const PLACE_DESCRIPTION =
  'Listed from OpenStreetMap (© OpenStreetMap contributors, ODbL). Not yet verified by CampusPin ' +
  'staff: prices, opening hours and contact details may be missing. Know this place? Staff can ' +
  'update it.';

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
  const colleges = load<CollegeRow>('colleges.json');
  const places = load<PlaceRow>('places.json');
  console.log(`Importing Ahmednagar district data into ${config.databaseTarget} ...`);

  // ── The import account ──────────────────────────────────────────────────────────────────────
  const importer =
    (await db.user.findUnique({ where: { email: IMPORT_ACCOUNT.email }, select: { id: true } })) ??
    (await db.user.create({
      data: {
        ...IMPORT_ACCOUNT,
        // A random password nobody knows, on an account that is deactivated: it can never sign in.
        passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        status: 'DEACTIVATED',
      },
      select: { id: true },
    }));

  // ── Colleges ────────────────────────────────────────────────────────────────────────────────
  const collegeSlugs = new Set(
    (await db.college.findMany({ select: { slug: true } })).map((row) => row.slug),
  );
  let collegesCreated = 0;
  let collegesKept = 0;
  for (const c of colleges) {
    const root = slugRoot(c.name, {
      reservedWords: RESERVED_COLLEGE_SLUGS,
      fallback: 'college',
    })
      .slice(0, 110)
      .replace(/-+$/, '');
    const existing = await db.college.findFirst({
      where: { OR: [{ slug: root }, { name: c.name, city: c.city }] },
      select: { id: true },
    });
    if (existing) {
      collegesKept += 1;
      continue;
    }
    const slug = pickFreeSlug(root, collegeSlugs);
    collegeSlugs.add(slug);
    await db.college.create({
      data: {
        name: c.name,
        slug,
        description: collegeDescription(c),
        address: c.address,
        city: c.city,
        state: STATE,
        latitude: c.latitude,
        longitude: c.longitude,
        status: 'ACTIVE',
        verificationStatus: 'PENDING',
        isDemo: false,
      },
    });
    collegesCreated += 1;
  }

  // ── Places ──────────────────────────────────────────────────────────────────────────────────
  const categories = new Map(
    (await db.category.findMany({ select: { id: true, slug: true } })).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const placeSlugs = new Set(
    (await db.place.findMany({ select: { slug: true } })).map((row) => row.slug),
  );
  let placesCreated = 0;
  let placesKept = 0;
  for (const p of places) {
    const categoryId = categories.get(p.category);
    if (!categoryId)
      throw new Error(`Category "${p.category}" is missing: run npm run db:seed:reference first.`);

    const sameName = await db.place.findMany({
      where: { name: p.name },
      select: { id: true, latitude: true, longitude: true },
    });
    if (sameName.some((row) => distanceMeters(row, p) <= SAME_PLACE_METERS)) {
      placesKept += 1;
      continue;
    }
    // A name with no Latin letters (a Marathi name, say) slugs to nothing: use its city instead.
    const root = slugRoot(`${p.name} ${p.city}`, {
      reservedWords: RESERVED_PLACE_SLUGS,
      fallback: 'place',
    });
    const slug = pickFreeSlug(
      root.length >= 3 && /[a-z]/.test(root)
        ? root.slice(0, 110).replace(/-+$/, '')
        : slugRoot(`place ${p.city}`, { reservedWords: RESERVED_PLACE_SLUGS, fallback: 'place' }),
      placeSlugs,
    );
    placeSlugs.add(slug);
    await db.place.create({
      data: {
        name: p.name,
        slug,
        description: PLACE_DESCRIPTION,
        address: p.address,
        city: p.city,
        state: STATE,
        latitude: p.latitude,
        longitude: p.longitude,
        phone: p.phone,
        website: p.website,
        status: 'ACTIVE',
        verificationStatus: 'PENDING',
        publishedAt: new Date(),
        createdById: importer.id,
        isDemo: false,
        categories: { create: [{ categoryId, isPrimary: true }] },
      },
    });
    placesCreated += 1;
  }

  // ── Places a newer snapshot no longer lists ─────────────────────────────────────────────────
  // Removed only while untouched: created by this import, never edited by staff (updatedAt still
  // equals createdAt), and with no reviews, submissions or claims attached.
  const imported = await db.place.findMany({
    where: {
      createdById: importer.id,
      reviews: { none: {} },
      createdFrom: { none: {} },
      claims: { none: {} },
    },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const stale = imported.filter(
    (row) =>
      row.updatedAt.getTime() - row.createdAt.getTime() < 1000 &&
      !places.some((p) => p.name === row.name && distanceMeters(row, p) <= SAME_PLACE_METERS),
  );
  const pruned = await db.place.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });

  // ── College <-> place links (distance CALCULATED from both points, never typed in) ──────────
  const liveColleges = await db.college.findMany({
    where: { isDemo: false, status: 'ACTIVE' },
    select: { id: true, latitude: true, longitude: true, serviceRadiusMeters: true },
  });
  const livePlaces = await db.place.findMany({
    where: { isDemo: false, status: 'ACTIVE' },
    select: { id: true, latitude: true, longitude: true },
  });
  const links = liveColleges.flatMap((college) =>
    livePlaces.flatMap((place) => {
      const meters = Math.round(distanceMeters(college, place));
      return meters <= college.serviceRadiusMeters
        ? [
            {
              collegeId: college.id,
              placeId: place.id,
              distanceMeters: meters,
              mode: 'AUTO' as const,
            },
          ]
        : [];
    }),
  );
  const linked = await db.collegePlace.createMany({ data: links, skipDuplicates: true });

  console.log(
    `\nColleges: ${collegesCreated} added, ${collegesKept} already there` +
      `\nPlaces:   ${placesCreated} added, ${placesKept} already there, ${pruned.count} no longer in the snapshot removed` +
      `\nLinks:    ${linked.count} new college-place links (of ${links.length} within range)` +
      '\n\nAll imported rows are ACTIVE and NOT verified. Sources and licences: prisma/data/ahmednagar/*.json',
  );
} finally {
  await db.$disconnect();
}
