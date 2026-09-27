import type { ListingLimitSettings, ListingQuota } from '@platform/contracts';

/** India Standard Time, UTC+5:30: "this month" means the calendar month in India. */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** The start of this calendar month and of the next, in India, as UTC instants. */
export function monthWindow(now: Date): { start: Date; end: Date } {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - IST_OFFSET_MS),
  };
}

/**
 * What the next listing costs. With limits off, everything is free. Otherwise a free slot is used
 * first, then credits; with neither left the student cannot list.
 */
export function nextCharge(
  settings: ListingLimitSettings,
  freeUsed: number,
  credits: number,
): ListingQuota['next'] {
  if (!settings.enabled) return 'FREE';
  if (freeUsed < settings.freeListings) return 'FREE';
  if (credits >= settings.creditsPerListing) return 'CREDITS';
  return 'BLOCKED';
}

/** The message a student sees when they cannot list. */
export function limitMessage(settings: ListingLimitSettings, credits: number): string {
  const free =
    settings.mode === 'MONTHLY'
      ? `your ${settings.freeListings} free listings this month`
      : `your ${settings.freeListings} free listings (sell or delete one to free a slot)`;
  const cost =
    settings.creditsPerListing === 1 ? '1 credit' : `${settings.creditsPerListing} credits`;
  return `You have used ${free}. Each extra listing costs ${cost}; you have ${Math.max(0, credits)}.`;
}
