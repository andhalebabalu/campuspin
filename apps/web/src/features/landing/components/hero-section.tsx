import type { CollegeCard } from '@platform/contracts';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { CampusSearch } from '@/features/landing/components/campus-search';
import { HeroPhone } from '@/features/landing/components/device-mockups';
import {
  Container,
  CTA_CLASSES,
  CTA_OUTLINE_CLASSES,
  HandNote,
  IconChip,
} from '@/features/landing/components/primitives';
import { HERO_MAP_LABELS } from '@/features/landing/lib/landing-content';
import { searchHref } from '@/features/search/lib/search-filters';

export interface HeroStats {
  colleges: number | null;
  places: number | null;
}

/** 4693 → "4,600+", 750 → "750+": a floor that stays true as the numbers grow. */
function atLeast(value: number): string {
  const step = value >= 1000 ? 100 : value >= 100 ? 50 : 10;
  return `${(Math.floor(value / step) * step || value).toLocaleString('en-IN')}+`;
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg font-extrabold text-primary-800">{value}</span>
        <span className="text-[11px] text-muted">{label}</span>
      </span>
    </div>
  );
}

/** A tilted street map: blocks, roads, a park, a lake. Decorative. */
function MapPlane() {
  return (
    <svg viewBox="0 0 400 300" className="size-full" aria-hidden="true">
      <rect width="400" height="300" rx="18" className="fill-primary-50" />
      {[
        [14, 14, 84, 56],
        [112, 14, 92, 56],
        [218, 14, 72, 56],
        [304, 14, 82, 56],
        [14, 96, 62, 76],
        [90, 96, 100, 32],
        [90, 140, 100, 32],
        [302, 96, 84, 76],
        [14, 200, 86, 86],
        [118, 200, 72, 86],
        [212, 228, 78, 58],
        [306, 200, 80, 86],
      ].map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="6" className="fill-white" />
      ))}
      <rect x="208" y="94" width="76" height="118" rx="10" className="fill-accent-50" />
      <circle cx="230" cy="120" r="8" className="fill-accent-400/30" />
      <circle cx="262" cy="152" r="10" className="fill-accent-400/30" />
      <circle cx="234" cy="186" r="7" className="fill-accent-400/30" />
      <path d="M0 262 Q 40 238 84 262 T 156 272 L156 300 L0 300Z" className="fill-primary-200/70" />
      {['M0 186 C 120 176 250 226 400 188', 'M200 0 C 194 90 206 180 196 300'].map((d) => (
        <g key={d}>
          <path d={d} className="stroke-primary-200" strokeWidth="10" fill="none" />
          <path d={d} className="stroke-white" strokeWidth="2" strokeDasharray="6 8" fill="none" />
        </g>
      ))}
      {/* Routes from the campus to the places around it. */}
      {[
        'M200 150 Q 230 110 250 60',
        'M200 150 Q 300 130 340 110',
        'M200 150 Q 150 210 150 250',
      ].map((d) => (
        <path
          key={d}
          d={d}
          className="fill-none stroke-accent-400"
          strokeWidth="2.5"
          strokeDasharray="4 6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Right half of the hero: the campus photo, the 3D map with its labels and the phone. */
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-[1/0.92] w-full max-w-xl lg:max-w-none">
      {/* The map, laid down in perspective. */}
      <div className="absolute right-0 bottom-[4%] w-[80%] [perspective:1100px]">
        <div className="aspect-[4/3] origin-bottom rounded-[22px] shadow-[0_40px_60px_-30px_rgb(4_35_73/0.5)] ring-1 ring-white/70 [transform:rotateX(52deg)_rotateZ(-28deg)]">
          <MapPlane />
        </div>
      </div>

      {/* The campus itself: a big navy pin standing on the map. */}
      <div className="absolute top-[38%] left-[58%] flex -translate-x-1/2 flex-col items-center">
        <span className="absolute top-10 size-24 animate-ping rounded-full bg-primary-400/20 [animation-duration:3s]" />
        <svg viewBox="0 0 48 60" className="relative h-20 w-16 drop-shadow-xl" aria-hidden="true">
          <path
            d="M24 2C12 2 3 11 3 23c0 15 21 34 21 34s21-19 21-34C45 11 36 2 24 2Z"
            className="fill-primary-800"
          />
          <circle cx="24" cy="23" r="8" className="fill-white" />
        </svg>
        <span className="mt-1 h-2 w-10 rounded-full bg-ink-900/25 blur-[2px]" />
      </div>

      {HERO_MAP_LABELS.map((pin, index) => (
        <Link
          key={`${pin.label}-${pin.distance}`}
          href={searchHref({ category: pin.slug })}
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, animationDelay: `${index * -1.2}s` }}
          className="absolute z-10 hidden -translate-x-1/2 animate-float items-center gap-2 rounded-xl bg-surface/95 px-2.5 py-2 shadow-lg ring-1 ring-line backdrop-blur transition-transform hover:scale-105 sm:flex"
        >
          <IconChip icon={pin.icon} tone={pin.tone} size="sm" />
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-bold text-primary-800">{pin.label}</span>
            <span className="text-[10px] text-muted">{pin.distance}</span>
          </span>
        </Link>
      ))}

      <HeroPhone className="absolute top-[2%] left-0 z-20 h-[80%] w-[42%] -rotate-[4deg] sm:left-[2%]" />

      <HandNote
        arrow="down-left"
        className="absolute top-[2%] right-[2%] hidden text-[1.7rem] sm:flex"
      >
        Your campus
        <br />
        &nbsp;&nbsp;nearby!
      </HandNote>
    </div>
  );
}

