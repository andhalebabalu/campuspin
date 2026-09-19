import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

/** The seed works with a normal client or inside a transaction (the tests roll everything back). */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Looks a key up in a map built from the database, failing loudly if seed data is inconsistent. */
export function required<T>(map: ReadonlyMap<string, T>, key: string, what: string): T {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Seed data refers to an unknown ${what}: "${key}".`);
  }
  return value;
}
