import type { BookingStatus } from '@platform/contracts';

const IST_OFFSET_MIN = 330;

export interface Window {
  openTime: string;
  closeTime: string;
}

export interface SlotTime {
  startAt: Date;
  endAt: Date;
}

const minutesOf = (time: string): number => {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/** The instant "HH:mm on this India date" happens. */
export function istInstant(day: Date, minuteOfDay: number): Date {
  return new Date(day.getTime() + (minuteOfDay - IST_OFFSET_MIN) * 60_000);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a DATE value. */
export const isoWeekday = (day: Date): number => ((day.getUTCDay() + 6) % 7) + 1;

/**
 * The bookable slots of one India day from its opening windows. With a slot length, slots run back
 * to back and must end by closing time; without one (a study seat for the day) the day is one slot
 * from the first opening to the last closing. Slots that already started are left out.
 */
export function slotsFor(
  day: Date,
  windows: readonly Window[],
  durationMinutes: number | null,
  now: Date,
): SlotTime[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => minutesOf(a.openTime) - minutesOf(b.openTime));
  const slots: SlotTime[] = [];
  if (durationMinutes === null) {
    const open = Math.min(...sorted.map((w) => minutesOf(w.openTime)));
    const close = Math.max(...sorted.map((w) => minutesOf(w.closeTime)));
    slots.push({ startAt: istInstant(day, open), endAt: istInstant(day, close) });
  } else {
    for (const window of sorted) {
      const close = minutesOf(window.closeTime);
      for (
        let start = minutesOf(window.openTime);
        start + durationMinutes <= close;
        start += durationMinutes
      ) {
        slots.push({
          startAt: istInstant(day, start),
          endAt: istInstant(day, start + durationMinutes),
        });
      }
    }
  }
  // A whole-day slot stays bookable until the place closes; timed slots until they start.
  return slots.filter((slot) => (durationMinutes === null ? slot.endAt > now : slot.startAt > now));
}

/** Business moves per status. */
const MOVES: Partial<Record<BookingStatus, readonly BookingStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
};

export const bookingMoves = (from: BookingStatus): readonly BookingStatus[] => MOVES[from] ?? [];

export const isLive = (status: BookingStatus): boolean =>
  status === 'PENDING' || status === 'CONFIRMED';

/** A student may cancel a live booking until it starts. */
export const studentCanCancel = (status: BookingStatus, startAt: Date, now: Date): boolean =>
  isLive(status) && startAt > now;

export const slotKeyOf = (itemId: string, startAt: Date, seat: number) =>
  `${itemId}|${startAt.toISOString()}|${seat}`;
export const studentKeyOf = (userId: string, itemId: string, startAt: Date) =>
  `${userId}|${itemId}|${startAt.toISOString()}`;
