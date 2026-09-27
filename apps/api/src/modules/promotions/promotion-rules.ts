import type { AdminPromotion, PromotionAudience } from '@platform/contracts';

/**
 * Which audiences a member belongs to. A business owner sees business promotions, a student sees
 * student ones, and everyone signed in or not sees "ALL". Staff accounts have no student or
 * business app, so they only match "ALL".
 */
export function audiencesFor(roles: readonly string[] | null): PromotionAudience[] {
  const audiences: PromotionAudience[] = ['ALL'];
  if (roles?.includes('STUDENT')) audiences.push('STUDENTS');
  if (roles?.includes('BUSINESS_OWNER')) audiences.push('BUSINESSES');
  return audiences;
}

/** Where a promotion stands right now, for the admin list. */
export function promotionState(
  promotion: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): AdminPromotion['state'] {
  if (!promotion.active) return 'PAUSED';
  if (promotion.endsAt && promotion.endsAt <= now) return 'ENDED';
  if (promotion.startsAt && promotion.startsAt > now) return 'SCHEDULED';
  return 'LIVE';
}

/** The close button can never come after the ad ends; a stored pair is clamped, not trusted. */
export function skipAfter(displaySeconds: number, skipAfterSeconds: number): number {
  return Math.max(0, Math.min(skipAfterSeconds, displaySeconds));
}
