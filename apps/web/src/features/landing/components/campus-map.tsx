'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  /** One line shown when the pin is hovered or connected. */
  hint?: string;
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
      <rect x="210" y="95" width="70" height="115" rx="10" className="fill-accent-50" />
      <circle cx="232" cy="120" r="7" className="fill-accent-400/25" />
      <circle cx="258" cy="150" r="9" className="fill-accent-400/25" />
      <circle cx="236" cy="182" r="6" className="fill-accent-400/25" />
      <path d="M0 262 Q 40 240 80 262 T 150 270 L150 300 L0 300Z" className="fill-primary-200/60" />
      {['M0 185 C 120 175 250 225 400 188', 'M200 0 C 195 90 205 180 196 300'].map((d) => (
        <g key={d}>
          <path d={d} className="stroke-primary-200" strokeWidth="9" fill="none" />
          <path d={d} className="stroke-white" strokeWidth="2" strokeDasharray="6 8" fill="none" />
        </g>
      ))}
    </svg>
  );
}

/** The campus itself: a big navy pin in the middle of the map, its tip on the exact centre. */
function CampusMarker({ complete }: { complete: boolean }) {
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center">
      <span
        className={`absolute top-3 size-24 animate-ping rounded-full [animation-duration:3s] ${
          complete ? 'bg-accent-400/30' : 'bg-primary-400/20'
        }`}
      />
      <svg viewBox="0 0 48 60" className="relative h-16 w-13 drop-shadow-lg" aria-hidden="true">
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

/** A gentle arc from the campus to a pin (bending to one side, like a flight path). */
function arc(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = 0.18;
  return `M${from.x} ${from.y} Q${mx - dy * bend} ${my + dx * bend} ${to.x} ${to.y}`;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export interface CampusMapProps {
  pins: MapPin[];
  className?: string;
  /** Carried into every pin's search link when set. */
  college?: string;
  /** Pins pop onto the map one after another, and the lines draw in after them (the hero). */
  animated?: boolean;
  /**
   * Scroll-driven: 0 = nothing connected, 1 = every pin connected; pins connect one after another
   * in between. Without it, every line is drawn (once, on load when `animated`).
   */
  progress?: number;
  /** Tilt towards the cursor, with a light following it. */
  tilt?: boolean;
}

/**
 * An illustrated campus map: the college in the middle, a line from it to every kind of place
 * around it. Every pin is a real link into search for that category, so the illustration doubles
 * as navigation. Hovering a pin lights its line up and says what is there.
 */
export function CampusMap({
  pins,
  className = '',
  college = '',
  animated = false,
  progress,
  tilt = false,
}: CampusMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pose, setPose] = useState<{ rx: number; ry: number; lx: number; ly: number } | null>(null);

  // Lines are drawn in pixels, so they stay round and crisp at any size.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setSize({ w: box.clientWidth, h: box.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const steps = pins.length;
  /** How much of pin i's line is drawn (0..1). */
  const drawn = (index: number) => (progress === undefined ? 1 : clamp01(progress * steps - index));
  const connected = (index: number) => drawn(index) >= 1;
  const complete = pins.every((_, index) => connected(index));

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!tilt || event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width;
    const py = (event.clientY - box.top) / box.height;
    setPose({ rx: (0.5 - py) * 8, ry: (px - 0.5) * 10, lx: px * 100, ly: py * 100 });
  }

  const tiltStyle: CSSProperties | undefined = tilt
    ? {
        transform: pose
          ? `perspective(1200px) rotateX(${pose.rx}deg) rotateY(${pose.ry}deg)`
          : 'perspective(1200px)',
        transition: pose ? 'transform 120ms ease-out' : 'transform 600ms var(--ease-out-soft)',
      }
    : undefined;

  const center = size ? { x: size.w / 2, y: size.h / 2 } : null;

  return (
    <div
      ref={boxRef}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setPose(null)}
      style={tiltStyle}
      className={`relative overflow-hidden [transform-style:preserve-3d] ${className}`}
    >
      <MapBackdrop />

      {/* The light that follows the cursor. */}
      {tilt && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-500"
          style={{
            opacity: pose ? 1 : 0,
            background: pose
              ? `radial-gradient(420px circle at ${pose.lx}% ${pose.ly}%, rgb(255 255 255 / 0.35), transparent 60%)`
              : undefined,
          }}
        />
      )}

      {/* Connections from the campus to every pin. */}
      {size && center && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <defs>
            <linearGradient id="campus-link" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-600)" />
              <stop offset="100%" stopColor="var(--color-accent-400)" />
            </linearGradient>
          </defs>
          {pins.map((pin, index) => {
            const d = arc(center, { x: (pin.x / 100) * size.w, y: (pin.y / 100) * size.h });
            const amount = drawn(index);
            const active = hovered === index;
            const intro = animated && progress === undefined;
            return (
              <g key={pin.label}>
                {/* The line itself, drawn from the campus outwards. */}
                <path
                  d={d}
                  pathLength={100}
                  fill="none"
                  stroke="url(#campus-link)"
                  strokeLinecap="round"
                  strokeWidth={active ? 3.5 : 2}
                  strokeDasharray="100"
                  strokeDashoffset={100 - amount * 100}
                  className={intro ? 'animate-draw-line' : undefined}
                  style={{
                    opacity: hovered === null ? 0.55 : active ? 1 : 0.18,
                    transition:
                      progress === undefined
                        ? 'opacity 300ms, stroke-width 300ms'
                        : 'opacity 300ms, stroke-width 300ms, stroke-dashoffset 120ms linear',
                    animationDelay: intro ? `${1300 + index * 120}ms` : undefined,
                  }}
                />
                {/* A light travelling along a connected line. */}
                {amount >= 1 && (
                  <path
                    d={d}
                    pathLength={100}
                    fill="none"
                    stroke="white"
                    strokeLinecap="round"
                    strokeWidth={active ? 4 : 3}
                    strokeDasharray="3 97"
                    className="animate-travel"
                    style={{
                      opacity: hovered === null || active ? 0.95 : 0.2,
                      animationDelay: `${index * -0.35}s`,
                      filter: 'drop-shadow(0 0 3px var(--color-primary-400))',
                    }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      )}

      <CampusMarker complete={complete && progress !== undefined} />

      <ul aria-label="Explore by category">
        {pins.map((pin, index) => {
          const on = connected(index);
          const active = hovered === index;
          return (
            <li
              key={pin.label}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            >
              <span
                className={`block ${animated ? 'animate-pop' : ''}`}
                style={animated ? { animationDelay: `${500 + index * 110}ms` } : undefined}
              >
                <Link
                  href={searchHref({ category: pin.slug, college })}
                  onPointerEnter={() => setHovered(index)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  className={`relative flex animate-float items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 text-xs font-semibold text-ink ring-1 transition-[scale,box-shadow,opacity,filter] duration-500 sm:text-sm ${
                    on ? 'shadow-md ring-line' : 'opacity-50 shadow-sm ring-line/60 grayscale-[60%]'
                  } ${
                    active
                      ? 'z-20 scale-110 shadow-[0_10px_30px_-8px_rgb(11_99_207/0.45)] ring-primary-300'
                      : ''
                  } ${on && progress !== undefined ? 'ring-primary-200' : ''}`}
                  style={{ animationDelay: `${(index % 4) * -1.5}s` }}
                >
                  {/* A soft halo once connected. */}
                  {on && progress !== undefined && (
                    <span
                      aria-hidden="true"
                      className="absolute -inset-1 -z-10 animate-pop rounded-full bg-primary-400/15 blur-sm"
                    />
                  )}
                  <IconChip icon={pin.icon} tone={pin.tone} size="sm" className="!rounded-full" />
                  {pin.label}
                </Link>
                {/* What is there, on hover. */}
                {pin.hint && active && (
                  <span
                    role="tooltip"
                    className="absolute top-full left-1/2 z-30 mt-2 w-max max-w-48 -translate-x-1/2 animate-fade-down rounded-lg bg-ink-900/90 px-3 py-1.5 text-center text-[11px] leading-snug font-medium text-white shadow-lg backdrop-blur"
                  >
                    {pin.hint}
                    <span className="mt-0.5 block text-[10px] font-semibold text-accent-50/80">
                      Tap to see them →
                    </span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
