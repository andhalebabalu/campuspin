import type { PlaceCard } from '@platform/contracts';
import Link from 'next/link';
import { VerifiedBadge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { BRAND } from '@/constants/brand';
import { ROUTES } from '@/constants/routes';
import { CampusMap, type MapPin } from '@/features/landing/components/campus-map';
import {
  Container,
  CTA_CLASSES,
  IconChip,
  SectionHeading,
} from '@/features/landing/components/primitives';
import { CATEGORY_TILES, HOW_IT_WORKS } from '@/features/landing/lib/landing-content';
import { searchHref } from '@/features/search/lib/search-filters';
import { formatPrice } from '@/utils/format-price';

export function HowItWorksSection() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 py-20">
      <Container className="grid gap-10 lg:grid-cols-[0.8fr_2fr] lg:items-center">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title={`Your campus. One platform.`}
          lead={`From finding a room to your daily mess and printing shop, ${BRAND.name} makes campus life simpler, faster and better.`}
        />

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              className="relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs"
            >
              <IconChip icon={step.icon} tone={step.tone} />
              <span className="font-display text-sm font-bold text-accent-600">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-base font-bold text-primary-800">{step.title}</h3>
              <p className="text-sm leading-relaxed text-body">{step.body}</p>
              {index < HOW_IT_WORKS.length - 1 && (
                <Icon
                  name="arrowRight"
                  className="absolute top-8 -right-3.5 hidden size-4 text-neutral-400 lg:block"
                />
              )}
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function CategoryGridSection() {
  return (
    <section
      id="categories"
      aria-labelledby="categories-title"
      className="scroll-mt-20 border-y border-line bg-surface py-20"
    >
      <Container className="flex flex-col gap-10">
        <SectionHeading
          id="categories-title"
          eyebrow="Categories"
          title="Explore everything around you"
        />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORY_TILES.map((tile) => (
            <li key={tile.label}>
              <Link
                href={searchHref({ category: tile.slug ?? '' })}
                className="group flex h-full flex-col items-center gap-3 rounded-xl border border-line bg-surface px-3 py-6 text-center transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-md"
              >
                <IconChip
                  icon={tile.icon}
                  tone={tile.tone}
                  size="lg"
                  className="!rounded-full transition-transform group-hover:scale-110"
                />
                <span className="text-sm font-bold text-primary-800">{tile.label}</span>
                <span className="text-xs leading-snug text-muted">{tile.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

const MAP_PINS: MapPin[] = [
  { label: 'Hostel', icon: 'building', tone: 'blue', slug: 'hostels', x: 26, y: 18 },
  { label: 'Library', icon: 'book', tone: 'teal', slug: 'libraries', x: 70, y: 16 },
  { label: 'Gym', icon: 'dumbbell', tone: 'violet', slug: 'gyms', x: 86, y: 42 },
  { label: 'Mess', icon: 'utensils', tone: 'amber', slug: 'mess', x: 16, y: 50 },
  { label: 'Medical', icon: 'medical', tone: 'rose', slug: 'medical', x: 76, y: 66 },
  { label: 'Printing', icon: 'printer', tone: 'blue', slug: 'printing', x: 20, y: 74 },
];

const SIDEBAR = CATEGORY_TILES.filter((tile) => tile.slug !== null).slice(0, 8);

function FeaturedPlace({ place }: { place: PlaceCard }) {
  return (
    <Link
      href={ROUTES.placeDetail(place.slug)}
      className="absolute right-3 bottom-3 left-3 flex items-center gap-3 rounded-lg bg-surface p-2.5 shadow-lg ring-1 ring-line transition-shadow hover:shadow-xl sm:left-auto sm:w-72"
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-50 text-primary-600">
        {place.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- no remote-image domains configured yet.
          <img src={place.coverImageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon name="store" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-ink">{place.name}</span>
          {place.verified && <VerifiedBadge />}
        </span>
        <span className="truncate text-xs text-muted">
          {place.primaryCategory?.name ?? 'Place'} · {place.city}
        </span>
        <span className="truncate text-xs font-semibold text-accent-600">
          {formatPrice(place.priceMin, place.priceMax, place.priceUnit)}
        </span>
      </span>
      <Icon name="chevronRight" className="size-4 text-muted" />
    </Link>
  );
}

export function MapDiscoverySection({ featured }: { featured: PlaceCard | null }) {
  return (
    <section aria-labelledby="map-title" className="py-20">
      <Container className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <SectionHeading
            id="map-title"
            eyebrow="Map discovery"
            title={
              <>
                Discover your campus,
                <br />
                beyond the classroom.
              </>
            }
            lead={`From your morning mess to your evening study spot, ${BRAND.name} helps you discover everything around your campus.`}
          />
          <Link href={ROUTES.colleges} className={`${CTA_CLASSES} w-fit`}>
            Explore nearby
            <Icon name="arrowRight" className="size-4" />
          </Link>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-body">
            <li className="flex items-center gap-2">
              <Icon name="pin" className="size-4 text-primary-600" /> Real locations
            </li>
            <li className="flex items-center gap-2">
              <Icon name="shield" className="size-4 text-primary-600" /> Verified information
            </li>
            <li className="flex items-center gap-2">
              <Icon name="tag" className="size-4 text-primary-600" /> Clear prices
            </li>
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-4 border-b border-line px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset. */}
            <img src="/logo.png" alt="" className="hidden h-6 w-auto sm:block" />
            <Link
              href={ROUTES.search}
              className="flex h-9 flex-1 items-center gap-2 rounded-md bg-subtle px-3 text-sm text-muted hover:text-ink"
            >
              <Icon name="search" className="size-4" />
              Search nearby…
            </Link>
          </div>
          <div className="grid sm:grid-cols-[150px_1fr]">
            <ul className="hidden flex-col gap-0.5 border-r border-line p-2 sm:flex">
              {SIDEBAR.map((tile) => (
                <li key={tile.label}>
                  <Link
                    href={searchHref({ category: tile.slug ?? '' })}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-body hover:bg-subtle hover:text-ink"
                  >
                    <IconChip icon={tile.icon} tone={tile.tone} size="sm" className="!size-6 [&>svg]:!size-3.5" />
                    {tile.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={ROUTES.search}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-body hover:bg-subtle hover:text-ink"
                >
                  <IconChip icon="more" tone="blue" size="sm" className="!size-6 [&>svg]:!size-3.5" />
                  More
                </Link>
              </li>
            </ul>
            <div className="relative">
              <CampusMap pins={MAP_PINS} className="aspect-[4/3] w-full" />
              {featured && <FeaturedPlace place={featured} />}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
