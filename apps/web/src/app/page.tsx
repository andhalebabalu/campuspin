import type { PlaceCard } from '@platform/contracts';
import type { Metadata } from 'next';
import { BRAND } from '@/constants/brand';
import { HeroSection } from '@/features/landing/components/hero-section';
import {
  BusinessSection,
  ExploreSection,
  StudentLifeSection,
  TestimonialsSection,
  WhySection,
} from '@/features/landing/components/home-sections';
import { LaunchBand } from '@/features/landing/components/launch-band';
import { NewAroundCampus } from '@/features/landing/components/new-around-campus';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: everything around your campus` },
  description: BRAND.description,
};

/**
 * The kinds of place shown under "New around campus", in order: the everyday student needs, each
 * with a photo. The newest place of each kind is shown, so the row is varied and real.
 */
const NEW_AROUND_KINDS = [
  'mess',
  'cafes',
  'rooms',
  'libraries',
  'hostels',
  'restaurants',
  'pg',
  'xerox',
  'reading-rooms',
  'gyms',
  'tiffin',
  'laundry',
];

async function newestOfEachKind(): Promise<PlaceCard[]> {
  const results = await Promise.all(
    NEW_AROUND_KINDS.map((categorySlug) =>
      placesService
        .list({ categorySlug, sort: 'newest', limit: 5 })
        // Demo seed listings (`demo-*`) carry placeholder photos: never on the landing page.
        .then((page) => page.data.find((place) => !place.slug.startsWith('demo-')) ?? null)
        .catch(() => null),
    ),
  );
  return results.filter((place): place is PlaceCard => place !== null);
}

/**
 * The landing page. Everything on it that looks like data is real (the college picker, the counts,
 * the places) and every tile, chip and map label links into a working page or search. Each fetch
 * fails soft: if the API is down the page still renders, just without the live bits.
 */
export default async function HomePage() {
  const [colleges, places, newest] = await Promise.all([
    collegesService.list({ sort: 'popular', limit: 50 }).catch(() => null),
    placesService.list({ limit: 1 }).catch(() => null),
    newestOfEachKind(),
  ]);

  return (
    <main className="flex-1">
      <HeroSection
        colleges={colleges?.data ?? []}
        stats={{
          colleges: colleges ? (colleges.meta?.total ?? colleges.data.length) : null,
          places: places ? (places.meta?.total ?? places.data.length) : null,
        }}
      />
      <WhySection />
      <StudentLifeSection />
      <ExploreSection />
      <NewAroundCampus places={newest} />
      <BusinessSection />
      <TestimonialsSection />
      <LaunchBand />
    </main>
  );
}
