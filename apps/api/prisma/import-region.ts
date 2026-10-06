/**
 * Imports the REAL college and nearby-place data of one district in `prisma/data/<region>/`:
 *
 *   npm run db:import:ahmednagar        (tsx prisma/import-region.ts ahmednagar)
 *   npm run db:import:pune              (tsx prisma/import-region.ts pune)
 *
 * - colleges.json: every college in the Directorate of Higher Education's aided and non-aided lists
 *   and the State CET Cell's institute lists for the district (Pune adds the OpenStreetMap colleges
 *   and universities those lists do not carry).
 * - places.json: named OpenStreetMap features (© OpenStreetMap contributors, ODbL) near those
 *   colleges — eateries, stationery and xerox shops, medical stores, hostels, grocery, bus stands, ...
 *
 * Everything is published (ACTIVE) but NOT verified: the verified badge stays off until staff check
 * a row. Nothing is invented — no prices, hours or phone numbers beyond what the sources hold — and
 * every description says where the row came from and how exact its map location is.
 *
 * Safe to run repeatedly: a college is matched by its slug, a place by name + location, and rows
 * staff have edited are left alone. Unlike the demo seed, it is allowed in production: this is real
 * data (`isDemo` is false).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

interface Region {
  label: string;
  /**
   * How far from a new college its places are linked. In a city like Pune a college has hundreds of
   * shops within the default 5 km, so "near campus" is kept to walking distance there.
   */
  serviceRadiusMeters?: number;
}

const REGIONS: Readonly<Record<string, Region>> = {
  ahmednagar: { label: 'Ahmednagar (Ahilyanagar) district' },
  pune: { label: 'Pune district', serviceRadiusMeters: 2000 },
};

const DATA_ROOT = new URL('./data/', import.meta.url);
const STATE = 'Maharashtra';
/** The account every imported place is "created by" (a place must have a creator). It cannot sign in. */
const IMPORT_ACCOUNT = { email: 'data-import@campuspin.invalid', name: 'CampusPin data import' };
/** Two rows with the same name this close together are the same place. */
const SAME_PLACE_METERS = 60;
/** Rows per INSERT when linking colleges to places (a city import makes tens of thousands). */
const LINK_BATCH = 5000;

function load<T>(region: string, file: string): T[] {
  const url = new URL(`${region}/${file}`, DATA_ROOT);
  return existsSync(url) ? (JSON.parse(readFileSync(url, 'utf8')) as { items: T[] }).items : [];
}

function collegeDescription(c: CollegeRow): string {
  const lines = [
    c.courses?.length ? `Courses: ${c.courses.join(', ')}.` : null,
    c.university ? `Affiliated to ${c.university}.` : null,
    c.kind ? `Type: ${c.kind}.` : null,
    c.source.startsWith('OpenStreetMap')
      ? `Listed from ${c.source} (${c.sourceUrl}).`
      : `Listed from the official ${c.source} (${c.sourceUrl}).`,
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

/** Still exactly as an import wrote it: staff have not saved it since. */
const untouched = (row: { createdAt: Date; updatedAt: Date }) =>
  row.updatedAt.getTime() - row.createdAt.getTime() < 1000;

const regionKey = process.argv[2];
const region = regionKey ? REGIONS[regionKey] : undefined;
if (!regionKey || !region) {
  console.error(`Usage: tsx prisma/import-region.ts <${Object.keys(REGIONS).join('|')}>`);
  process.exit(1);
}

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
  const colleges = load<CollegeRow>(regionKey, 'colleges.json');
  const places = load<PlaceRow>(regionKey, 'places.json');
  console.log(`Importing ${region.label} data into ${config.databaseTarget} ...`);

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
  let collegesCorrected = 0;
  for (const c of colleges) {
    const root = slugRoot(c.name, {
      reservedWords: RESERVED_COLLEGE_SLUGS,
      fallback: 'college',
    })
      .slice(0, 110)
      .replace(/-+$/, '');
    const description = collegeDescription(c);
    const existing = await db.college.findFirst({
      where: { OR: [{ slug: root }, { name: c.name, city: c.city }] },
      select: { id: true, description: true, createdAt: true, updatedAt: true, isDemo: true },
    });
    if (existing) {
      collegesKept += 1;
      // A corrected snapshot (a better description) reaches rows nobody has edited since import.
      if (!existing.isDemo && untouched(existing) && existing.description !== description) {
        await db.college.update({
          where: { id: existing.id },
          // Keep updatedAt = createdAt so the row still counts as untouched by staff.
          data: { description, updatedAt: existing.createdAt },
        });
        collegesCorrected += 1;
      }
      continue;
    }
    const slug = pickFreeSlug(root, collegeSlugs);
    collegeSlugs.add(slug);
    await db.college.create({
      data: {
        name: c.name,
        slug,
        description,
        address: c.address,
        city: c.city,
        state: STATE,
        latitude: c.latitude,
        longitude: c.longitude,
        ...(region.serviceRadiusMeters ? { serviceRadiusMeters: region.serviceRadiusMeters } : {}),
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

  // ── Places no region's snapshot lists any more ──────────────────────────────────────────────
  // Every region shares the import account, so a place is stale only when NO region lists it.
  // Removed only while untouched (never edited by staff) and with no reviews, submissions or
  // claims attached.
  const listed = readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => load<PlaceRow>(entry.name, 'places.json'));
  const listedByName = new Map<string, PlaceRow[]>();
  for (const p of listed) listedByName.set(p.name, [...(listedByName.get(p.name) ?? []), p]);
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
      untouched(row) &&
      !(listedByName.get(row.name) ?? []).some((p) => distanceMeters(row, p) <= SAME_PLACE_METERS),
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
  let linked = 0;
  for (let i = 0; i < links.length; i += LINK_BATCH) {
    const batch = await db.collegePlace.createMany({
      data: links.slice(i, i + LINK_BATCH),
      skipDuplicates: true,
    });
    linked += batch.count;
  }

  console.log(
    `\nColleges: ${collegesCreated} added, ${collegesKept} already there (${collegesCorrected} descriptions corrected)` +
      `\nPlaces:   ${placesCreated} added, ${placesKept} already there, ${pruned.count} no longer in any snapshot removed` +
      `\nLinks:    ${linked} new college-place links (of ${links.length} within range)` +
      `\n\nAll imported rows are ACTIVE and NOT verified. Sources and licences: prisma/data/${regionKey}/*.json`,
  );
} finally {
  await db.$disconnect();
}
