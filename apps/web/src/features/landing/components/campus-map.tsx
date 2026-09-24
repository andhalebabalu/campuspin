import Link from 'next/link';
import type { IconName } from '@/components/ui/icon';
import { IconChip } from '@/features/landing/components/primitives';
import type { Tone } from '@/features/landing/lib/landing-content';
import { searchHref } from '@/features/search/lib/search-filters';

export interface MapPin {
  label: string;
  icon: IconName;
  tone: Tone;
  /** Leaf category slug the pin links to. */
  slug: string;
  /** Position inside the map, in percent of its width/height. */
  x: number;
  y: number;
}

/** A stylised street map drawn in SVG: blocks, two main roads, a park and a lake. Decorative. */
function MapBackdrop() {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
      aria-hidden="true"
    >
      <rect width="400" height="300" className="fill-primary-50" />
      {/* city blocks */}
      {[
        [10, 10, 80, 60],
        [110, 10, 90, 60],
        [220, 10, 70, 60],
        [310, 10, 80, 60],
        [10, 95, 60, 80],
        [90, 95, 100, 35],
        [90, 140, 100, 35],
        [300, 95, 90, 80],
        [10, 200, 90, 90],
        [120, 200, 70, 90],
        [210, 230, 80, 60],
        [310, 200, 80, 90],
      ].map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="6" className="fill-white" />
      ))}
      {/* park + lake */}
      <rect x="210" y="95" width="70" height="115" rx="10" className="fill-accent-50" />
      <circle cx="232" cy="120" r="7" className="fill-accent-400/25" />
      <circle cx="258" cy="150" r="9" className="fill-accent-400/25" />
      <circle cx="236" cy="182" r="6" className="fill-accent-400/25" />
      <path d="M0 262 Q 40 240 80 262 T 150 270 L150 300 L0 300Z" className="fill-primary-200/60" />
      {/* main roads */}
      <path d="M0 185 C 120 175 250 225 400 188" className="stroke-primary-200" strokeWidth="9" fill="none" />
      <path d="M200 0 C 195 90 205 180 196 300" className="stroke-primary-200" strokeWidth="9" fill="none" />
      <path d="M0 185 C 120 175 250 225 400 188" className="stroke-white" strokeWidth="2" strokeDasharray="6 8" fill="none" />
      <path d="M200 0 C 195 90 205 180 196 300" className="stroke-white" strokeWidth="2" strokeDasharray="6 8" fill="none" />
    </svg>
  );
}

/** The campus itself: a big navy pin in the middle of the map. */
function CampusMarker() {
  return (
    <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
      <span className="absolute top-3 size-24 animate-ping rounded-full bg-primary-400/20 [animation-duration:3s]" />
      <svg viewBox="0 0 48 60" className="relative h-16 w-13 drop-shadow-md" aria-hidden="true">
        <path
          d="M24 58S4 36 4 22a20 20 0 0 1 40 0c0 14-20 36-20 36Z"
          className="fill-primary-800"
        />
        <circle cx="24" cy="22" r="12" className="fill-white" />
        <path d="M16 21l8-4 8 4-8 4-8-4Zm4 2v4c2 1.5 6 1.5 8 0v-4" className="fill-primary-800" />
      </svg>
      <span className="relative mt-1 rounded-full bg-primary-800 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
        Your campus
      </span>
    </div>
  );
}

/**
 * An illustrated campus map with category pins. Every pin is a real link into search for that
 * category, so the illustration doubles as navigation.
 */
export function CampusMap({
  pins,
  className = '',
  college = '',
}: {
  pins: MapPin[];
  className?: string;
  /** Carried into every pin's search link when set. */
  college?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <MapBackdrop />
      <CampusMarker />
      <ul aria-label="Explore by category">
        {pins.map((pin, index) => (
          <li
            key={pin.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          >
            <Link
              href={searchHref({ category: pin.slug, college })}
              className="flex animate-float items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-xs font-semibold text-ink shadow-md ring-1 ring-line transition-transform hover:scale-105 sm:text-sm"
              style={{ animationDelay: `${(index % 4) * -1.5}s` }}
            >
              <IconChip icon={pin.icon} tone={pin.tone} size="sm" className="!rounded-full" />
              {pin.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
