import type { CollegeCard } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { CountUp } from '@/components/motion/count-up';
import { ROUTES } from '@/constants/routes';
import { CampusMap, type MapPin } from '@/features/landing/components/campus-map';
import { CampusSearch } from '@/features/landing/components/campus-search';
import {
  Container,
  CTA_CLASSES,
  CTA_OUTLINE_CLASSES,
} from '@/features/landing/components/primitives';

const HERO_PINS: MapPin[] = [
  { label: 'Hostel', icon: 'building', tone: 'blue', slug: 'hostels', x: 22, y: 14 },
  { label: 'Mess', icon: 'utensils', tone: 'amber', slug: 'mess', x: 52, y: 10 },
  { label: 'Library', icon: 'book', tone: 'teal', slug: 'libraries', x: 80, y: 20 },
  { label: 'Gym', icon: 'dumbbell', tone: 'violet', slug: 'gyms', x: 86, y: 44 },
  { label: 'Cafe', icon: 'coffee', tone: 'rose', slug: 'cafes', x: 16, y: 44 },
  { label: 'Medical', icon: 'medical', tone: 'rose', slug: 'medical', x: 78, y: 70 },
  { label: 'Xerox', icon: 'printer', tone: 'blue', slug: 'xerox', x: 24, y: 76 },
  { label: 'PG', icon: 'bed', tone: 'violet', slug: 'pg', x: 52, y: 88 },
];

export interface HeroStats {
  colleges: number | null;
  places: number | null;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl font-extrabold text-primary-800">
        <CountUp value={value} />
        <span className="text-accent-600">+</span>
      </span>
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
    </div>
  );
}

/** Soft colour fields drifting behind the hero. Decorative. */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 -left-24 size-[28rem] animate-blob rounded-full bg-primary-200/50 blur-3xl" />
      <div className="absolute top-20 -right-24 size-[26rem] animate-blob rounded-full bg-accent-400/15 blur-3xl [animation-delay:-6s]" />
      <div className="absolute bottom-0 left-1/3 size-[22rem] animate-blob rounded-full bg-violet-50 blur-3xl [animation-delay:-12s]" />
      {/* A faint dot grid that fades out towards the edges. */}
      <div className="absolute inset-0 bg-[radial-gradient(var(--color-primary-200)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)] bg-[size:22px_22px] opacity-60" />
    </div>
  );
}

export function HeroSection({ colleges, stats }: { colleges: CollegeCard[]; stats: HeroStats }) {
  const live = stats.colleges !== null && stats.places !== null && stats.places > 0;
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-linear-to-b from-primary-50/80 via-surface to-canvas"
    >
      <HeroBackdrop />
      <Container className="grid items-center gap-12 pt-12 pb-10 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="flex min-w-0 flex-col gap-6">
          <span className="inline-flex w-fit animate-fade-up items-center gap-2 rounded-full border border-primary-200 bg-surface/80 px-3 py-1 text-xs font-semibold text-primary-800 shadow-xs backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-accent-600" />
            </span>
            Now live in Pune &amp; Ahmednagar
          </span>
          <h1
            id="hero-title"
            className="animate-fade-up text-4xl leading-[1.08] font-extrabold text-primary-800 [animation-delay:80ms] sm:text-5xl lg:text-[3.4rem]"
          >
            Everything you need
            <br />
            around your{' '}
            <span className="animate-gradient bg-linear-to-r from-accent-600 via-accent-400 to-primary-600 bg-[length:200%_auto] bg-clip-text text-transparent">
              campus.
            </span>
          </h1>
          <p className="max-w-md animate-fade-up text-lg leading-relaxed text-body [animation-delay:160ms]">
            Messes, PGs, xerox shops, libraries and more around your college: with real distances,
            and ordering, printing and booking straight from your phone.
          </p>
          <div className="flex animate-fade-up flex-wrap gap-3 [animation-delay:240ms]">
            <Link href={ROUTES.colleges} className={CTA_CLASSES}>
              Explore your campus
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link href={ROUTES.registerBusiness} className={CTA_OUTLINE_CLASSES}>
              List your business
            </Link>
          </div>

          {live ? (
            <div className="flex animate-fade-up flex-wrap items-center gap-x-8 gap-y-4 pt-2 [animation-delay:320ms]">
              <Stat value={stats.colleges ?? 0} label="colleges" />
              <span className="h-10 w-px bg-line" aria-hidden="true" />
              <Stat value={stats.places ?? 0} label="places listed" />
              <span className="hidden h-10 w-px bg-line sm:block" aria-hidden="true" />
              <p className="flex max-w-48 items-center gap-2 text-xs font-medium text-body">
                <Icon name="users" className="size-5 text-primary-600" />
                Built for students, by your campus community.
              </p>
            </div>
          ) : (
            <p className="flex animate-fade-up items-center gap-2 text-sm font-medium text-body [animation-delay:320ms]">
              <Icon name="users" className="size-5 text-primary-600" />
              Built for students. Powered by your campus community.
            </p>
          )}
        </div>

        <div className="relative animate-fade-up [animation-delay:200ms]">
          {/* A soft glow under the map card. */}
          <div
            aria-hidden="true"
            className="absolute inset-6 -z-10 rounded-[32px] bg-linear-to-br from-primary-400/30 to-accent-400/25 blur-2xl"
          />
          <CampusMap
            pins={HERO_PINS}
            animated
            className="aspect-[4/3.2] w-full min-w-0 rounded-[28px] shadow-xl ring-1 ring-line transition-transform duration-700 ease-out hover:scale-[1.01]"
          />
        </div>
      </Container>

      <Container className="relative animate-fade-up pb-16 [animation-delay:380ms]">
        <CampusSearch colleges={colleges} />
      </Container>
    </section>
  );
}
