'use client';

import { useState } from 'react';

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** A clean top for the axis: 1, 2 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].map((m) => m * power).find((m) => m >= value) ?? value) as number;
}

/**
 * One value per day as columns, with the exact number on hover or focus and a screen-reader table.
 * Zero days still draw a hairline so the axis reads as "nothing happened", not "missing".
 */
export function DailyBars({
  days,
  label,
  color = 'bg-primary-500',
}: {
  days: ReadonlyArray<{ day: string; value: number }>;
  label: string;
  color?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...days.map((d) => d.value)));
  const every = days.length > 14 ? Math.ceil(days.length / 7) : 1;

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative flex h-48 items-end gap-1 border-b border-line sm:gap-1.5">
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <div
            key={fraction}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line/70"
            style={{ bottom: `${fraction * 100}%` }}
          />
        ))}
        {days.map((entry, index) => (
          <button
            key={entry.day}
            type="button"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            aria-label={`${shortDay(entry.day)}: ${entry.value}`}
            className="group relative flex h-full flex-1 items-end focus-visible:outline-none"
          >
            <span
              className={`w-full rounded-t-md transition-opacity ${color} ${active !== null && active !== index ? 'opacity-40' : ''}`}
              style={{ height: entry.value === 0 ? '2px' : `${(entry.value / max) * 100}%` }}
            />
            {active === index && (
              <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white shadow">
                {shortDay(entry.day)} · {entry.value}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-1 text-[11px] text-muted sm:gap-1.5">
        {days.map((entry, index) => (
          <span
            key={entry.day}
            className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap"
          >
            {index % every === 0 ? shortDay(entry.day) : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {days.map((entry) => (
            <tr key={entry.day}>
              <th scope="row">{shortDay(entry.day)}</th>
              <td>{entry.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal bars comparing a few totals (calls vs WhatsApp vs directions...). */
export function ShareBars({
  rows,
}: {
  rows: ReadonlyArray<{ label: string; value: number; color: string }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-body">{row.label}</span>
            <span className="font-semibold text-ink">{row.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
            <div
              className={`h-full rounded-full ${row.color}`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "+12% vs previous 30 days", or nothing when there is no earlier period to compare with. */
export function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return null;
  if (before === 0) return <span className="text-xs font-medium text-success-700">New</span>;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span className="text-xs text-muted">No change</span>;
  return (
    <span className={`text-xs font-medium ${change > 0 ? 'text-success-700' : 'text-danger-700'}`}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
    </span>
  );
}
