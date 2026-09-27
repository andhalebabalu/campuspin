'use client';

import type { ActivityDay } from '@platform/contracts';
import { useState } from 'react';

/** Two series of the same unit (people per day) on one axis. Colours validated for CVD. */
const SERIES = [
  { key: 'visitors', label: 'Visitors', color: '#0b63cf' },
  { key: 'activeUsers', label: 'Active members', color: '#1f7a2e' },
] as const;

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** A clean top for the y axis: 1, 2 or 5 times a power of ten, with 4 ticks. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const raw = value / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((m) => m >= raw) ?? raw;
  return step * 4;
}

/**
 * Daily visitors and active members over the last 30 days: two 2px lines, a light wash under
 * visitors, a crosshair tooltip on hover, and a table view for exact numbers.
 */
export function ActivityChart({ days }: { days: ActivityDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = niceMax(Math.max(0, ...days.map((d) => Math.max(d.visitors, d.activeUsers))));
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (days.length <= 1 ? 0 : (index / (days.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
  const path = (key: 'visitors' | 'activeUsers') =>
    days
      .map(
        (day, index) =>
          `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(day[key]).toFixed(1)}`,
      )
      .join(' ');
  const area = `${path('visitors')} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, 1, 2, 3, 4].map((step) => (max / 4) * step);
  const hovered = hover !== null ? days[hover] : null;

  function onMove(event: React.MouseEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1)))));
  }

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4 text-sm text-body" aria-label="Legend">
          {SERIES.map((series) => (
            <li key={series.key} className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((value) => !value)}
          className="text-sm font-medium text-action hover:text-action-hover"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-subtle text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Visitors</th>
                <th className="px-3 py-2 text-right font-medium">Web</th>
                <th className="px-3 py-2 text-right font-medium">Mobile</th>
                <th className="px-3 py-2 text-right font-medium">Active members</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.day} className="border-t border-line text-ink">
                  <td className="px-3 py-1.5">{dayLabel(day.day)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{day.visitors}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{day.webVisitors}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{day.mobileVisitors}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{day.activeUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Daily visitors and active members, last 30 days"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="#ebeef3"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#6b7589"
                >
                  {tick.toLocaleString('en-IN')}
                </text>
              </g>
            ))}
            {days.map((day, index) =>
              index % 5 === 0 || index === days.length - 1 ? (
                <text
                  key={day.day}
                  x={x(index)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#6b7589"
                >
                  {dayLabel(day.day)}
                </text>
              ) : null,
            )}
            <path d={area} fill={SERIES[0].color} opacity={0.1} />
            {SERIES.map((series) => (
              <path
                key={series.key}
                d={path(series.key)}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {hover !== null && hovered && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke="#c4cbd8"
                  strokeWidth={1}
                />
                {SERIES.map((series) => (
                  <circle
                    key={series.key}
                    cx={x(hover)}
                    cy={y(hovered[series.key])}
                    r={4}
                    fill={series.color}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
          {hover !== null && hovered && (
            <div
              className="pointer-events-none absolute top-2 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-md"
              style={{
                left: `${(x(hover) / WIDTH) * 100}%`,
                transform:
                  hover > days.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
              }}
            >
              <p className="mb-1 font-semibold text-ink">{dayLabel(hovered.day)}</p>
              {SERIES.map((series) => (
                <p key={series.key} className="flex items-center gap-2 text-body">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ backgroundColor: series.color }}
                  />
                  {series.label}:{' '}
                  <span className="font-medium text-ink tabular-nums">{hovered[series.key]}</span>
                </p>
              ))}
              <p className="mt-1 text-muted">
                Web {hovered.webVisitors} · Mobile {hovered.mobileVisitors}
              </p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
