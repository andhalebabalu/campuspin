import type { CollegeCard } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
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
  { label: 'Printing', icon: 'printer', tone: 'blue', slug: 'printing', x: 24, y: 76 },
  { label: 'PG', icon: 'bed', tone: 'violet', slug: 'pg', x: 52, y: 88 },
];

export interface HeroStats {
  colleges: number | null;
  places: number | null;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-2xl font-extrabold text-primary-800">
        {value.toLocaleString('en-IN')}
      </span>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

export function HeroSection({ colleges, stats }: { colleges: CollegeCard[]; stats: HeroStats }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-linear-to-b from-primary-50 via-surface to-canvas"
    >
      <Container className="grid items-center gap-12 pt-12 pb-10 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="flex min-w-0 flex-col gap-6">
          <h1
            id="hero-title"
            className="text-4xl leading-[1.1] font-extrabold text-primary-800 sm:text-5xl lg:text-[3.4rem]"
          >
            Everything you need
            <br />
            around your <span className="text-accent-600">campus.</span>
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-body">
            Discover places, services, businesses and experiences around your campus, all in one
            place.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={ROUTES.colleges} className={CTA_CLASSES}>
              Explore your campus
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link href={ROUTES.registerBusiness} className={CTA_OUTLINE_CLASSES}>
              List your business
            </Link>
          </div>

          {stats.colleges !== null && stats.places !== null && stats.places > 0 ? (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2">
              <Stat value={stats.colleges} label="colleges" />
              <span className="h-10 w-px bg-line" aria-hidden="true" />
              <Stat value={stats.places} label="places listed" />
              <span className="hidden h-10 w-px bg-line sm:block" aria-hidden="true" />
              <p className="flex max-w-48 items-center gap-2 text-xs font-medium text-body">
                <Icon name="users" className="size-5 text-primary-600" />
                Built for students, by your campus community.
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-body">
              <Icon name="users" className="size-5 text-primary-600" />
              Built for students. Powered by your campus community.
            </p>
          )}
        </div>

        <CampusMap
          pins={HERO_PINS}
          className="aspect-[4/3.2] w-full min-w-0 rounded-[28px] shadow-lg ring-1 ring-line"
        />
      </Container>

      <Container className="relative pb-16">
        <CampusSearch colleges={colleges} />
      </Container>
    </section>
  );
}
