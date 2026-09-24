import { Prisma } from '../../generated/prisma/client.js';
import { VISIBLE_REVIEW_STATUSES } from './review-rules.js';

const VISIBLE = Prisma.join([...VISIBLE_REVIEW_STATUSES]);

/**
 * Keeping `places.ratingAverage` / `ratingCount` right under concurrency.
 *
 * Every review write (create, edit, withdraw, hide, restore, remove) runs in one transaction that
 * FIRST locks the place row, then changes the review, then recomputes the place's summary from the
 * reviews themselves. The lock serialises all review writes for one place, so two students posting
 * at the same moment cannot each compute a count that misses the other's review — the second simply
 * waits for the first to commit. Recomputing (instead of incrementing) makes the stored value
 * self-healing: any drift is corrected by the next write.
 */

/**
 * Locks the place row for the rest of the transaction and returns its status, or null if there is
 * no such place. Must be the transaction's first statement.
 */
export async function lockPlace(
  tx: Prisma.TransactionClient,
  placeId: string,
): Promise<{ status: string } | null> {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM places WHERE id = ${placeId} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Recomputes the place's rating from its visible (PUBLISHED or REPORTED) reviews, rounded to two
 * decimals, and returns it. Raw SQL on purpose: the subqueries read the latest committed reviews
 * (not the transaction's older snapshot), and it leaves `places.updatedAt` alone — a new review is
 * not an edit of the listing. Call only after `lockPlace` in the same transaction.
 */
export async function refreshPlaceRating(
  tx: Prisma.TransactionClient,
  placeId: string,
): Promise<{ ratingAverage: number; ratingCount: number }> {
  await tx.$executeRaw`
    UPDATE places SET
      ratingAverage = COALESCE((
        SELECT ROUND(AVG(r.rating), 2) FROM reviews r
        WHERE r.placeId = ${placeId} AND r.status IN (${VISIBLE})
      ), 0),
      ratingCount = (
        SELECT COUNT(*) FROM reviews r
        WHERE r.placeId = ${placeId} AND r.status IN (${VISIBLE})
      )
    WHERE id = ${placeId}`;
  return tx.place.findUniqueOrThrow({
    where: { id: placeId },
    select: { ratingAverage: true, ratingCount: true },
  });
}