export function HeroSection({ colleges, stats }: { colleges: CollegeCard[]; stats: HeroStats }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      {/* Sky, and the campus building fading in from the right. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-linear-to-b from-primary-100/80 via-primary-50/60 to-canvas" />
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero photo. */}
        <img
          src="/images/hero/campus.jpg"
          alt=""
          className="absolute top-0 right-0 h-[78%] w-full object-cover object-[70%_40%] opacity-55 [mask-image:linear-gradient(to_bottom,black_45%,transparent),linear-gradient(to_right,transparent_15%,black_70%)] [mask-composite:intersect] lg:w-[68%] lg:opacity-70"
        />
        <div className="absolute inset-0 bg-linear-to-r from-canvas/95 via-canvas/40 to-transparent" />
      </div>

      <Container className="grid items-center gap-10 pt-10 pb-12 lg:grid-cols-[1.02fr_1fr] lg:pt-14">
        <div className="flex min-w-0 animate-fade-up flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary-200 bg-surface/90 px-3 py-1 text-xs font-semibold text-primary-800 shadow-xs">
            <Icon name="pin" className="size-3.5" />
            Student Focused • Ahilyanagar
          </span>
          <h1
            id="hero-title"
            className="text-4xl leading-[1.1] font-extrabold text-primary-800 sm:text-5xl lg:text-[3.15rem]"
          >
            <span className="sm:whitespace-nowrap">Everything you need</span>
            <br />
            around your
            <br />
            <span className="text-accent-600">campus.</span>
          </h1>
          <p className="max-w-md text-base leading-relaxed text-body sm:text-lg">
            Discover nearby essentials, connect with your community, find the best services and
            explore opportunities, all in one place.{' '}
            <span className="font-semibold text-primary-800">CampusPin</span> is your student
            companion, built for college life in Ahilyanagar (Ahmednagar) and Pune.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.register} className={CTA_CLASSES}>
              <Icon name="bell" className="size-4" />
              Get Started for Free
            </Link>
            <Link href="#features" className={CTA_OUTLINE_CLASSES}>
              Explore Features
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-7 gap-y-4 pt-1">
            {stats.places !== null && stats.places > 0 && (
              <Stat icon="store" value={atLeast(stats.places)} label="Nearby Places" />
            )}
            {stats.colleges !== null && stats.colleges > 0 && (
              <Stat icon="graduation" value={atLeast(stats.colleges)} label="Colleges" />
            )}
            <Stat icon="users" value="5K+" label="Students (Target)" />
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:150ms]">
          <HeroVisual />
        </div>
      </Container>

      <Container className="relative animate-fade-up pb-14 [animation-delay:300ms]">
        <CampusSearch colleges={colleges} />
      </Container>
    </section>
  );
}
