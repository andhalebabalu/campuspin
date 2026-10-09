'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { MapNetwork } from '@/components/motion/map-network';
import { CampusMap } from '@/features/landing/components/campus-map';
import { CTA_CLASSES, IconChip } from '@/features/landing/components/primitives';
import { MAP_PINS } from '@/features/landing/lib/landing-content';

const PINS = [...MAP_PINS];
/** The last stretch of the scroll holds the finished map before the page moves on. */
const CONNECT_BY = 0.82;

const REDUCED = '(prefers-reduced-motion: reduce)';
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** 0 when the section's top reaches the navbar, 1 when its bottom leaves the screen. */
function useScrollProgress(ref: React.RefObject<HTMLElement | null>, enabled: boolean): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = ref.current;
      if (!element) return;
      const box = element.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      setProgress(travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [ref, enabled]);
  return progress;
}

/**
 * "Connected campus": as the student scrolls, the map stays put and a line reaches out from the
 * college to each kind of place in turn (hostel, mess, library ...), every pin lighting up as it
 * connects, while the list beside it ticks them off. With reduced motion it is simply the finished
 * map.
 */
export function ConnectedCampusSection() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const scrolled = useScrollProgress(ref, !reduced);
  const progress = reduced ? 1 : Math.min(1, scrolled / CONNECT_BY);

  const steps = PINS.length;
  const done = Math.min(steps, Math.floor(progress * steps + 1e-6));
  const current = Math.min(steps - 1, done);
  const complete = done === steps;
  const step = PINS[current];

  return (
    <section
      ref={ref}
      aria-labelledby="connected-title"
      className={`relative bg-primary-900 text-white ${reduced ? '' : 'h-[260vh] lg:h-[320vh]'}`}
    >
      <div className={`${reduced ? '' : 'sticky top-16 h-[calc(100dvh-4rem)]'} overflow-hidden`}>
        {/* Atmosphere: a faint grid and two glows. */}
        <MapNetwork tone="dark" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)] bg-[size:48px_48px]" />
          <div className="absolute -top-40 right-0 size-[34rem] animate-blob rounded-full bg-primary-500/25 blur-3xl" />
          <div className="absolute -bottom-40 left-0 size-[30rem] animate-blob rounded-full bg-accent-400/15 blur-3xl [animation-delay:-9s]" />
        </div>

        <div className="relative mx-auto grid h-full w-full max-w-6xl items-center gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-8">
          <div className="flex flex-col gap-5 lg:gap-7">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-bold tracking-[0.18em] text-accent-50/80 uppercase">
                Connected campus
              </p>
              <h2
                id="connected-title"
                className="text-3xl leading-tight font-extrabold sm:text-4xl lg:text-5xl"
              >
                Everything around your campus,{' '}
                <span className="bg-linear-to-r from-primary-300 to-accent-400 bg-clip-text text-transparent">
                  connected.
                </span>
              </h2>
              <p className="hidden max-w-md text-primary-200 sm:block">
                Pick your college and every place a student needs links to it, with the real
                distance from your gate. Keep scrolling and watch your campus come together.
              </p>
            </div>

            {/* Desktop: the full list, ticking off as each place connects. */}
            <ol className="hidden grid-cols-2 gap-2 lg:grid">
              {PINS.map((pin, index) => {
                const state = index < done ? 'done' : index === current ? 'current' : 'next';
                return (
                  <li
                    key={pin.label}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500 ${
                      state === 'done'
                        ? 'border-white/15 bg-white/10'
                        : state === 'current'
                          ? 'border-primary-300/60 bg-white/[0.14] shadow-[0_0_0_4px_rgb(80_155_246/0.15)]'
                          : 'border-white/5 bg-white/[0.03] opacity-50'
                    }`}
                  >
                    <IconChip icon={pin.icon} tone={pin.tone} size="sm" className="!rounded-full" />
                    <span className="flex-1 text-sm font-semibold">{pin.label}</span>
                    <span
                      className={`flex size-5 items-center justify-center rounded-full transition-all duration-500 ${
                        state === 'done'
                          ? 'scale-100 bg-accent-400 text-white'
                          : 'scale-75 bg-white/10'
                      }`}
                    >
                      {state === 'done' && <Icon name="check" className="size-3" />}
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* Phones: just the place connecting now. */}
            {step && (
              <div
                key={step.label}
                className="flex animate-fade-up items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 lg:hidden"
              >
                <IconChip icon={step.icon} tone={step.tone} />
                <span className="flex flex-col">
                  <span className="text-sm font-bold">
                    {complete ? 'All connected' : step.label}
                  </span>
                  <span className="text-xs text-primary-200">
                    {complete ? 'Every place around your campus, one tap away.' : step.hint}
                  </span>
                </span>
              </div>
            )}

            {/* Progress. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold text-primary-200">
                <span>
                  {done} of {steps} connected
                </span>
                {complete && (
                  <span className="flex animate-fade-up items-center gap-1 text-accent-50">
                    <Icon name="check" className="size-3.5" /> Campus ready
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-primary-400 to-accent-400 transition-[width] duration-200 ease-out"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>

            <div
              className={`transition-all duration-700 ${
                complete
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-3 opacity-0'
              }`}
            >
              <Link
                href={ROUTES.colleges}
                className={`${CTA_CLASSES} w-fit`}
                tabIndex={complete ? 0 : -1}
              >
                Find your campus
                <Icon name="arrowRight" className="size-4" />
              </Link>
            </div>
          </div>

          <div className="relative order-first lg:order-none">
            <div
              aria-hidden="true"
              className="absolute -inset-4 -z-0 rounded-[36px] bg-linear-to-br from-primary-400/40 to-accent-400/30 opacity-60 blur-2xl"
            />
            <CampusMap
              pins={PINS}
              progress={progress}
              tilt
              className="relative aspect-[4/3] w-full rounded-[28px] shadow-2xl ring-1 ring-white/20"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
