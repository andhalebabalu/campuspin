import type { PlaceDetail } from '@platform/contracts';

type Hour = PlaceDetail['hours'][number];

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** The India day of week (1 = Monday ... 7 = Sunday) and minutes since midnight of an instant. */
export function indiaClock(now: Date): { day: number; minutes: number } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const jsDay = ist.getUTCDay(); // 0 = Sunday
  return { day: jsDay === 0 ? 7 : jsDay, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

const toMinutes = (time: string | null): number | null => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)
    ? null
    : h * 60 + m;
};

/** "8 am", "10:30 pm". */
export function formatTime(time: string | null): string {
  const minutes = toMinutes(time);
  if (minutes === null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function hoursText(hour: Hour): string {
  if (hour.isClosed) return 'Closed';
  if (hour.is24Hours) return 'Open 24 hours';
  const slot = hour.slotLabel ? `${hour.slotLabel}: ` : '';
  return `${slot}${formatTime(hour.openTime)} – ${formatTime(hour.closeTime)}`;
}

/** Is `minutes` inside this row on its own day? Handles a close after midnight (e.g. 18:00-02:00). */
function openAt(hour: Hour, minutes: number): boolean {
  if (hour.isClosed) return false;
  if (hour.is24Hours) return true;
  const open = toMinutes(hour.openTime);
  const close = toMinutes(hour.closeTime);
  if (open === null || close === null) return false;
  return close > open ? minutes >= open && minutes < close : minutes >= open;
}

/** Still open from yesterday's row that closes after midnight? */
function openFromYesterday(hour: Hour, minutes: number): boolean {
  if (hour.isClosed || hour.is24Hours) return false;
  const open = toMinutes(hour.openTime);
  const close = toMinutes(hour.closeTime);
  return open !== null && close !== null && close <= open && minutes < close;
}

export interface OpenStatus {
  open: boolean;
  /** "Open now · closes 10 pm", "Closed · opens 8 am", "Open 24 hours". */
  label: string;
}

/**
 * Open or closed right now, in India time, from the place's weekly hours. Null when the place has
 * published no hours: then the page says nothing rather than guessing.
 */
export function openStatus(hours: readonly Hour[], now: Date): OpenStatus | null {
  if (hours.length === 0) return null;
  const { day, minutes } = indiaClock(now);
  const today = hours.filter((hour) => hour.dayOfWeek === day);
  const yesterday = hours.filter((hour) => hour.dayOfWeek === (day === 1 ? 7 : day - 1));

  const current =
    today.find((hour) => openAt(hour, minutes)) ??
    yesterday.find((hour) => openFromYesterday(hour, minutes));
  if (current) {
    if (current.is24Hours) return { open: true, label: 'Open 24 hours' };
    return { open: true, label: `Open now · closes ${formatTime(current.closeTime)}` };
  }

  const laterToday = today
    .filter(
      (hour) => !hour.isClosed && !hour.is24Hours && (toMinutes(hour.openTime) ?? -1) > minutes,
    )
    .sort((a, b) => (toMinutes(a.openTime) ?? 0) - (toMinutes(b.openTime) ?? 0))[0];
  if (laterToday)
    return { open: false, label: `Closed · opens ${formatTime(laterToday.openTime)}` };

  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const nextDay = ((day - 1 + ahead) % 7) + 1;
    const next = hours
      .filter((hour) => hour.dayOfWeek === nextDay && !hour.isClosed)
      .sort((a, b) => (toMinutes(a.openTime) ?? 0) - (toMinutes(b.openTime) ?? 0))[0];
    if (next) {
      const when = ahead === 1 ? 'tomorrow' : DAY_NAMES[nextDay - 1];
      return {
        open: false,
        label: next.is24Hours
          ? `Closed · opens ${when}`
          : `Closed · opens ${when} ${formatTime(next.openTime)}`,
      };
    }
  }
  return { open: false, label: 'Closed' };
}
