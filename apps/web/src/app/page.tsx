import type { Metadata } from 'next';
import { BRAND } from '@/constants/brand';
import {
  BusinessSection,
  CtaBand,
  WhyUsSection,
} from '@/features/landing/components/closing-sections';
import {
  CommunitySection,
  MarketplaceSection,
} from '@/features/landing/components/community-sections';
import {
  CategoryGridSection,
  HowItWorksSection,
} from '@/features/landing/components/discovery-sections';
import { CollegeMarquee } from '@/features/landing/components/college-marquee';
import { HeroSection } from '@/features/landing/components/hero-section';
import {
  DailyServicesSection,
  LatestPlacesSection,
} from '@/features/landing/components/services-sections';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: everything around your campus` },
  description: BRAND.description,
};

/**
 * The landing page. Everything on it that looks like data is real (the college picker, the counts,
 * the newest places) and every tile, chip and map pin links into a working page or search. Each fetch
 * fails soft: if the API is down the page still renders, just without the live bits.
 */
/** Eight of the newest places, at most two of any one kind, so the strip shows the range. */
function variety<T extends { primaryCategory: { slug: string } | null }>(places: T[], count = 8): T[] {
  const perKind = new Map<string, number>();
  const picked: T[] = [];
  for (const place of places) {
    const kind = place.primaryCategory?.slug ?? 'other';
    if ((perKind.get(kind) ?? 0) >= 2) continue;
    perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
    picked.push(place);
    if (picked.length === count) break;
  }
  return picked;
}

export default async function HomePage() {
  const [colleges, places] = await Promise.all([
    collegesService.list({ sort: 'popular', limit: 50 }).catch(() => null),
    placesService.list({ sort: 'newest', limit: 50 }).catch(() => null),
  ]);

  // Most places around first: the picker's "Popular colleges" and the moving strip.
  const popular = colleges?.data ?? [];

  return (
    <main className="flex-1">
      <HeroSection
        colleges={popular}
        stats={{
          colleges: colleges ? (colleges.meta?.total ?? colleges.data.length) : null,
          places: places ? (places.meta?.total ?? places.data.length) : null,
        }}
      />
      <CollegeMarquee colleges={popular} />
      <HowItWorksSection />
      <CategoryGridSection />
      <LatestPlacesSection places={variety(places?.data ?? [])} />
      <DailyServicesSection />
      <CommunitySection />
      <MarketplaceSection />
      <BusinessSection />
      <WhyUsSection />
      <CtaBand />
    </main>
  );
}
