import { distanceMeters } from '../../src/common/geo/haversine.js';
import { hashPassword } from '../../src/common/security/password-hasher.js';
import type { PriceUnit } from '../../src/generated/prisma/client.js';
import {
  DEMO_COLLEGES,
  DEMO_NOTE,
  DEMO_PLACES,
  type AttributeValue,
  type DemoPlaceSeed,
  type HoursSpec,
} from './data/demo.js';
import { type Db, required } from './db.js';

export interface DemoSeedOptions {
  adminEmail: string;
  adminPassword: string;
}

const CITY = { city: 'Ahilyanagar', state: 'Maharashtra', country: 'India' } as const;
const SAMPLE_ADDRESS = 'Sample address, Ahilyanagar (demo)';

/**
 * Demo data for development. Never runs in production (enforced by the seed entry point).
 * Idempotent: rows that already exist are left alone.
 */
export async function seedDemo(db: Db, options: DemoSeedOptions): Promise<void> {
  const adminId = await ensureDemoAdmin(db, options);
  await seedDemoColleges(db, adminId);
  await seedDemoPlaces(db, adminId);
  await linkDemoPlacesToColleges(db);
}

async function ensureDemoAdmin(
  db: Db,
  { adminEmail, adminPassword }: DemoSeedOptions,
): Promise<string> {
  const email = adminEmail.toLowerCase();
  const superAdmin = await db.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });

  let admin = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!admin) {
    admin = await db.user.create({
      data: {
        name: 'Demo Admin (development only)',
        email,
        // Argon2id. The plain-text password is never stored.
        passwordHash: await hashPassword(adminPassword),
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  }
  await db.userRole.createMany({
    data: [{ userId: admin.id, roleId: superAdmin.id }],
    skipDuplicates: true,
  });
  return admin.id;
}

async function seedDemoColleges(db: Db, adminId: string): Promise<void> {
  for (const college of DEMO_COLLEGES) {
    const exists = await db.college.findUnique({
      where: { slug: college.slug },
      select: { id: true },
    });
    if (exists) continue;
    await db.college.create({
      data: {
        name: college.name,
        slug: college.slug,
        shortName: college.shortName,
        description: `${DEMO_NOTE} A made-up college used to develop the app.`,
        address: SAMPLE_ADDRESS,
        ...CITY,
        latitude: college.latitude,
        longitude: college.longitude,
        status: 'ACTIVE',
        verificationStatus: college.verified ? 'VERIFIED' : 'PENDING',
        isDemo: true,
        createdById: adminId,
        images: {
          create: [
            {
              imageUrl: `https://example.com/demo/${college.slug}.jpg`,
              altText: `${college.name}: placeholder image`,
              sortOrder: 0,
            },
          ],
        },
      },
    });
  }
}

async function seedDemoPlaces(db: Db, adminId: string): Promise<void> {
  const categories = new Map(
    (await db.category.findMany({ select: { id: true, slug: true, defaultPriceUnit: true } })).map(
      (c) => [c.slug, c],
    ),
  );
  const amenityIds = new Map(
    (await db.amenity.findMany({ select: { id: true, key: true } })).map((a) => [a.key, a.id]),
  );
  const attributes = await db.categoryAttribute.findMany({
    select: { id: true, key: true, dataType: true, category: { select: { slug: true } } },
  });

  for (const place of DEMO_PLACES) {
    const exists = await db.place.findUnique({ where: { slug: place.slug }, select: { id: true } });
    if (exists) continue;

    const primary = required(categories, place.categories[0] ?? '', 'category');
    const prices = summarizePrices(place.prices, primary.defaultPriceUnit);
    const status = place.status ?? 'ACTIVE';

    await db.place.create({
      data: {
        name: place.name,
        slug: place.slug,
        description: `${DEMO_NOTE} ${place.blurb}`,
        address: SAMPLE_ADDRESS,
        ...CITY,
        latitude: place.latitude,
        longitude: place.longitude,
        googleMapsUrl: place.withMapsLink
          ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
          : null,
        ...prices,
        status,
        verificationStatus: place.verified ? 'VERIFIED' : 'PENDING',
        lastVerifiedAt: place.verified ? new Date() : null,
        verifiedById: place.verified ? adminId : null,
        publishedAt: status === 'ACTIVE' ? new Date() : null,
        createdById: adminId,
        isDemo: true,
        categories: {
          create: place.categories.map((slug, index) => ({
            categoryId: required(categories, slug, 'category').id,
            isPrimary: index === 0,
          })),
        },
        images: {
          create: [
            {
              imageUrl: `https://example.com/demo/${place.slug}.jpg`,
              altText: `${place.name}: placeholder image`,
              isCover: true,
              sortOrder: 0,
            },
          ],
        },
        amenities: {
          create: place.amenities.map((key) => ({
            amenityId: required(amenityIds, key, 'amenity'),
          })),
        },
        hours: { create: buildHourRows(place.hours) },
        priceOptions: {
          create: place.prices.map((price, index) => ({ ...price, sortOrder: index })),
        },
        attributeValues: { create: buildAttributeRows(place, attributes) },
      },
    });
  }
}

/** Comparable price summary: min/max among options in the category's price unit. */
function summarizePrices(
  prices: DemoPlaceSeed['prices'],
  defaultUnit: PriceUnit | null,
): { priceMin: number | null; priceMax: number | null; priceUnit: PriceUnit | null } {
  const unit = prices.find((p) => p.unit === defaultUnit)?.unit ?? prices[0]?.unit ?? null;
  const amounts = prices.filter((p) => p.unit === unit).map((p) => p.amount);
  if (unit === null || amounts.length === 0) {
    return { priceMin: null, priceMax: null, priceUnit: null };
  }
  return { priceMin: Math.min(...amounts), priceMax: Math.max(...amounts), priceUnit: unit };
}

/** ISO weekdays 1 (Mon) to 7 (Sun). */
function buildHourRows(spec: HoursSpec) {
  if (spec.kind === 'none') return [];
  const rows: Array<{
    dayOfWeek: number;
    openTime?: string;
    closeTime?: string;
    isClosed?: boolean;
    is24Hours?: boolean;
    slotLabel?: string;
    sortOrder: number;
  }> = [];
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    if (spec.kind === 'daily' && spec.closedDays?.includes(dayOfWeek)) {
      rows.push({ dayOfWeek, isClosed: true, sortOrder: 0 });
    } else if (spec.kind === '24h') {
      rows.push({ dayOfWeek, is24Hours: true, sortOrder: 0 });
    } else if (spec.kind === 'daily') {
      rows.push({ dayOfWeek, openTime: spec.open, closeTime: spec.close, sortOrder: 0 });
    } else {
      spec.slots.forEach((slot, sortOrder) =>
        rows.push({
          dayOfWeek,
          openTime: slot.open,
          closeTime: slot.close,
          slotLabel: slot.label,
          sortOrder,
        }),
      );
    }
  }
  return rows;
}

type AttributeDefinition = {
  id: string;
  key: string;
  dataType: string;
  category: { slug: string };
};

/** Stores each value in the column that matches the attribute's data type. */
function buildAttributeRows(place: DemoPlaceSeed, definitions: readonly AttributeDefinition[]) {
  return Object.entries(place.attributes).map(([key, value]) => {
    const definition = place.categories
      .map((slug) => definitions.find((d) => d.category.slug === slug && d.key === key))
      .find((d) => d !== undefined);
    if (!definition) {
      throw new Error(
        `Demo place "${place.slug}" uses attribute "${key}" that none of its categories defines.`,
      );
    }
    return { attributeId: definition.id, ...valueColumns(definition.dataType, value) };
  });
}

function valueColumns(dataType: string, value: AttributeValue) {
  switch (dataType) {
    case 'BOOLEAN':
      return { valueBoolean: Boolean(value) };
    case 'INTEGER':
    case 'DECIMAL':
      return { valueNumber: Number(value) };
    case 'DATE':
      return { valueDate: new Date(`${String(value)}T00:00:00.000Z`) };
    case 'MULTI_ENUM':
      return { valueJson: [...(value as readonly string[])] };
    default:
      return { valueText: String(value) };
  }
}

/**
 * Links every demo place to each demo college whose service radius covers it. The distance is
 * CALCULATED from the two coordinates (Haversine); nothing about distance is typed in.
 */
async function linkDemoPlacesToColleges(db: Db): Promise<void> {
  const colleges = await db.college.findMany({
    where: { isDemo: true },
    select: { id: true, latitude: true, longitude: true, serviceRadiusMeters: true },
  });
  const places = await db.place.findMany({
    where: { isDemo: true },
    select: { id: true, latitude: true, longitude: true },
  });

  const links = colleges.flatMap((college) =>
    places.flatMap((place) => {
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
  await db.collegePlace.createMany({ data: links, skipDuplicates: true });
}
