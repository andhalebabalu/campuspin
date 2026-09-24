import { MAX_RATING, MIN_RATING, type ReviewStatus } from '@platform/contracts';

/**
 * Reviews' business rules, as pure functions with no database and no framework (mirrors
 * `place-rules.ts`), so every one of them is unit-tested directly.
 */

// ── Visibility ───────────────────────────────────────────────────────────────────────────────────

/**
 * Statuses that count: shown publicly and included in a place's rating. `REPORTED` belongs to the
 * Reports phase and is never set yet; when it is, a reported review stays visible until staff act
 * (or the planned auto-hide rule in [02 §5.10](../../docs/02-architecture.md#510-reports-and-moderation)
 * moves it to HIDDEN).
 */
export const VISIBLE_REVIEW_STATUSES = [
  'PUBLISHED',
  'REPORTED',
] as const satisfies readonly ReviewStatus[];

export function isVisible(status: ReviewStatus): boolean {
  return (VISIBLE_REVIEW_STATUSES as readonly ReviewStatus[]).includes(status);
}

/**
 * The author may edit or withdraw a review only while it is visible. A hidden or removed review is
 * under moderation: editing it could sneak changed text past a moderator's decision, and
 * withdrawing it would destroy what the moderator acted on.
 */
export const canAuthorChange = isVisible;

// ── Moderation ───────────────────────────────────────────────────────────────────────────────────

export type ModerationAction = 'hide' | 'restore' | 'remove';

export type ModerationPlan =
  { kind: 'change'; to: ReviewStatus } | { kind: 'noop' } | { kind: 'invalid'; message: string };

/**
 * `hide` is reversible (`restore`); `remove` is final — the row is kept for legal hold and audit but
 * never shown again, and nothing brings it back. Repeating an action is a harmless no-op, exactly
 * like activating an already-active place.
 */
export function planModeration(action: ModerationAction, current: ReviewStatus): ModerationPlan {
  if (current === 'REMOVED') {
    return action === 'remove'
      ? { kind: 'noop' }
      : { kind: 'invalid', message: 'This review was removed. Removal is final.' };
  }
  switch (action) {
    case 'hide':
      return current === 'HIDDEN' ? { kind: 'noop' } : { kind: 'change', to: 'HIDDEN' };
    case 'restore':
      return current === 'PUBLISHED' ? { kind: 'noop' } : { kind: 'change', to: 'PUBLISHED' };
    case 'remove':
      return { kind: 'change', to: 'REMOVED' };
  }
}

// ── Aggregates ───────────────────────────────────────────────────────────────────────────────────

/** Two decimals is plenty for display ("4.25") and keeps float noise out of the stored value. */
export function roundRating(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Always 5 down to 1, zeros included, so a client can draw bars without filling gaps itself. */
export function buildHistogram(
  groups: ReadonlyArray<{ rating: number; count: number }>,
): Array<{ rating: number; count: number }> {
  const counts = new Map(groups.map((group) => [group.rating, group.count]));
  const histogram: Array<{ rating: number; count: number }> = [];
  for (let rating = MAX_RATING; rating >= MIN_RATING; rating -= 1) {
    histogram.push({ rating, count: counts.get(rating) ?? 0 });
  }
  return histogram;
}

// ── Dimensions ───────────────────────────────────────────────────────────────────────────────────

/** Dimension ids the reviewer sent that do not belong to any of the place's categories. */
export function unknownDimensionIds(
  requested: ReadonlyArray<{ dimensionId: string }>,
  allowed: ReadonlySet<string>,
): string[] {
  return requested.map((entry) => entry.dimensionId).filter((id) => !allowed.has(id));
}

// ── Authors ──────────────────────────────────────────────────────────────────────────────────────

/**
 * How a reviewer is shown publicly: first name plus the initial of the last name ("Asha K."), or the
 * single name alone. Never the full surname, email or id — a review names a place, and a student's
 * full name next to "the PG I live in" is more than the public needs to know.
 */
export function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'Student';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const initial = last ? Array.from(last)[0]?.toUpperCase() : undefined;
  return initial ? `${first} ${initial}.` : first;
}
