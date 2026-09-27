'use client';

import { ONLINE_WINDOW_MINUTES } from '@platform/contracts';
import { useState } from 'react';
import { timeAgo } from '@/lib/format/time';

/**
 * "Online now" (with a green dot) for a member active in the last few minutes, otherwise when they
 * were last active, or that they never used an app since this was recorded.
 */
export function LastActive({ at }: { at: string | null }) {
  // The time the list was shown; fine for "5 min ago" and keeps rendering pure.
  const [now] = useState(() => Date.now());
  if (!at) return <span className="text-muted">No activity yet</span>;
  const online = now - new Date(at).getTime() < ONLINE_WINDOW_MINUTES * 60_000;
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success-700">
        <span aria-hidden className="size-2 rounded-full bg-success-600" />
        Online now
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2 rounded-full bg-neutral-300" />
      Active {timeAgo(at, now)}
    </span>
  );
}
