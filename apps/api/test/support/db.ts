import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '../../src/generated/prisma/client.js';
import { AppConfig } from '../../src/infra/config/app-config.js';
import { createMariaDbAdapter } from '../../src/infra/database/mariadb-adapter.js';

export type Tx = Prisma.TransactionClient;

export function createDb(): PrismaClient {
  return new PrismaClient({ adapter: createMariaDbAdapter(AppConfig.fromEnv().databaseUrl) });
}

class Rollback extends Error {
  constructor() {
    super('rollback');
  }
}

/**
 * Runs `work` inside a transaction and ALWAYS rolls it back, returning whatever `work` returned.
 * Tests can therefore create, read and even delete data freely without touching the real rows.
 */
export async function inRollback<T>(db: PrismaClient, work: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await db.$transaction(
      async (tx) => {
        result = await work(tx);
        throw new Rollback();
      },
      { timeout: 80_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result as T;
}

const uid = () => randomUUID().slice(0, 8);

// ── small factories that create valid rows with unique keys ───────────────────────────────────

export function makeUser(tx: Tx, overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  return tx.user.create({
    data: {
      name: 'Test User',
      email: `test-${uid()}@localhost.test`,
      passwordHash: 'not-a-real-hash',
      ...overrides,
    },
  });
}

export function makeCollege(tx: Tx, overrides: Partial<Prisma.CollegeUncheckedCreateInput> = {}) {
  const slug = `test-college-${uid()}`;
  return tx.college.create({
    data: {
      name: `Test College ${slug}`,
      slug,
      address: 'Test address',
      city: 'Ahilyanagar',
      state: 'Maharashtra',
      latitude: 19.096,
      longitude: 74.748,
      isDemo: true,
      ...overrides,
    },
  });
}

export function makeCategory(tx: Tx, overrides: Partial<Prisma.CategoryUncheckedCreateInput> = {}) {
  const slug = `test-category-${uid()}`;
  return tx.category.create({ data: { name: `Test ${slug}`, slug, ...overrides } });
}

export function makePlace(
  tx: Tx,
  createdById: string,
  overrides: Partial<Prisma.PlaceUncheckedCreateInput> = {},
) {
  const slug = `test-place-${uid()}`;
  return tx.place.create({
    data: {
      name: `Test Place ${slug}`,
      slug,
      address: 'Test address',
      city: 'Ahilyanagar',
      state: 'Maharashtra',
      latitude: 19.097,
      longitude: 74.749,
      isDemo: true,
      createdById,
      ...overrides,
    },
  });
}

export function makeBusiness(tx: Tx, ownerId: string) {
  const slug = `test-business-${uid()}`;
  return tx.businessProfile.create({
    data: { ownerId, businessName: `Test Business ${slug}`, slug, isDemo: true },
  });
}
