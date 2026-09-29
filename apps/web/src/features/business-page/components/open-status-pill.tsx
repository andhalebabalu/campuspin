'use client';

import type { PlaceDetail } from '@platform/contracts';
import { useSyncExternalStore } from 'react';
import { openStatus } from '../lib/open-status';

/** A minute clock: every subscriber re-renders when the minute changes. */
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
// The server (and a cached page) never claims open or closed: that is decided in the browser.
const noMinute = () => null;

/** "Open now · closes 10 pm" / "Closed · opens 8 am", in India time; nothing if no hours. */
export function OpenStatusPill({ hours }: { hours: PlaceDetail['hours'] }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);
  if (minute === null) return null;
  const status = openStatus(hours, new Date(minute * 60_000));
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        status.open ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${status.open ? 'bg-success-600' : 'bg-danger-600'}`}
        aria-hidden="true"
      />
      {status.label}
    </span>
  );
}

/** Today's row in the weekly hours list, highlighted in the browser only (see above). */
export function useIndiaToday(): number | null {
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);
  if (minute === null) return null;
  const ist = new Date(minute * 60_000 + 330 * 60_000);
  const jsDay = ist.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}
